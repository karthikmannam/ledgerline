import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawnSync } from 'node:child_process';

const PORT = 54406;
const DB = 'ledgerline';
const SUPER_URL = `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`;
void SUPER_URL;
const M_URL = `postgres://ledgerline_migrator:ledgerline_migrator@127.0.0.1:${PORT}/${DB}`;
const APP_URL = `postgres://ledgerline_app:ledgerline_app@127.0.0.1:${PORT}/${DB}`;
const databaseDir = join(process.cwd(), '.tmp-pg-migrator');

let pgInstance: EmbeddedPostgres;
let postgresStarted = false;

async function sql(url: string, text: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  pgInstance = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'password',
    port: PORT,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    initdbFlags: ['--set=shared_buffers=128MB', '--no-sync'],
    persistent: false
  });
  rmSync(databaseDir, { recursive: true, force: true });
  await pgInstance.initialise();
  await pgInstance.start();
  postgresStarted = true;
  await pgInstance.createDatabase(DB);
}, 120_000);

afterAll(async () => {
  if (postgresStarted) await pgInstance.stop();
}, 60_000);

describe('ledgerline_migrator actual runner (real PostgreSQL)', () => {
  it('provisions via superuser then runs actual src/db/migrate.ts as migrator', async () => {
    const provision = readFileSync(join(process.cwd(), 'db', 'provision.sql'), 'utf8');
    const sup = new pg.Client({ connectionString: `postgres://postgres:password@127.0.0.1:${PORT}/postgres` });
    await sup.connect();
    await sup.query(provision);
    await sup.query(`ALTER DATABASE "${DB}" OWNER TO ledgerline_migrator; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER SCHEMA public OWNER TO ledgerline_migrator; GRANT ALL ON SCHEMA public TO ledgerline_migrator WITH GRANT OPTION; GRANT CREATE ON DATABASE "${DB}" TO ledgerline_migrator;`);
    await sup.end();

    const run = () =>
      spawnSync(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'src/db/migrate.ts'], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: M_URL, MIGRATIONS_URL: M_URL },
        encoding: 'utf8'
      });
    const first = run();
    if (first.status !== 0) {
      throw new Error('migrate failed: ' + (first.stderr ?? first.stdout ?? ''));
    }
    const second = run();
    expect(second.status).toBe(0);

    const owners = await sql(
      `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`,
      `SELECT pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proname
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('post_journal_atomic','post_reversal','resolve_session','post_bootstrap_opening')`
    );
    expect(owners.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of owners.rows) {
      expect(row.owner).toBe('ledgerline_executor');
    }
    const pub = await sql(
      `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`,
      `SELECT grantee FROM information_schema.role_routine_grants WHERE routine_name='post_journal_atomic' AND grantee='PUBLIC'`
    );
    expect(pub.rows).toHaveLength(0);

    const tables = await sql(
      `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`,
      `SELECT count(*)::text AS c FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','sessions','ledger_accounts','journal_transactions')`
    );
    expect(Number(tables.rows[0].c)).toBeGreaterThanOrEqual(4);
  });

  it('app cannot run migrations, create schema, or assume privileged roles', async () => {
    const appC = new pg.Client({ connectionString: APP_URL });
    await appC.connect();
    try {
      await expect(appC.query('CREATE TABLE _audit_hack(id int)')).rejects.toThrow();
    } finally {
      await appC.end();
    }
    const who = await sql(APP_URL, 'SELECT current_user AS u');
    expect(String(who.rows[0].u)).toBe('ledgerline_app');
    const members = await sql(
      `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`,
      `SELECT pg_catalog.pg_has_role('ledgerline_app','ledgerline_migrator','MEMBER') AS mig,
              pg_catalog.pg_has_role('ledgerline_app','ledgerline_executor','MEMBER') AS exe`
    );
    expect(Boolean(members.rows[0].mig)).toBe(false);
    expect(Boolean(members.rows[0].exe)).toBe(false);
  });
});
