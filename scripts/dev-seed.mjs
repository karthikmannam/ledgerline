import crypto from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/ledgerline';
const client = new pg.Client({ connectionString: DATABASE_URL });

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function upsertUser(email, password, role) {
  const passwordHash = await argon2.hash(password);
  const res = await client.query(
    `INSERT INTO users(email, password_hash, role, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = TRUE
     RETURNING id`,
    [email, passwordHash, role]
  );
  return String(res.rows[0].id);
}

async function createSession(userId, ttlHours = 24) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  const res = await client.query(
    `SELECT issue_session($1, $2, $3, $4) AS session_id`,
    [userId, sha256Hex(token), sha256Hex(csrf), ttlHours]
  );
  return { token, csrf, sessionId: String(res.rows[0].session_id) };
}

async function ensureAccountBalance(userId, name, amountPaisa, adminToken) {
  const account = await client.query(
    `SELECT open_customer_account($1, $2) AS id`,
    [userId, name]
  );
  const accountId = String(account.rows[0].id);
  const capital = await client.query(
    `SELECT id FROM ledger_accounts WHERE kind = 'capital' LIMIT 1`
  );
  if (!capital.rows[0]) {
    throw new Error('Missing capital system account');
  }
  await client.query(
    `SELECT post_journal_atomic('credit_adjustment', $1, $2, $3, $4, $5, $6::jsonb, NULL)`,
    [
      `BOOTSTRAP-${name}`,
      String(capital.rows[0].id),
      accountId,
      String(amountPaisa),
      adminToken,
      JSON.stringify({ bootstrap: true, account: name })
    ]
  );
  return accountId;
}

await client.connect();
await client.query('BEGIN');
try {
  const adminId = await upsertUser('admin@ledgerline.dev', 'AdminPass123!', 'admin');
  const auditorId = await upsertUser('auditor@ledgerline.dev', 'AuditorPass123!', 'auditor');
  const holder1Id = await upsertUser('holder1@ledgerline.dev', 'HolderPass123!', 'holder');
  const holder2Id = await upsertUser('holder2@ledgerline.dev', 'HolderPass123!', 'holder');

  const adminSession = await createSession(adminId, 24);
  const account1 = await ensureAccountBalance(holder1Id, 'Primary checking', 2500000, adminSession.token);
  const account2 = await ensureAccountBalance(holder2Id, 'Secondary checking', 1500000, adminSession.token);

  await client.query('COMMIT');
  console.log(JSON.stringify({
    adminId,
    auditorId,
    holder1Id,
    holder2Id,
    adminSession,
    account1,
    account2,
    message: 'Development seed data created successfully. Use the admin/auditor/holder passwords set in this script only for local testing.'
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
