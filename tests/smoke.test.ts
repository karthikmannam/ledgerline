import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import request from 'supertest';
import pg from 'pg';

const PORT = 54407;
const DATABASE = 'ledgerline';
const SUPER_URL = `postgresql://postgres:password@127.0.0.1:${PORT}/${DATABASE}`;
const APP_URL = `postgresql://ledgerline_app:ledgerline_app@127.0.0.1:${PORT}/${DATABASE}`;

let pgInstance: EmbeddedPostgres;
let app: ReturnType<typeof import('../src/app.js').createApp>;
let poolModule: typeof import('../src/db/pool.js');

async function sql(text: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const c = new pg.Client({ connectionString: SUPER_URL });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

function parseCookies(headers: unknown): { cookie: string; csrf: string } {
  const list = Array.isArray(headers) ? headers.map(String) : headers ? [String(headers)] : [];
  const joined = list.map((h) => h.split(';')[0]).join('; ');
  let csrf = '';
  for (const part of list) {
    const s = part.split(';')[0] ?? '';
    if (s.startsWith('ledgerline_csrf=')) {
      csrf = s.slice('ledgerline_csrf='.length);
    }
  }
  return { cookie: joined, csrf };
}

async function register(email: string, password = 'PasswordPass123!') {
  const res = await request(app).post('/auth/register').send({ email, password });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function login(email: string, password = 'PasswordPass123!') {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const { cookie, csrf } = parseCookies(res.headers['set-cookie']);
  expect(cookie).toContain('ledgerline_session');
  expect(csrf).toBeTruthy();
  return { cookie, csrf, id: res.body.id as string };
}

beforeAll(async () => {
  const dbDir = join(process.cwd(), '.tmp-pg-smoke');
  rmSync(dbDir, { recursive: true, force: true });
  pgInstance = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: 'postgres',
    password: 'password',
    port: PORT,
    initdbFlags: ['--set=shared_buffers=128MB', '--no-sync'],
    persistent: false
  });
  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase(DATABASE);

  const base = join(process.cwd(), 'db', 'migrations');
  const c = new pg.Client({ connectionString: SUPER_URL });
  await c.connect();
  try {
    await c.query(readFileSync(join(process.cwd(), 'db', 'provision.sql'), 'utf8'));
    if (existsSync(base)) {
      for (const file of ['001_init.sql', '002_roles_grants.sql']) {
        await c.query(readFileSync(join(base, file), 'utf8'));
      }
      await c.query(readFileSync(join(process.cwd(), 'db', 'grants.sql'), 'utf8'));
    }
  } finally {
    await c.end();
  }

  process.env.DATABASE_URL = APP_URL;
  process.env.NODE_ENV = 'test';
  poolModule = await import('../src/db/pool.js');
  app = (await import('../src/app.js')).createApp();
}, 120_000);

afterAll(async () => {
  try {
    await poolModule.closePool();
  } catch {
    // ignore
  }
  await pgInstance.stop();
}, 60_000);

describe('backend smoke test', () => {
  it('runs an admin-only financial flow end-to-end', async () => {
    const adminId = await register('admin@smoke.test');
    const holderId = await register('holder@smoke.test');
    const secondHolderId = await register('holder2@smoke.test');
    await sql('UPDATE users SET role=$1 WHERE id=$2', ['admin', adminId]);

    const adminAuth = await login('admin@smoke.test');
    const holderAuth = await login('holder@smoke.test');
    const secondHolderAuth = await login('holder2@smoke.test');

    const account = await request(app)
      .post('/accounts')
      .set('Cookie', holderAuth.cookie)
      .set('x-csrf-token', holderAuth.csrf)
      .send({ name: 'Smoke Account' });
    expect(account.status).toBe(201);

    const openingDeposit = await request(app)
      .post('/deposit-requests')
      .set('Cookie', holderAuth.cookie)
      .set('x-csrf-token', holderAuth.csrf)
      .send({ accountId: account.body.id, amount: '100000', externalReference: 'SMOKE-001', evidence: { note: 'seed' } });
    expect(openingDeposit.status).toBe(201);

    const verified = await request(app)
      .post(`/deposit-requests/${openingDeposit.body.id}/verify-and-post`)
      .set('Cookie', adminAuth.cookie)
      .set('x-csrf-token', adminAuth.csrf)
      .send({});
    expect(verified.status).toBe(200);

    const secondAccount = await request(app)
      .post('/accounts')
      .set('Cookie', secondHolderAuth.cookie)
      .set('x-csrf-token', secondHolderAuth.csrf)
      .send({ name: 'Second Smoke Account' });
    expect(secondAccount.status).toBe(201);

    const transfer = await request(app)
      .post('/transfers')
      .set('Cookie', holderAuth.cookie)
      .set('x-csrf-token', holderAuth.csrf)
      .send({
        fromAccountId: account.body.id,
        toAccountId: secondAccount.body.id,
        amount: '25000',
        idempotencyKey: 'smoke-transfer-1',
        currency: 'INR'
      });
    expect(transfer.status).toBe(200);
    expect(transfer.body.transaction).toBeTruthy();

    const statement = await request(app)
      .get(`/accounts/${account.body.id}/statement?limit=20`)
      .set('Cookie', holderAuth.cookie);
    expect(statement.status).toBe(200);
    expect(statement.body.entries.length).toBeGreaterThan(0);

    const reconciliation = await request(app)
      .get('/audit/reconciliation')
      .set('Cookie', adminAuth.cookie);
    expect(reconciliation.status).toBe(200);
    expect(reconciliation.body.integrityOk).toBe(true);

    const reversal = await request(app)
      .post(`/transactions/${transfer.body.transaction}/reverse`)
      .set('Cookie', adminAuth.cookie)
      .set('x-csrf-token', adminAuth.csrf)
      .send({ reason: 'smoke reversal' });
    expect(reversal.status).toBe(200);

    const secondReconciliation = await request(app)
      .get('/audit/reconciliation')
      .set('Cookie', adminAuth.cookie);
    expect(secondReconciliation.status).toBe(200);
    expect(secondReconciliation.body.integrityOk).toBe(true);
    expect(String(secondHolderId)).toBeDefined();
    void holderId;
  });
});
