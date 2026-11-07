-- LedgerLine provisioning (run as a PostgreSQL superuser against the target database).
-- Database creation is intentionally separated from transactional provisioning so it can
-- be executed in the correct lifecycle stage without attempting CREATE DATABASE inside a DO block.
-- Passwords are placeholders; rotate per deployment via env secrets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ledgerline_executor') THEN
    CREATE ROLE ledgerline_executor NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ledgerline_app') THEN
    CREATE ROLE ledgerline_app LOGIN PASSWORD 'ledgerline_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ledgerline_migrator') THEN
    CREATE ROLE ledgerline_migrator LOGIN PASSWORD 'ledgerline_migrator';
  END IF;
END $$;

ALTER ROLE ledgerline_executor NOLOGIN;
ALTER ROLE ledgerline_app LOGIN PASSWORD 'ledgerline_app';
ALTER ROLE ledgerline_migrator LOGIN PASSWORD 'ledgerline_migrator';
GRANT ledgerline_executor TO ledgerline_migrator WITH ADMIN OPTION;

-- Keep the live database ownership and schema ownership on the migration role, which is the
-- actual role used by src/db/migrate.ts. This avoids permission errors when the runner applies
-- migrations as ledgerline_migrator against a fresh database.
ALTER DATABASE ledgerline OWNER TO ledgerline_migrator;
GRANT CREATE ON DATABASE ledgerline TO ledgerline_migrator;
GRANT CONNECT ON DATABASE ledgerline TO ledgerline_app;
GRANT CONNECT ON DATABASE ledgerline TO ledgerline_migrator;
ALTER SCHEMA public OWNER TO ledgerline_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_executor;
GRANT USAGE ON SCHEMA public TO ledgerline_app;
GRANT ALL ON SCHEMA public TO ledgerline_migrator WITH GRANT OPTION;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ledgerline_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ledgerline_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ledgerline_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public GRANT ALL ON TABLES TO ledgerline_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public GRANT ALL ON SEQUENCES TO ledgerline_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ledgerline_executor;
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'auth_rate_limits',
    'account_permissions',
    'attempts',
    'deposit_requests',
    'adjustment_requests',
    'idempotency_records',
    'audit_events',
    'users',
    'sessions',
    'ledger_accounts',
    'journal_transactions',
    'journal_postings',
    'balance_projections',
    'account_activity',
    'schema_migrations'
  ]
  LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      IF tbl = 'users' THEN
        EXECUTE format('GRANT SELECT (id, email, password_hash, role, is_active, created_at) ON TABLE %I TO ledgerline_app', tbl);
      ELSIF tbl = 'sessions' THEN
        EXECUTE format('GRANT SELECT (id, user_id, expires_at, revoked_at, created_at) ON TABLE %I TO ledgerline_app', tbl);
      ELSIF tbl IN ('ledger_accounts', 'journal_transactions', 'journal_postings', 'balance_projections', 'account_activity', 'schema_migrations') THEN
        EXECUTE format('GRANT SELECT ON TABLE %I TO ledgerline_app', tbl);
      ELSIF tbl IN ('auth_rate_limits', 'attempts', 'deposit_requests', 'adjustment_requests', 'idempotency_records') THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO ledgerline_app', tbl);
      ELSIF tbl = 'account_permissions' THEN
        EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO ledgerline_app', tbl);
      ELSIF tbl = 'audit_events' THEN
        EXECUTE format('GRANT SELECT ON TABLE %I TO ledgerline_app', tbl);
      END IF;
    END IF;
  END LOOP;
  IF to_regclass('auth_rate_limits_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE ON SEQUENCE auth_rate_limits_id_seq TO ledgerline_app';
  END IF;
END $$;
