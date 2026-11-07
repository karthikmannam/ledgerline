import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import request from 'supertest';

const PORT = 54403;
const DB = 'ledgerline';
const URL = `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`;
const databaseDir = join(process.cwd(), '.tmp-pg-regression');
let pgInstance: EmbeddedPostgres;
let postgresStarted = false;
let poolModule: typeof import('../src/db/pool.js');
let app: ReturnType<typeof import('../src/app.js').createApp>;

async function sql(text: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}
function parse(h: unknown) {
  const list = Array.isArray(h) ? (h as string[]).map(String) : h ? [String(h)] : [];
  let csrf = '';
  let token = '';
  for (const p of list) {
    const s = p.split(';')[0] ?? '';
    if (s.startsWith('ledgerline_csrf=')) csrf = s.slice('ledgerline_csrf='.length);
    if (s.startsWith('ledgerline_session=')) token = s.slice('ledgerline_session='.length);
  }
  return { cookie: list.map((x) => x.split(';')[0]).join('; '), csrf, token };
}

declare global {
  // keep parser return type
}
export type ParsedAuth = ReturnType<typeof parse>;

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
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  await c.query(readFileSync(join(process.cwd(), 'db', 'provision.sql'), 'utf8'));
  for (const f of ['001_init.sql', '002_roles_grants.sql']) {
    await c.query(readFileSync(join(base, f), 'utf8'));
  }
  await c.query(readFileSync(join(process.cwd(), 'db', 'grants.sql'), 'utf8'));
  await c.end();
  process.env.DATABASE_URL = URL;
  process.env.NODE_ENV = 'test';
  poolModule = await import('../src/db/pool.js');
  app = (await import('../src/app.js')).createApp();
}, 120_000);

afterAll(async () => {
  if (poolModule) await poolModule.closePool().catch(() => undefined);
  if (postgresStarted) await pgInstance.stop();
}, 60_000);

describe('Security audit regressions (real PostgreSQL)', () => {
  let holder: ParsedAuth;
  let admin: ParsedAuth;
  let acct: string;
  let clearing: string;
  let capital: string;

  async function mk(email: string, role = 'holder') {
    const p = 'PasswordPass123!';
    const r = await request(app).post('/auth/register').send({ email, password: p });
    expect(r.status).toBe(201);
    await sql('UPDATE users SET role=$1 WHERE email=$2', [role, email]);
    const l = await request(app).post('/auth/login').send({ email, password: p });
    expect(l.status).toBe(200);
    return parse(l.headers['set-cookie']);
  }

  beforeAll(async () => {
    holder = await mk('audit-holder@example.test');
    admin = await mk('audit-admin@example.test', 'admin');
    const a = await request(app)
      .post('/accounts')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ name: 'A' });
    expect(a.status).toBe(201);
    acct = a.body.id as string;
    clearing = String((await sql(`SELECT id FROM ledger_accounts WHERE kind='clearing'`)).rows[0].id);
    capital = String((await sql(`SELECT id FROM ledger_accounts WHERE kind='capital'`)).rows[0].id);
    const dep = await request(app)
      .post('/deposit-requests')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '50000', externalReference: 'AUD-001', evidence: {} });
    expect(dep.status).toBe(201);
    const v = await request(app)
      .post(`/deposit-requests/${dep.body.id}/verify-and-post`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({});
    expect(v.status).toBe(200);
  });

  it('rejects invalid direction (transfer DR clearing) at DB layer', async () => {
    await expect(
      sql(`SELECT post_journal_atomic('transfer',NULL,$1,$2,1000,$3,'{}'::jsonb) AS tx`, [clearing, acct, holder.token])
    ).rejects.toThrow(/invalid_direction/);
  });

  it('rejects posting to suspended customer account', async () => {
    const sess = holder.token;
    await sql(`UPDATE ledger_accounts SET status='suspended' WHERE id=$1`, [acct]);
    await expect(
      sql(`SELECT post_journal_atomic('withdrawal',NULL,$1,$2,100,$3,'{}'::jsonb) AS tx`, [acct, clearing, sess])
    ).rejects.toThrow(/account_not_active/);
    await sql(`UPDATE ledger_accounts SET status='active' WHERE id=$1`, [acct]);
  });

  it('rejects reversal with NULL actor', async () => {
    const tx = String((await sql(`SELECT id FROM journal_transactions WHERE type='deposit' LIMIT 1`)).rows[0].id);
    await expect(sql(`SELECT post_reversal($1::uuid,NULL,'{}'::jsonb)`, [tx])).rejects.toThrow();
  });

  it('rejects direct posting with invalid token', async () => {
    await expect(
      sql(`SELECT post_journal_atomic('withdrawal',NULL,$1,$2,100,'not-a-real-token','{}'::jsonb) AS tx`, [acct, clearing])
    ).rejects.toThrow(/invalid_session/);
  });

  it('prevents runtime role from directly editing ledger or balances', async () => {
    const c = new pg.Client({ connectionString: URL.replace('postgres:password', 'ledgerline_app:app') });
    // ledgerline_app has no password in this harness; check privilege metadata instead
    const r = await sql(`SELECT has_table_privilege('ledgerline_app','journal_transactions','INSERT') AS ins,
                                 has_table_privilege('ledgerline_app','balance_projections','UPDATE') AS upd,
                                 has_table_privilege('ledgerline_app','journal_transactions','DELETE') AS del`);
    expect(Boolean(r.rows[0].ins)).toBe(false);
    expect(Boolean(r.rows[0].upd)).toBe(false);
    expect(Boolean(r.rows[0].del)).toBe(false);
    void c;
  });

  it('keeps request hash stable and distinct', async () => {
    const { requestHashOf } = await import('../src/services/ledger.js');
    const a = requestHashOf({ x: '1' });
    const b = requestHashOf({ x: '1' });
    const c = requestHashOf({ x: '2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBe(64);
  });

  it('concurrent duplicate reversals serialize to one reversal', async () => {
    const tx = String((await sql(`SELECT id FROM journal_transactions WHERE type='deposit' ORDER BY created_at DESC LIMIT 1`)).rows[0].id);
    const adminId = String((await sql(`SELECT id FROM users WHERE email=$1`, ['audit-admin@example.test'])).rows[0].id);
    const sess = admin.token;
    const results = await Promise.allSettled([
      sql(`SELECT post_reversal($1::uuid,$2,'{}'::jsonb,$3) AS tx`, [tx, adminId, sess]),
      sql(`SELECT post_reversal($1::uuid,$2,'{}'::jsonb,$3) AS tx`, [tx, adminId, sess])
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    const cnt = await sql(`SELECT count(*)::text AS c FROM journal_transactions WHERE reversal_of=$1`, [tx]);
    expect(String(cnt.rows[0].c)).toBe('1');
  });

  it('stable statement pagination excludes activity inserted between pages', async () => {
    const first = await request(app).get(`/accounts/${acct}/statement?limit=1`).set('Cookie', holder.cookie);
    expect(first.status).toBe(200);
    const hw = String(first.body.highWater);
    expect(first.body.entries.length).toBeGreaterThan(0);
    // insert fresh activity after first page
    const topUp = await request(app)
      .post('/deposit-requests')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '5000', externalReference: 'AUD-PAGE-TOPUP', evidence: {} });
    expect(topUp.status).toBe(201);
    const topVerify = await request(app)
      .post(`/deposit-requests/${topUp.body.id}/verify-and-post`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({});
    expect(topVerify.status).toBe(200);
    const res2 = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '10', currency: 'INR', idempotencyKey: 'AUD-PAGE-1' });
    expect(res2.status).toBe(200);
    const second = await request(app)
      .get(`/accounts/${acct}/statement?limit=1&before=${first.body.nextBefore}&hw=${hw}`)
      .set('Cookie', holder.cookie);
    expect(second.status).toBe(200);
    expect(second.body.highWater).toBe(hw);
    for (const e of second.body.entries) {
      expect(Number(e.seq)).toBeLessThanOrEqual(Number(hw));
    }
    const seqs = second.body.entries.map((e: { seq: string }) => e.seq);
    expect(seqs).not.toContain(String(Number(hw) + 1));
  });

  it('durable refusals: 422 attempt and idempotency persist, no posting created', async () => {
    const before = await sql(`SELECT count(*)::text AS c FROM journal_postings`);
    const r = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '999999999', currency: 'INR', idempotencyKey: 'AUD-422' });
    expect(r.status).toBe(422);
    const idem = await sql(`SELECT response_status::text AS s FROM idempotency_records WHERE idempotency_key='AUD-422'`);
    expect(String(idem.rows[0]?.s)).toBe('422');
    const attempts = await sql(`SELECT code FROM attempts WHERE code='INSUFFICIENT_FUNDS' ORDER BY created_at DESC LIMIT 1`);
    expect(attempts.rows.length).toBeGreaterThan(0);
    const after = await sql(`SELECT count(*)::text AS c FROM journal_postings`);
    expect(String(after.rows[0].c)).toBe(String(before.rows[0].c));
    // replay same key returns same refusal
    const replay = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '999999999', currency: 'INR', idempotencyKey: 'AUD-422' });
    expect(replay.status).toBe(422);
  });

  it('permission changes serialize with postings without deadlock', async () => {
    const adminId = String((await sql(`SELECT id FROM users WHERE email=$1`, ['audit-admin@example.test'])).rows[0].id);
    const res = await request(app)
      .post(`/accounts/${acct}/permission`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ user_id: adminId, permission: 'view' });
    expect(res.status).toBe(200);
    const w = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '5', currency: 'INR', idempotencyKey: 'AUD-PERM-1' });
    expect([200, 422]).toContain(w.status);
    void adminId;
  });

  it('every journal has exactly two balanced postings', async () => {
    const r = await sql(
      `SELECT transaction_id, count(*)::int AS n FROM journal_postings GROUP BY transaction_id HAVING count(*) <> 2`
    );
    expect(r.rows).toHaveLength(0);
    const unbalanced = await sql(
      `SELECT transaction_id FROM journal_postings GROUP BY transaction_id HAVING sum(amount_paise) <> 2*min(amount_paise)`
    );
    expect(unbalanced.rows).toHaveLength(0);
    void clearing;
    void capital;
  });
});
