import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requireCsrf, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePaise, toMoneyString } from '../lib/money.js';
import { getSystemAccounts, postJournal } from '../services/ledger.js';
import { recordAttempt } from '../services/authz.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
  if (actor.role === 'admin') {
    const rows = await withTransaction(async (client) =>
      client.query(
        `SELECT dr.id, dr.ledger_account_id, dr.amount_paise, dr.external_reference, dr.status, dr.maker_id, dr.checker_id, dr.created_at
         FROM deposit_requests dr
         ORDER BY dr.created_at DESC
         LIMIT $1`,
        [limit]
      )
    );
    res.json({ deposits: rows.rows.map((row) => ({ id: String(row.id), accountId: String(row.ledger_account_id), amount: toMoneyString(String(row.amount_paise)), externalReference: String(row.external_reference), status: String(row.status), makerId: row.maker_id ? String(row.maker_id) : null, checkerId: row.checker_id ? String(row.checker_id) : null, createdAt: row.created_at })) });
    return;
  }
  const rows = await withTransaction(async (client) =>
    client.query(
      `SELECT dr.id, dr.ledger_account_id, dr.amount_paise, dr.external_reference, dr.status, dr.maker_id, dr.checker_id, dr.created_at
       FROM deposit_requests dr
       JOIN ledger_accounts a ON a.id = dr.ledger_account_id
       WHERE dr.maker_id = $1
          OR a.owner_user_id = $1
          OR EXISTS (
            SELECT 1 FROM account_permissions ap
            WHERE ap.ledger_account_id = dr.ledger_account_id
              AND ap.user_id = $1
              AND ap.permission = 'view'
          )
       ORDER BY dr.created_at DESC
       LIMIT $2`,
      [actor.id, limit]
    )
  );
  res.json({ deposits: rows.rows.map((row) => ({ id: String(row.id), accountId: String(row.ledger_account_id), amount: toMoneyString(String(row.amount_paise)), externalReference: String(row.external_reference), status: String(row.status), makerId: row.maker_id ? String(row.maker_id) : null, checkerId: row.checker_id ? String(row.checker_id) : null, createdAt: row.created_at })) });
});

router.post('/', requireCsrf, async (req: Request, res: Response): Promise<void> => {
  if (req.actor?.role === 'auditor') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Auditor is read-only' } });
    return;
  }
  const schema = z.object({
    accountId: z.string().uuid(),
    amount: z.union([z.string(), z.number()]),
    externalReference: z.string().min(1).max(200),
    evidence: z.record(z.string(), z.unknown()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid deposit input' } });
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
      const owner = await client.query('SELECT owner_user_id, status FROM ledger_accounts WHERE id=$1', [parsed.data.accountId]);
      if (!owner.rows[0]) throw Object.assign(new Error('nf'), { http: 404, code: 'NOT_FOUND' });
      if (String(owner.rows[0].status) !== 'active') throw Object.assign(new Error('not_active'), { http: 400, code: 'ACCOUNT_NOT_ACTIVE' });
      // maker must have view to target (holder) or be admin
      if (actor.role !== 'admin' && String(owner.rows[0].owner_user_id) !== actor.id) {
        const perm = await client.query(
          `SELECT 1 FROM account_permissions WHERE ledger_account_id=$1 AND user_id=$2 AND permission='view'`,
          [parsed.data.accountId, actor.id]
        );
        if (!perm.rows[0]) throw Object.assign(new Error('f'), { http: 403, code: 'FORBIDDEN' });
      }
      const inserted = await client.query(
        `INSERT INTO deposit_requests(ledger_account_id, amount_paise, external_reference, evidence, maker_id)
         VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id`,
        [parsed.data.accountId, amount.toString(), parsed.data.externalReference, JSON.stringify(parsed.data.evidence ?? {}), actor.id]
      );
      const newId = String(inserted.rows[0].id);
      await audit(client, actor.id, 'deposit.request', 'deposit_request', newId);
      return newId;
    });
    res.status(201).json({ id });
  } catch (err) {
    const e = err as { code?: string; http?: number };
    if (e.code === '23505') {
      res.status(409).json({ error: { code: 'DUPLICATE_EXTERNAL_REFERENCE', message: 'External reference already used' } });
      return;
    }
    if (e.code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
      return;
    }
    if (e.code === 'FORBIDDEN') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access' } });
      return;
    }
    throw err;
  }
});

router.post('/:id/verify-and-post', requireCsrf, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const actor = req.actor!;
  try {
    const body = await withTransaction(async (client) => {
      const dep = await client.query('SELECT * FROM deposit_requests WHERE id=$1 FOR UPDATE', [id]);
      if (!dep.rows[0]) throw Object.assign(new Error('nf'), { http: 404, code: 'NOT_FOUND' });
      const row = dep.rows[0];
      if (String(row.status) !== 'pending') {
        await recordAttempt(client, actor.id, 'deposit.verify', 'ALREADY_REVIEWED');
        throw Object.assign(new Error('state'), { http: 409, code: 'ALREADY_REVIEWED' });
      }
      if (String(row.maker_id) === actor.id) {
        await recordAttempt(client, actor.id, 'deposit.verify', 'MAKER_EQUALS_CHECKER');
        throw Object.assign(new Error('maker'), { http: 403, code: 'MAKER_EQUALS_CHECKER' });
      }
      const owner = await client.query('SELECT owner_user_id FROM ledger_accounts WHERE id=$1', [String(row.ledger_account_id)]);
      if (owner.rows[0] && String(owner.rows[0].owner_user_id) === actor.id) {
        await recordAttempt(client, actor.id, 'deposit.verify', 'CHECKER_IS_HOLDER');
        throw Object.assign(new Error('holder'), { http: 403, code: 'CHECKER_IS_HOLDER' });
      }
      const { clearing } = await getSystemAccounts(client);
      let tx: string;
      try {
        tx = await postJournal(client, {
          type: 'deposit',
          externalReference: String(row.external_reference),
          debitAccount: clearing,
          creditAccount: String(row.ledger_account_id),
          amount: BigInt(String(row.amount_paise)),
          actor: actor.id, sessionHash: actor.sessionToken,
          metadata: { deposit: id }
        });
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
          throw Object.assign(new Error('dup'), { http: 409, code: 'DUPLICATE_EXTERNAL_REFERENCE' });
        }
        throw e;
      }
      await client.query(
        `UPDATE deposit_requests SET status='verified', checker_id=$1, journal_transaction_id=$2, reviewed_at=now() WHERE id=$3`,
        [actor.id, tx, id]
      );
      await audit(client, actor.id, 'deposit.verify', 'deposit_request', id, { transaction: tx });
      const bal = await client.query('SELECT balance_paise FROM balance_projections WHERE ledger_account_id=$1', [String(row.ledger_account_id)]);
      return { transaction: tx, balance: toMoneyString(String(bal.rows[0]?.balance_paise ?? 0)) };
    });
    res.json(body);
  } catch (err) {
    const e = err as { http?: number; code?: string };
    if (e.http === 404) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
      return;
    }
    if (e.http === 409) {
      res.status(409).json({ error: { code: e.code ?? 'CONFLICT', message: 'Conflict' } });
      return;
    }
    if (e.http === 403) {
      res.status(403).json({ error: { code: e.code ?? 'FORBIDDEN', message: 'Maker-checker violation' } });
      return;
    }
    throw err;
  }
});

export default router;
