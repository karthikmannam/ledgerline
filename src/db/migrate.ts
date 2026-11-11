import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

async function migrate(): Promise<void> {
  const url = process.env.MIGRATIONS_URL;
  if (!url) {
    throw new Error('MIGRATIONS_URL environment variable is required. Set it to the ledgerline_migrator connection string.');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727272)');
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = join(here, '../../db/migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    );
    await client.query('ALTER TABLE IF EXISTS schema_migrations OWNER TO ledgerline_migrator');
    await client.query('GRANT ALL ON TABLE schema_migrations TO ledgerline_migrator');
    for (const file of files) {
      const res = await client.query('SELECT id FROM schema_migrations WHERE id=$1', [file]);
      if (res.rowCount && res.rowCount > 0) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(id) VALUES($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        console.error('migration failed file', file, String((err as Error).message ?? err), String((err as unknown as { detail?: string }).detail ?? ''));
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    }
    console.log('migrations ok');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727272)').catch(() => undefined);
    await client.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
