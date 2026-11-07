import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requireCsrf, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePaise, toMoneyString } from '../lib/money.js';
import { getSystemAccounts, postJournal } from '../services/ledger.js';
import { recordAttempt } from '../services/authz.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.post('/', requireCsrf, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    accountId: z.string().uuid(),
    direction: z.enum(['credit', 'debit']),
    amount: z.union([z.string(), z.number()]),
    reason: z.string().min(1).max(500),
    reference: z.string().min(1).max(200)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid adjustment input' } });
    return;
  }
  const amount = parsePaise(parsed.data.amount);
  if (!amount) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid amount' } });
    return;
  }
  const actor = req.actor!;
  try {
    const id = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO adjustment_requests(ledger_account_id, direction, amount_paise, reason, reference, maker_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [parsed.data.accountId, parsed.data.direction, amount.toString(), parsed.data.reason, parsed.data.reference, actor.id]
      );
      const newId = String(inserted.rows[0].id);
      await audit(client, actor.id, 'adjustment.request', 'adjustment_request', newId);
      return newId;
    });
    res.status(201).json({ id });
  } catch (err) {
    if (String((err as { code?: string }).code) === '23505') {
      res.status(409).json({ error: { code: 'DUPLICATE_REFERENCE', message: 'Reference already used' } });
      return;
    }
    throw err;
  }
});

router.post('/:id/approve', requireCsrf, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const actor = req.actor!;
  try {
    const body = await withTransaction(async (client) => {
      const adj = await client.query('SELECT * FROM adjustment_requests WHERE id=$1 FOR UPDATE', [id]);
      if (!adj.rows[0]) throw Object.assign(new Error('nf'), { http: 404, code: 'NOT_FOUND' });
      const row = adj.rows[0];
      if (String(row.status) !== 'pending') {
        throw Object.assign(new Error('state'), { http: 409, code: 'ALREADY_REVIEWED' });
      }
      if (String(row.maker_id) === actor.id) {
        await recordAttempt(client, actor.id, 'adjustment.approve', 'MAKER_EQUALS_CHECKER');
        throw Object.assign(new Error('maker'), { http: 403, code: 'MAKER_EQUALS_CHECKER' });
      }
      const { capital } = await getSystemAccounts(client);
      const type = String(row.direction) === 'credit' ? 'credit_adjustment' : 'debit_adjustment';
      const debit = type === 'credit_adjustment' ? capital : String(row.ledger_account_id);
      const credit = type === 'credit_adjustment' ? String(row.ledger_account_id) : capital;
      let tx: string;
      try {
        tx = await postJournal(client, {
          type: type as never,
          externalReference: null,
          debitAccount: debit,
          creditAccount: credit,
          amount: BigInt(String(row.amount_paise)),
          actor: actor.id, sessionHash: actor.sessionToken,
          metadata: { adjustment: id, reason: String(row.reason) }
        });
      } catch (e) {
        if (String((e as Error).message).includes('insufficient_funds')) {
          throw Object.assign(new Error('ins'), { http: 422, code: 'INSUFFICIENT_FUNDS' });
        }
        throw e;
      }
      await client.query(
        `UPDATE adjustment_requests SET status='approved', checker_id=$1, journal_transaction_id=$2, reviewed_at=now() WHERE id=$3`,
        [actor.id, tx, id]
      );
      await audit(client, actor.id, 'adjustment.approve', 'adjustment_request', id, { transaction: tx });
      const bal = await client.query('SELECT balance_paise FROM balance_projections WHERE ledger_account_id=$1', [String(row.ledger_account_id)]);
      return { transaction: tx, balance: toMoneyString(String(bal.rows[0]?.balance_paise ?? 0)) };
    });
    res.json(body);
  } catch (err) {
    const e = err as { http?: number; code?: string };
    if (e.http === 404) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Adjustment not found' } });
      return;
    }
    if (e.http === 403 || e.http === 409 || e.http === 422) {
      res.status(e.http).json({ error: { code: e.code ?? 'CONFLICT', message: 'Adjustment failed' } });
      return;
    }
    throw err;
  }
});

export default router;
