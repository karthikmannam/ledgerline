import { Router, type Request, type Response } from 'express';
import { withTransaction, query } from '../db/pool.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { toMoneyString } from '../lib/money.js';
import { canViewAccount } from '../services/authz.js';

const router = Router();
router.use(requireAuth);

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const tx = await query('SELECT * FROM journal_transactions WHERE id=$1', [id]);
  if (!tx.rows[0]) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    return;
  }
  const postings = await query(
    'SELECT ledger_account_id, side, amount_paise FROM journal_postings WHERE transaction_id=$1 ORDER BY side',
    [id]
  );
  const actor = req.actor!;
  if (actor.role !== 'admin' && actor.role !== 'auditor') {
    // holder may view only transactions touching authorized accounts
    let allowed = false;
    for (const p of postings.rows) {
      const ok = await withTransaction(async (c) => canViewAccount(c as never, { id: actor.id, role: actor.role } as never, String(p.ledger_account_id)));
      if (ok) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access to transaction' } });
      return;
    }
  }
  res.json({
    id: String(tx.rows[0].id),
    type: String(tx.rows[0].type),
    status: String(tx.rows[0].status),
    reversalOf: tx.rows[0].reversal_of ? String(tx.rows[0].reversal_of) : null,
    postings: postings.rows.map((p) => ({ account: String(p.ledger_account_id), side: String(p.side), amount: toMoneyString(String(p.amount_paise)) }))
  });
});

router.post('/:id/reverse', requireCsrf, async (req: Request, res: Response): Promise<void> => {
  if (req.actor?.role === 'auditor') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Auditor is read-only' } });
    return;
  }
  const id = String(req.params.id);
  const actor = req.actor!;
  const schema = (await import('zod')).z.object({ reason: (await import('zod')).z.string().min(1).max(500).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid reversal input' } });
    return;
  }
  try {
    const body = await withTransaction(async (client) => {
      const tx = await client.query('SELECT * FROM journal_transactions WHERE id=$1', [id]);
      if (!tx.rows[0]) throw Object.assign(new Error('nf'), { http: 404, code: 'NOT_FOUND' });
      // K3: reversal requires administrator (enforced in DB function too)
      if (actor.role !== 'admin') {
        throw Object.assign(new Error('f'), { http: 403, code: 'FORBIDDEN' });
      }
      let newTx: string;
      try {
        const r = await client.query('SELECT post_reversal($1,$2,$3::jsonb,$4) AS tx', [
          id,
          actor.id,
          JSON.stringify({ reason: parsed.data.reason ?? '' }),
          actor.sessionToken
        ]);
        newTx = String(r.rows[0].tx);
      } catch (e) {
        const msg = String((e as Error).message ?? '');
        if (msg.includes('duplicate_reversal')) throw Object.assign(new Error('dup'), { http: 409, code: 'DUPLICATE_REVERSAL' });
        if (msg.includes('cannot_reverse_reversal')) throw Object.assign(new Error('rev'), { http: 409, code: 'CANNOT_REVERSE_REVERSAL' });
        if (msg.includes('insufficient_funds')) throw Object.assign(new Error('ins'), { http: 422, code: 'INSUFFICIENT_FUNDS' });
        throw e;
      }
      await audit(client, actor.id, 'transaction.reverse', 'journal', id, { reversal: newTx });
      return { reversal: newTx };
    });
    res.json(body);
  } catch (err) {
    const e = err as { http?: number; code?: string };
    if (e.http === 404) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
      return;
    }
    if (e.http === 403) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access' } });
      return;
    }
    if (e.http === 409 || e.http === 422) {
      res.status(e.http).json({ error: { code: e.code ?? 'CONFLICT', message: 'Reversal failed' } });
      return;
    }
    throw err;
  }
});

export default router;
