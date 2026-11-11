-- LedgerLine Neon provisioning.
-- Run as the Neon project's default role (database owner of `neondb`), e.g.:
--   psql "$NEON_ADMIN_URL" -f db/provision-neon.sql
-- No PostgreSQL superuser required. Safe to run more than once.
--
-- Passwords are NOT set here. After provisioning, set them interactively
-- (never in files, CLI arguments, or the Neon SQL Editor):
--   psql "$NEON_ADMIN_URL" -c "\password ledgerline_app"
--   psql "$NEON_ADMIN_URL" -c "\password ledgerline_migrator"
-- ledgerline_executor is NOLOGIN and never needs a password.
--
-- NOTE: executed successfully against Neon (PostgreSQL 18.6, project
-- frosty-heart-86467404, branch production) on 2026-11-11, then independently
-- re-verified. PG18 findings baked into this script: ownership transfers
-- require SET-able membership (section 2); default-privilege revokes for
-- functions are no-ops (section 5). Verify after running:
--   SELECT current_user;                                    -- must be the Neon owner role
--   SELECT rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user;
--   SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();
--   SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public';

-- 1. Create the three roles without passwords. --------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_executor') THEN
    CREATE ROLE ledgerline_executor NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_app') THEN
    CREATE ROLE ledgerline_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_migrator') THEN
    CREATE ROLE ledgerline_migrator LOGIN;
  END IF;
END $$;

-- 2. Role memberships.
--    PG16+ decouples SET ROLE from ADMIN OPTION: an ownership transfer
--    (ALTER ... OWNER TO) and ALTER DEFAULT PRIVILEGES both require a
--    membership grant with the SET option, so membership is granted with
--    SET TRUE explicitly. Re-granting ADMIN to the role's creator is
--    rejected by PG18 on Neon ("ADMIN option cannot be granted back to
--    your own grantor"), so only the migrator receives ADMIN on the
--    executor (needed to manage it), and both grants carry SET.
--    Grants are idempotent: re-running merges into the same grant row.
--    The executing (Neon owner) role becomes a member of ledgerline_migrator
--    so it can transfer schema/database ownership below; the migrator can
--    act as ledgerline_executor (owner of the SECURITY DEFINER functions).
GRANT ledgerline_migrator TO CURRENT_USER WITH SET TRUE;
GRANT ledgerline_executor TO ledgerline_migrator WITH ADMIN OPTION, SET TRUE;

-- 3. Database privileges — run while the executing role still owns the database.
REVOKE ALL ON DATABASE neondb FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO ledgerline_app;
GRANT CONNECT ON DATABASE neondb TO ledgerline_migrator;
GRANT CREATE ON DATABASE neondb TO ledgerline_migrator;

-- 4. Schema privileges — run while the executing role still owns `public`
--    (ownership of `public` follows the database owner via pg_database_owner).
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_executor;
GRANT USAGE ON SCHEMA public TO ledgerline_app;

-- 5. Default privileges. INTENT: functions created later must not be
--    PUBLIC-executable. VERIFIED ON NEON PG 18.6: PostgreSQL does not store a
--    "revoke-to-empty" default ACL for functions, and CREATE FUNCTION still
--    grants EXECUTE to PUBLIC when no default-ACL row exists — so these two
--    statements are no-ops there. The actual enforcement is the blanket
--    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ledgerline_app"
--    in db/migrations/002_roles_grants.sql (asserted by the test suite).
--    IMPORTANT: any FUTURE migration file that creates functions must include
--    the same explicit revoke — default privileges cannot be relied upon.
--    Table/sequence default ACLs grant nothing to anyone but the owner, and
--    ledgerline_app receives only what 002_roles_grants.sql explicitly grants.
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SET ROLE ledgerline_executor;
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_executor IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

-- 6. Ownership transfers — schema FIRST (the executing role still owns it while
--    it owns the database), database LAST. Guards make re-runs no-ops.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    JOIN pg_roles r ON r.oid = n.nspowner
    WHERE n.nspname = 'public' AND r.rolname <> 'ledgerline_migrator'
  ) THEN
    ALTER SCHEMA public OWNER TO ledgerline_migrator;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_database d
    JOIN pg_roles r ON r.oid = d.datdba
    WHERE d.datname = current_database() AND r.rolname <> 'ledgerline_migrator'
  ) THEN
    ALTER DATABASE neondb OWNER TO ledgerline_migrator;
  END IF;
END $$;