import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePaise, toMoneyString } from '../lib/money.js';
import { getSystemAccounts, postJournalSavepoint, requestHashOf, getBalance } from '../services/ledger.js';
import { hasPermission, recordAttempt } from '../services/authz.js';

const router = Router();

function conflict(res: Response) {
  res.status(409).json({ error: { code: 'CONFLICT', message: 'Idempotency key reused with different payload' } });
}

async function idempotencyLookup(
  client: import('pg').PoolClient,
  actorId: string,
  key: string,
  hash: string
): Promise<{ kind: 'new' } | { kind: 'replay'; status: number; body: unknown } | { kind: 'conflict' }> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${actorId}|${key}`]);
  const res = await client.query('SELECT request_hash, response_status, response_body FROM idempotency_records WHERE actor_id=$1 AND idempotency_key=$2', [
    actorId,
    key
  ]);
  if (!res.rows[0]) return { kind: 'new' };
  if (String(res.rows[0].request_hash) !== hash) return { kind: 'conflict' };
  return { kind: 'replay', status: Number(res.rows[0].response_status), body: res.rows[0].response_body };
}

function assertAccountActive(
  row: { status?: unknown; kind?: unknown } | undefined
): void {
  if (!row || String(row.status) !== 'active' || String(row.kind) !== 'customer') {
    throw Object.assign(new Error('not_active'), { http: 400, code: 'ACCOUNT_NOT_ACTIVE' });
  }
}

const common = z.object({
  idempotencyKey: z.string().min(1).max(200),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().default('INR')
});

// ---- withdrawals ----
router.post('/withdrawals', requireAuth, requireCsrf, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  if (actor.role === 'auditor') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Auditor is read-only' } });
    return;
  }
  const schema = common.extend({ accountId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || parsed.data.currency !== 'INR') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid withdrawal input' } });
    return;
  }
  const amount = parsePaise(parsed.data.amount);
  if (!amount) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid amount' } });
    return;
  }
  const hash = requestHashOf({ endpoint: 'withdrawals', accountId: parsed.data.accountId, amount: amount.toString() });
  try {
    const result = await withTransaction(async (client) => {
      // deterministic order single account; still acquire lock via function ordering
      const existing = await idempotencyLookup(client, actor.id, parsed.data.idempotencyKey, hash);
      if (existing.kind === 'replay') return { replay: existing };
      if (existing.kind === 'conflict') return { conflict: true as const };

      if (!(await hasPermission(client, actor.id, parsed.data.accountId, 'withdraw'))) {
        await recordAttempt(client, actor.id, 'withdrawals', 'FORBIDDEN_ACCOUNT');
        const body = { error: { code: 'FORBIDDEN', message: 'No withdraw permission' } };
        await client.query(
          `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body)
           VALUES($1,$2,$3,403,$4::jsonb) ON CONFLICT DO NOTHING`,
          [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body)]
        );
        return { refusal: { status: 403, body } };
      }
      const _acctRow = (await client.query('SELECT status, kind FROM ledger_accounts WHERE id=$1', [parsed.data.accountId])).rows[0];
      assertAccountActive(_acctRow);
      const { clearing } = await getSystemAccounts(client);
      const posted = await postJournalSavepoint(client, {
        type: 'withdrawal',
        externalReference: null,
        debitAccount: parsed.data.accountId,
        creditAccount: clearing,
        amount,
        actor: actor.id, sessionHash: actor.sessionToken,
        metadata: { endpoint: 'withdrawals' }
      });
      if (!posted.ok) {
        if (posted.code === 'insufficient_funds') {
          await recordAttempt(client, actor.id, 'withdrawals', 'INSUFFICIENT_FUNDS');
          const body = { error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' } };
          await client.query(
            `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body,transaction_id)
             VALUES($1,$2,$3,422,$4::jsonb,NULL) ON CONFLICT DO NOTHING`,
            [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body)]
          );
          return { refusal: { status: 422, body } };
        }
        throw new Error('posting_failed');
      }
      const tx = posted.tx;
      const balance = await getBalance(client, parsed.data.accountId);
      const body = { transaction: tx, balance: toMoneyString(balance), currency: 'INR' };
      await client.query(
        `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body,transaction_id)
         VALUES($1,$2,$3,200,$4::jsonb,$5) ON CONFLICT DO NOTHING`,
        [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body), tx]
      );
      await audit(client, actor.id, 'withdrawal.post', 'journal', tx, { account: parsed.data.accountId });
      return { ok: body };
    });
    if ('replay' in result) {
      res.status(result.replay.status).json(result.replay.body);
      return;
    }
    if ('conflict' in result) {
      conflict(res);
      return;
    }
    if ('refusal' in result) {
      res.status(result.refusal.status).json(result.refusal.body);
      return;
    }
    res.json((result as { ok: unknown }).ok);
  } catch (err) {
    const e = err as { http?: number; code?: string };
    if (e.code === 'ACCOUNT_NOT_ACTIVE') {
      res.status(400).json({ error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Account is not active' } });
      return;
    }
    throw err;
  }
});

// ---- transfers ----
router.post('/transfers', requireAuth, requireCsrf, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  if (actor.role === 'auditor') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Auditor is read-only' } });
    return;
  }
  const schema = common.extend({ fromAccountId: z.string().uuid(), toAccountId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || parsed.data.currency !== 'INR') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid transfer input' } });
    return;
  }
  if (parsed.data.fromAccountId === parsed.data.toAccountId) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot transfer to same account' } });
    return;
  }
  const amount = parsePaise(parsed.data.amount);
  if (!amount) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid amount' } });
    return;
  }
  const hash = requestHashOf({
    endpoint: 'transfers',
    from: parsed.data.fromAccountId,
    to: parsed.data.toAccountId,
    amount: amount.toString()
  });
  try {
    const result = await withTransaction(async (client) => {
      const existing = await idempotencyLookup(client, actor.id, parsed.data.idempotencyKey, hash);
      if (existing.kind === 'replay') return { replay: existing };
      if (existing.kind === 'conflict') return { conflict: true as const };
      if (!(await hasPermission(client, actor.id, parsed.data.fromAccountId, 'transfer_out'))) {
        await recordAttempt(client, actor.id, 'transfers', 'FORBIDDEN_ACCOUNT');
        const body = { error: { code: 'FORBIDDEN', message: 'No transfer permission' } };
        await client.query(
          `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body)
           VALUES($1,$2,$3,403,$4::jsonb) ON CONFLICT DO NOTHING`,
          [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body)]
        );
        return { refusal: { status: 403, body } };
      }
      // deterministic sorted lock order handled inside post_journal_atomic (ORDER BY id FOR UPDATE)
      assertAccountActive((await client.query('SELECT status, kind FROM ledger_accounts WHERE id=$1', [parsed.data.fromAccountId])).rows[0]);
      assertAccountActive((await client.query('SELECT status, kind FROM ledger_accounts WHERE id=$1', [parsed.data.toAccountId])).rows[0]);
      const posted = await postJournalSavepoint(client, {
        type: 'transfer',
        externalReference: null,
        debitAccount: parsed.data.fromAccountId,
        creditAccount: parsed.data.toAccountId,
        amount,
        actor: actor.id, sessionHash: actor.sessionToken,
        metadata: { endpoint: 'transfers' }
      });
      if (!posted.ok) {
        if (posted.code === 'insufficient_funds') {
          await recordAttempt(client, actor.id, 'transfers', 'INSUFFICIENT_FUNDS');
          const body = { error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' } };
          await client.query(
            `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body)
             VALUES($1,$2,$3,422,$4::jsonb) ON CONFLICT DO NOTHING`,
            [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body)]
          );
          return { refusal: { status: 422, body } };
        }
        throw new Error('posting_failed');
      }
      const tx = posted.tx;
      const fromBal = await getBalance(client, parsed.data.fromAccountId);
      const toBal = await getBalance(client, parsed.data.toAccountId);
      const body = { transaction: tx, fromBalance: toMoneyString(fromBal), toBalance: toMoneyString(toBal), currency: 'INR' };
      await client.query(
        `INSERT INTO idempotency_records(actor_id,idempotency_key,request_hash,response_status,response_body,transaction_id)
         VALUES($1,$2,$3,200,$4::jsonb,$5) ON CONFLICT DO NOTHING`,
        [actor.id, parsed.data.idempotencyKey, hash, JSON.stringify(body), tx]
      );
      await audit(client, actor.id, 'transfer.post', 'journal', tx);
      return { ok: body };
    });
    if ('replay' in result) {
      res.status(result.replay.status).json(result.replay.body);
      return;
    }
    if ('conflict' in result) {
      conflict(res);
      return;
    }
    if ('refusal' in result) {
      res.status(result.refusal.status).json(result.refusal.body);
      return;
    }
    res.json((result as { ok: unknown }).ok);
  } catch (err) {
    const e = err as { http?: number; code?: string };
    if (e.code === 'ACCOUNT_NOT_ACTIVE') {
      res.status(400).json({ error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Account is not active' } });
      return;
    }
    throw err;
  }
});

export default router;
