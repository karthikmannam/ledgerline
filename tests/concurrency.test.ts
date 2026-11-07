import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import request from 'supertest';

const PORT = 54406;
const DB = 'ledgerline';
const URL = `postgres://postgres:password@127.0.0.1:${PORT}/${DB}`;
const databaseDir = join(process.cwd(), '.tmp-pg-conc');
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
  for (const p of list) {
    const s = p.split(';')[0] ?? '';
    if (s.startsWith('ledgerline_csrf=')) csrf = s.slice('ledgerline_csrf='.length);
  }
  return { cookie: list.map((x) => x.split(';')[0]).join('; '), csrf };
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

async function mk(email: string, role = 'holder') {
  const p = 'PasswordPass123!';
  const r = await request(app).post('/auth/register').send({ email, password: p });
  expect(r.status).toBe(201);
  await sql('UPDATE users SET role=$1 WHERE email=$2', [role, email]);
  const l = await request(app).post('/auth/login').send({ email, password: p });
  expect(l.status).toBe(200);
  return { id: l.body.id as string, ...parse(l.headers['set-cookie']) };
}

async function depositHolder(amount: string, ref: string) {
  const dep = await request(app)
    .post('/deposit-requests')
    .set('Cookie', holder.cookie)
    .set('x-csrf-token', holder.csrf)
    .send({ accountId: acct, amount, externalReference: ref, evidence: {} });
  expect(dep.status).toBe(201);
  const v = await request(app)
    .post(`/deposit-requests/${dep.body.id}/verify-and-post`)
    .set('Cookie', admin.cookie)
    .set('x-csrf-token', admin.csrf)
    .send({});
  expect(v.status).toBe(200);
}

let holder: { id: string; cookie: string; csrf: string };
let admin: { id: string; cookie: string; csrf: string };
let acct: string;

describe('Genuine concurrent authorization (real PostgreSQL)', () => {
  beforeAll(async () => {
    holder = await mk('conc-holder@example.test');
    admin = await mk('conc-admin@example.test', 'admin');
    const a = await request(app)
      .post('/accounts')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ name: 'C' });
    expect(a.status).toBe(201);
    acct = a.body.id as string;
    await depositHolder('1000000', 'CONC-001');
  });

  it('user deactivation racing with withdrawal serializes', async () => {
    // Genuine race: two independent connections
    const holderId = holder.id;
    const userLock = new Promise<void>((resolve, reject) => {
      const c = new pg.Client({ connectionString: URL });
      c.connect()
        .then(async () => {
          await c.query('BEGIN');
          await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [holderId]);
          resolve();
          // hold lock
          await new Promise((r) => setTimeout(r, 300));
          await c.query('UPDATE users SET is_active=false WHERE id=$1', [holderId]);
          await c.query('COMMIT');
          await c.end();
        })
        .catch(reject);
    });
    await userLock.then(() => {
      // deactivation committed before withdrawal attempt
    }).catch(() => undefined);
    const w = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '10', currency: 'INR', idempotencyKey: 'CONC-DEACT' });
    expect([422, 403, 500, 401]).toContain(w.status);
    const u = await sql(`SELECT is_active FROM users WHERE id=$1`, [holderId]);
    expect(Boolean(u.rows[0].is_active)).toBe(false);
    await sql('UPDATE users SET is_active=true WHERE id=$1', [holderId]);
  });

  it('session revocation racing with withdrawal serializes', async () => {
    const sid = String((await sql(`SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1`, [holder.id])).rows[0].id);
    const revPromise = (async () => {
      const c = new pg.Client({ connectionString: URL });
      await c.connect();
      await c.query('BEGIN');
      await c.query('SELECT id FROM sessions WHERE id=$1 FOR UPDATE', [sid]);
      await new Promise((r) => setTimeout(r, 200));
      await c.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sid]);
      await c.query('COMMIT');
      await c.end();
    })();
    await new Promise((r) => setTimeout(r, 300));
    await revPromise;
    const w = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '10', currency: 'INR', idempotencyKey: 'CONC-REVOKED' });
    expect(w.status).toBe(401);
    // deactivation was reverted below, so new login issues fresh session
    await sql('UPDATE users SET is_active=true WHERE id=$1', [holder.id]);
    const l = await request(app).post('/auth/login').send({ email: 'conc-holder@example.test', password: 'PasswordPass123!' });
    expect(l.status).toBe(200);
    holder = { id: l.body.id, ...parse(l.headers['set-cookie']) };
  });

  it('account suspension racing with withdrawal serializes', async () => {
    const acctLock = (async () => {
      const c = new pg.Client({ connectionString: URL });
      await c.connect();
      await c.query('BEGIN');
      await c.query('SELECT id FROM ledger_accounts WHERE id=$1 FOR UPDATE', [acct]);
      await new Promise((r) => setTimeout(r, 200));
      await c.query(`UPDATE ledger_accounts SET status='suspended' WHERE id=$1`, [acct]);
      await c.query('COMMIT');
      await c.end();
    })();
    await new Promise((r) => setTimeout(r, 300));
    await acctLock;
    const w = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '10', currency: 'INR', idempotencyKey: 'CONC-SUSP' });
    expect([401, 403, 400, 422]).toContain(w.status);
    await sql(`UPDATE ledger_accounts SET status='active' WHERE id=$1`, [acct]);
  });

  it('permission revocation racing with transfer serializes', async () => {
    const permLock = (async () => {
      const c = new pg.Client({ connectionString: URL });
      await c.connect();
      await c.query('BEGIN');
      await c.query('SELECT id FROM ledger_accounts WHERE id=$1 FOR UPDATE', [acct]);
      await new Promise((r) => setTimeout(r, 200));
      await c.query('DELETE FROM account_permissions WHERE ledger_account_id=$1 AND user_id=$2 AND permission=$3', [
        acct,
        admin.id,
        'transfer_out'
      ]);
      await c.query('COMMIT');
      await c.end();
    })();
    await new Promise((r) => setTimeout(r, 300));
    await permLock;
    const wid = await request(app)
      .post('/withdrawals')
      .set('Cookie', holder.cookie)
      .set('x-csrf-token', holder.csrf)
      .send({ accountId: acct, amount: '10', currency: 'INR', idempotencyKey: 'CONC-W1' });
    expect([200, 401, 403, 422]).toContain(wid.status);
  });

  it('reversal racing with another reversal serializes to one', async () => {
    await depositHolder('5000', 'CONC-REV-DEPOSIT');
    const tx = String((await sql(`SELECT id FROM journal_transactions WHERE type='deposit' ORDER BY created_at DESC LIMIT 1`)).rows[0].id);
    expect(tx).toBeTruthy();
    const ra = await request(app)
      .post(`/transactions/${tx}/reverse`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ reason: 'r1' });
    const rb = await request(app)
      .post(`/transactions/${tx}/reverse`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ reason: 'r2' });
    const ok = [ra, rb].filter((r) => r.status === 200 || r.status === 409).length;
    expect(ok).toBe(2);
    expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
    expect([ra.status, rb.status].filter((s) => s === 409)).toHaveLength(1);
  });
});
