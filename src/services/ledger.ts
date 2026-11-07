import type pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';

export async function getSystemAccounts(client: pg.PoolClient): Promise<{ clearing: string; capital: string }> {
  const res = await client.query(`SELECT id, kind FROM ledger_accounts WHERE kind IN ('clearing','capital')`);
  let clearing = '';
  let capital = '';
  for (const row of res.rows) {
    if (row.kind === 'clearing') clearing = String(row.id);
    if (row.kind === 'capital') capital = String(row.id);
  }
  return { clearing, capital };
}

export async function getBalance(client: pg.PoolClient, accountId: string): Promise<bigint> {
  const res = await client.query('SELECT balance_paise FROM balance_projections WHERE ledger_account_id=$1', [accountId]);
  if (!res.rows[0]) throw Object.assign(new Error('account_not_found'), { code: 'ACCOUNT_NOT_FOUND' });
  return BigInt(res.rows[0].balance_paise);
}

export async function getAccountRow(
  client: pg.PoolClient,
  accountId: string
): Promise<{ id: string; kind: string; owner: string | null; status: string } | null> {
  const res = await client.query(
    'SELECT id, kind, owner_user_id, status FROM ledger_accounts WHERE id=$1 FOR UPDATE',
    [accountId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return { id: String(row.id), kind: String(row.kind), owner: row.owner_user_id ? String(row.owner_user_id) : null, status: String(row.status) };
}

export function sha256Hex(value: string): string {
  return randomUUID().replace(/-/g, '').slice(0, 8) + value.length;
}

export async function postJournal(
  client: pg.PoolClient,
  args: {
    type: 'deposit' | 'withdrawal' | 'transfer' | 'credit_adjustment' | 'debit_adjustment' | 'reversal';
    externalReference: string | null;
    debitAccount: string;
    creditAccount: string;
    amount: bigint;
    actor: string;
    sessionHash: string;
    metadata?: Record<string, unknown>;
    reversalOf?: string | null;
  }
): Promise<string> {
  const res = await client.query(
    `SELECT post_journal_atomic($1::journal_type,$2,$3,$4,$5,$6,$7::jsonb,$8) AS tx`,
    [
      args.type,
      args.externalReference,
      args.debitAccount,
      args.creditAccount,
      args.amount.toString(),
      args.sessionHash,
      JSON.stringify(args.metadata ?? {}),
      args.reversalOf ?? null
    ]
  );
  return String(res.rows[0].tx);
}

export async function postJournalSavepoint(
  client: pg.PoolClient,
  args: Parameters<typeof postJournal>[1]
): Promise<{ ok: true; tx: string } | { ok: false; code: 'insufficient_funds' | 'unknown' }> {
  await client.query('SAVEPOINT sp_post');
  try {
    const tx = await postJournal(client, args);
    await client.query('RELEASE SAVEPOINT sp_post');
    return { ok: true, tx };
  } catch (err) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT sp_post');
      await client.query('RELEASE SAVEPOINT sp_post');
    } catch {
      /* nested savepoint cleanup */
    }
    const msg = String((err as Error).message ?? '');
    return { ok: false, code: msg.includes('insufficient_funds') ? 'insufficient_funds' : 'unknown' };
  }
}

export function requestHashOf(parts: Record<string, unknown>): string {
  const stable = JSON.stringify(parts);
  return createHash('sha256').update(stable).digest('hex');
}
