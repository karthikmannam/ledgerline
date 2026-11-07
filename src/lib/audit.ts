import type pg from 'pg';

export async function audit(
  client: pg.PoolClient | { query: unknown },
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const c = client as pg.PoolClient;
  await c.query(
    `SELECT log_audit_event($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}
