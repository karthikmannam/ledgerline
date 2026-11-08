import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = 5432;
const DATABASE = 'ledgerline';
const dataDir = path.join(process.cwd(), '.ledgerline-pg-data');

const isNew = !fs.existsSync(dataDir);

const pgInstance = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'password',
  port: PORT,
  persistent: true,
  initdbFlags: ['--set=shared_buffers=128MB', '--no-sync']
});

if (isNew) {
  console.log('Initializing PostgreSQL database cluster at', dataDir);
  await pgInstance.initialise();
}

console.log('Starting PostgreSQL server on port', PORT);
await pgInstance.start();

const superUrl = `postgresql://postgres:password@127.0.0.1:${PORT}/postgres`;
const superClient = new pg.Client({ connectionString: superUrl });
await superClient.connect();

const dbCheck = await superClient.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [DATABASE]
);

if (dbCheck.rowCount === 0) {
  console.log(`Database '${DATABASE}' does not exist, creating...`);
  await superClient.query(`CREATE DATABASE ${DATABASE}`);
}
await superClient.end();

const dbUrl = `postgresql://postgres:password@127.0.0.1:${PORT}/${DATABASE}`;
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  console.log('Applying provision script...');
  await client.query(fs.readFileSync(path.join(process.cwd(), 'db', 'provision.sql'), 'utf8'));

  const migrationDir = path.join(process.cwd(), 'db', 'migrations');
  for (const file of ['001_init.sql', '002_roles_grants.sql']) {
    console.log(`Applying migration ${file}...`);
    await client.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
  }

  console.log('Applying grants script...');
  await client.query(fs.readFileSync(path.join(process.cwd(), 'db', 'grants.sql'), 'utf8'));
  console.log('Database provision and migrations complete!');
} catch (err) {
  console.warn('Migration note / warning:', err.message);
} finally {
  await client.end();
}

// Now seed default users
try {
  console.log('Running dev-seed...');
  process.env.DATABASE_URL = `postgres://ledgerline_app:ledgerline_app@127.0.0.1:${PORT}/${DATABASE}`;
  await import('./dev-seed.mjs');
  console.log('Dev seed completed successfully!');
} catch (err) {
  console.log('Dev seed status/note:', err.message);
}

console.log(`\n======================================================`);
console.log(`PostgreSQL is running on 127.0.0.1:${PORT}`);
console.log(`Database: ${DATABASE}`);
console.log(`App URL: postgres://ledgerline_app:ledgerline_app@127.0.0.1:${PORT}/${DATABASE}`);
console.log(`Default accounts:`);
console.log(`- Admin:   admin@ledgerline.dev   / AdminPass123!`);
console.log(`- Auditor: auditor@ledgerline.dev / AuditorPass123!`);
console.log(`- Holder1: holder1@ledgerline.dev / HolderPass123!`);
console.log(`- Holder2: holder2@ledgerline.dev / HolderPass123!`);
console.log(`======================================================\n`);

process.on('SIGINT', async () => {
  console.log('Shutting down PostgreSQL...');
  await pgInstance.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down PostgreSQL...');
  await pgInstance.stop();
  process.exit(0);
});

// Keep process running
setInterval(() => {}, 10000);
