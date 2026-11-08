import pg from 'pg';
import argon2 from 'argon2';

const DATABASE_URL = process.env.MIGRATIONS_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/ledgerline';
const client = new pg.Client({ connectionString: DATABASE_URL });

async function run() {
  await client.connect();
  const passwordHash = await argon2.hash('AdminPass123!');
  await client.query(
    `INSERT INTO users(email, password_hash, role, is_active)
     VALUES ($1, $2, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = 'admin',
       is_active = TRUE`,
    ['admin2@ledgerline.dev', passwordHash]
  );
  console.log('admin2@ledgerline.dev ready');
  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
