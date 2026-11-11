import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const connectionString =
  process.env.DATABASE_URL ?? env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  application_name: 'ledgerline-api'
});

export function getPool(): pg.Pool {
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    logger.warn(
      {
        errCode: e.code ?? 'UNKNOWN',
        detail: (e.message ?? String(err))
          .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<redacted-url>')
          .replace(/\b(password|token)[^\s]*/gi, '<redacted-secret>')
          .slice(0, 160)
      },
      'database ping failed'
    );
    return false;
  }
}

export async function closePool(): Promise<void> {
  try {
    await pool.end();
  } catch {
    // Best-effort: no DB connections in tests / foundation mode.
  }
}
