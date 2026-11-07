import type pg from 'pg';

export async function canViewAccount(
  client: pg.PoolClient,
  actor: { id: string; role: string },
  accountId: string
): Promise<boolean> {
  if (actor.role === 'admin' || actor.role === 'auditor') return true;
  const res = await client.query('SELECT owner_user_id FROM ledger_accounts WHERE id=$1', [accountId]);
  if (!res.rows[0]) return false;
  if (String(res.rows[0].owner_user_id) === actor.id) return true;
  const perm = await client.query(
    `SELECT 1 FROM account_permissions WHERE ledger_account_id=$1 AND user_id=$2 AND permission='view'`,
    [accountId, actor.id]
  );
  return perm.rowCount !== null && perm.rowCount > 0;
}

export async function hasPermission(
  client: pg.PoolClient,
  actorId: string,
  accountId: string,
  permission: 'view' | 'withdraw' | 'transfer_out'
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM account_permissions WHERE ledger_account_id=$1 AND user_id=$2 AND permission=$3`,
    [accountId, actorId, permission]
  );
  if (res.rowCount && res.rowCount > 0) return true;
  const owner = await client.query('SELECT owner_user_id FROM ledger_accounts WHERE id=$1', [accountId]);
  return !!owner.rows[0] && String(owner.rows[0].owner_user_id) === actorId;
}

export async function recordAttempt(
  client: pg.PoolClient,
  actorId: string | null,
  endpoint: string,
  code: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO attempts(actor_id, endpoint, code, details) VALUES($1,$2,$3,$4::jsonb)`,
    [actorId, endpoint, code, JSON.stringify(details)]
  );
}
