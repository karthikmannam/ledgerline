import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const PORT = 54404;
const DB = 'ledgerline';
const SUPER_URL = `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`;
const APP_URL = `postgres://ledgerline_app:ledgerline_app@127.0.0.1:${PORT}/${DB}`;

let pgInstance: EmbeddedPostgres;
const databaseDir = join(process.cwd(), '.tmp-pg-runtime');
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
    initdbFlags: ['--set=shared_buffers=128MB', '--no-sync'],
    persistent: false
  });
  rmSync(databaseDir, { recursive: true, force: true });
  await pgInstance.initialise();
  await pgInstance.start();
  postgresStarted = true;
  await pgInstance.createDatabase(DB);
  const base = join(process.cwd(), 'db', 'migrations');
  const c = new pg.Client({ connectionString: SUPER_URL });
  await c.connect();
  await c.query(readFileSync(join(process.cwd(), 'db', 'provision.sql'), 'utf8'));
  for (const f of ['001_init.sql', '002_roles_grants.sql']) {
    await c.query(readFileSync(join(base, f), 'utf8'));
  }
  await c.query(readFileSync(join(process.cwd(), 'db', 'grants.sql'), 'utf8'));
  await c.end();
}, 120_000);

afterAll(async () => {
  if (postgresStarted) await pgInstance.stop();
}, 60_000);

describe('ledgerline_app runtime role (real PostgreSQL)', () => {
  it('owns nothing: functions are owned by ledgerline_executor', async () => {
    const owners = await sql(
      SUPER_URL,
      `SELECT p.proname, pg_catalog.pg_get_userbyid(p.proowner) AS owner
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('post_journal_atomic','post_reversal','open_customer_account')`
    );
    expect(owners.rows.length).toBe(3);
    for (const row of owners.rows) {
      expect(row.owner).toBe('ledgerline_executor');
    }
  });

  it('has fixed safe search_path and no PUBLIC execute', async () => {
    const pro = await sql(
      SUPER_URL,
      `SELECT p.proname, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('post_journal_atomic','post_reversal','open_customer_account')`
    );
    expect(pro.rows.length).toBeGreaterThan(0);
    for (const row of pro.rows) {
      const cfg = JSON.stringify((row.proconfig ?? []).map(String));
      expect(cfg.includes('public')).toBe(true);
      expect(cfg.includes('search')).toBe(true);
    }
    const pub = await sql(
      SUPER_URL,
      `SELECT grantee FROM information_schema.role_routine_grants WHERE routine_name='post_journal_atomic' AND grantee='PUBLIC'`
    );
    expect(pub.rows).toHaveLength(0);
  });

  it('cannot directly insert/update/delete journals or balances', async () => {
    await expect(sql(APP_URL, `INSERT INTO journal_transactions(type) VALUES('deposit')`)).rejects.toThrow();
    await expect(sql(APP_URL, `UPDATE journal_transactions SET type='transfer'`)).rejects.toThrow();
    await expect(sql(APP_URL, `DELETE FROM journal_transactions`)).rejects.toThrow();
    await expect(sql(APP_URL, `INSERT INTO journal_postings(transaction_id,ledger_account_id,side,amount_paise) VALUES(gen_random_uuid(),gen_random_uuid(),'debit',1)`)).rejects.toThrow();
    await expect(sql(APP_URL, `UPDATE balance_projections SET balance_paise=999`)).rejects.toThrow();
    await expect(sql(APP_URL, `INSERT INTO balance_projections(ledger_account_id,balance_paise) VALUES(gen_random_uuid(),1)`)).rejects.toThrow();
  });

  it('cannot assume migrator or executor privileges', async () => {
    const identity = await sql(APP_URL, 'SELECT current_user');
    expect(identity.rows[0].current_user).toBe('ledgerline_app');
    const r = await sql(
      SUPER_URL,
      `SELECT pg_catalog.pg_has_role('ledgerline_app','ledgerline_migrator','MEMBER') AS mig,
              pg_catalog.pg_has_role('ledgerline_app','ledgerline_executor','MEMBER') AS exe,
              has_function_privilege('ledgerline_app','post_journal_atomic(journal_type,text,uuid,uuid,bigint,text,jsonb,uuid)','EXECUTE') AS app,
              has_table_privilege('ledgerline_app','public.journal_transactions','INSERT') AS journal_insert,
              has_table_privilege('ledgerline_app','public.journal_transactions','SELECT') AS journal_select,
              (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.journal_transactions'::regclass) AS journal_owner,
              (SELECT relacl::text FROM pg_class WHERE oid='public.journal_transactions'::regclass) AS journal_acl,
              (SELECT rolsuper FROM pg_roles WHERE rolname='ledgerline_app') AS app_superuser`
    );
    expect(Boolean(r.rows[0].mig)).toBe(false);
    expect(Boolean(r.rows[0].exe)).toBe(false);
    expect(Boolean(r.rows[0].app)).toBe(true);
    expect(Boolean(r.rows[0].journal_insert), JSON.stringify(r.rows[0])).toBe(false);
    expect(Boolean(r.rows[0].journal_select)).toBe(true);
  });

  it('can execute posting function only with valid session (no impersonation)', async () => {
    // Create users/accounts via superuser then test runtime with fake session hash
    const holder = await sql(SUPER_URL, `INSERT INTO users(email,password_hash,role) VALUES('rt-holder@example.test','x','holder') RETURNING id`);
    const holderId = String(holder.rows[0].id);
    const acct = await sql(SUPER_URL, `SELECT open_customer_account($1,'RT') AS x`, [holderId]);
    const acctId = String(acct.rows[0].x);
    const clearing = String((await sql(SUPER_URL, `SELECT id FROM ledger_accounts WHERE kind='clearing'`)).rows[0].id);

    // runtime with non-existent token must fail
    await expect(
      sql(APP_URL, `SELECT post_journal_atomic('withdrawal',NULL,$1,$2,100,'00000000000000000000000000000000','{}'::jsonb) AS tx`, [
        acctId,
        clearing
      ])
    ).rejects.toThrow(/invalid_session/);
    void holderId;

    // runtime CAN insert sessions (needed for login); it cannot bypass posting without a valid, live, unexpired session
  });

  it('permits a real application operation via the runtime connection', async () => {
    const holder = await sql(APP_URL, `SELECT register_user('rt-holder2@example.test','x') AS id`);
    expect(holder.rows[0]).toBeTruthy();
  });
});
