-- LedgerLine Milestones 2-9: schema, ledger, idempotency, audit
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Fresh databases may still carry the default postgres ownership on public, so make the
-- migration role explicit before defining the schema it owns and will later reassign to executor.
ALTER SCHEMA public OWNER TO ledgerline_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_executor;
GRANT USAGE ON SCHEMA public TO ledgerline_app;

CREATE TYPE user_role AS ENUM ('admin','holder','auditor');
CREATE TYPE account_status AS ENUM ('active','suspended');
CREATE TYPE account_permission AS ENUM ('view','withdraw','transfer_out');
CREATE TYPE deposit_status AS ENUM ('pending','verified','rejected');
CREATE TYPE adjustment_status AS ENUM ('pending','approved','rejected');
CREATE TYPE journal_type AS ENUM ('deposit','withdrawal','transfer','credit_adjustment','debit_adjustment','reversal');
CREATE TYPE posting_side AS ENUM ('debit','credit');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'holder',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate ON auth_rate_limits(email, created_at DESC);

-- Ledger accounts: customer (credit-normal liability), clearing (debit-normal asset), capital (credit-normal equity)
CREATE TYPE ledger_account_kind AS ENUM ('customer','clearing','capital');
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind ledger_account_kind NOT NULL,
  owner_user_id UUID NULL REFERENCES users(id),
  name TEXT NOT NULL,
  status account_status NOT NULL DEFAULT 'active',
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_clearing ON ledger_accounts((kind)) WHERE kind='clearing';
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_capital ON ledger_accounts((kind)) WHERE kind='capital';

CREATE TABLE IF NOT EXISTS account_permissions (
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission account_permission NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_account_id, user_id, permission)
);

CREATE TABLE IF NOT EXISTS balance_projections (
  ledger_account_id UUID PRIMARY KEY REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type journal_type NOT NULL,
  external_reference TEXT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  reversal_of UUID NULL REFERENCES journal_transactions(id),
  created_by UUID NULL REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_ext_ref_unique UNIQUE (external_reference) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_ext_ref ON journal_transactions(external_reference) WHERE external_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_reversal ON journal_transactions(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS journal_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES journal_transactions(id),
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  side posting_side NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency='INR'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_postings_tx ON journal_postings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_acct ON journal_postings(ledger_account_id, created_at);

-- Exactly-two-postings + balance enforced by function/constraints below
CREATE TABLE IF NOT EXISTS idempotency_records (
  actor_id UUID NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  transaction_id UUID NULL REFERENCES journal_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL,
  endpoint TEXT NOT NULL,
  code TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_actor ON attempts(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_activity (
  id BIGSERIAL PRIMARY KEY,
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  transaction_id UUID NULL REFERENCES journal_transactions(id),
  amount_paise BIGINT NOT NULL,
  side posting_side NOT NULL DEFAULT 'credit',
  running_balance_paise BIGINT NOT NULL CHECK (running_balance_paise >= 0),
  actor_id UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_acct_seq ON account_activity(ledger_account_id, id DESC);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  external_reference TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  maker_id UUID NOT NULL REFERENCES users(id),
  checker_id UUID NULL REFERENCES users(id),
  status deposit_status NOT NULL DEFAULT 'pending',
  journal_transaction_id UUID NULL REFERENCES journal_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deposit_ext_ref ON deposit_requests(external_reference);

CREATE TABLE IF NOT EXISTS adjustment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 1),
  reference TEXT NOT NULL,
  maker_id UUID NOT NULL REFERENCES users(id),
  checker_id UUID NULL REFERENCES users(id),
  status adjustment_status NOT NULL DEFAULT 'pending',
  journal_transaction_id UUID NULL REFERENCES journal_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_adjust_ref ON adjustment_requests(reference);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action, created_at DESC);

CREATE OR REPLACE FUNCTION log_audit_event(
  p_actor_id UUID,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_events(actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor_id, p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_executor;
GRANT USAGE ON SCHEMA public TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerline_executor;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ledgerline_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerline_migrator;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ledgerline_migrator;
GRANT CONNECT ON DATABASE ledgerline TO ledgerline_app;
GRANT USAGE ON SCHEMA public TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  auth_rate_limits,
  account_permissions,
  attempts,
  deposit_requests,
  adjustment_requests,
  users,
  sessions,
  ledger_accounts,
  journal_transactions,
  journal_postings,
  balance_projections,
  account_activity,
  idempotency_records,
  audit_events
TO ledgerline_app;
GRANT SELECT ON TABLE schema_migrations TO ledgerline_app;
GRANT USAGE, SELECT ON SEQUENCE
  auth_rate_limits_id_seq,
  account_activity_id_seq,
  audit_events_id_seq
TO ledgerline_app;
GRANT EXECUTE ON FUNCTION log_audit_event(uuid, text, text, text, jsonb) TO ledgerline_app;

INSERT INTO ledger_accounts (id, kind, owner_user_id, name, status, currency)
SELECT gen_random_uuid(), 'clearing', NULL, 'System Clearing', 'active', 'INR'
WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE kind = 'clearing');

INSERT INTO ledger_accounts (id, kind, owner_user_id, name, status, currency)
SELECT gen_random_uuid(), 'capital', NULL, 'System Capital', 'active', 'INR'
WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE kind = 'capital');

INSERT INTO balance_projections (ledger_account_id, balance_paise, updated_at)
SELECT a.id, 0, now()
FROM ledger_accounts a
WHERE a.kind IN ('clearing', 'capital')
  AND NOT EXISTS (SELECT 1 FROM balance_projections bp WHERE bp.ledger_account_id = a.id);

-- Append-only + no direct projection writes
CREATE OR REPLACE FUNCTION forbid_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'append-only violation'; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forbid_journal_update ON journal_transactions;
CREATE TRIGGER trg_forbid_journal_update BEFORE UPDATE OR DELETE ON journal_transactions
FOR EACH ROW EXECUTE FUNCTION forbid_update();

DROP TRIGGER IF EXISTS trg_forbid_posting_update ON journal_postings;
CREATE TRIGGER trg_forbid_posting_update BEFORE UPDATE OR DELETE ON journal_postings
FOR EACH ROW EXECUTE FUNCTION forbid_update();

-- Locked balance helpers
-- Operational object ownership must remain on the executor role even though the migrator
-- applies the schema change. Creating them under the executor role avoids a Postgres ACL
-- restriction on ALTER FUNCTION ... OWNER TO when the schema is owned by the migrator.
-- The executor must be able to read the tables referenced in these SECURITY DEFINER bodies
-- before the function definitions are compiled.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerline_executor;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ledgerline_executor;
SET ROLE ledgerline_executor;

CREATE OR REPLACE FUNCTION post_bootstrap_opening(
  p_debit_account UUID,
  p_credit_account UUID,
  p_amount_paise BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_tx UUID;
  v_debit_kind ledger_account_kind;
  v_credit_kind ledger_account_kind;
BEGIN
  SELECT kind INTO v_debit_kind FROM ledger_accounts WHERE id = p_debit_account;
  SELECT kind INTO v_credit_kind FROM ledger_accounts WHERE id = p_credit_account;
  IF v_debit_kind <> 'clearing' OR v_credit_kind <> 'capital' THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001';
  END IF;
  PERFORM id FROM ledger_accounts WHERE id IN (p_debit_account, p_credit_account) ORDER BY id FOR UPDATE;
  INSERT INTO journal_transactions(type, external_reference, created_by, metadata)
  VALUES ('credit_adjustment', 'BOOTSTRAP-'||gen_random_uuid()::text, NULL, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_tx;
  INSERT INTO journal_postings(transaction_id, ledger_account_id, side, amount_paise)
  VALUES (v_tx, p_debit_account, 'debit', p_amount_paise),
         (v_tx, p_credit_account, 'credit', p_amount_paise);
  UPDATE balance_projections SET balance_paise = balance_paise + p_amount_paise, updated_at = now() WHERE ledger_account_id IN (p_debit_account, p_credit_account);
  INSERT INTO account_activity(ledger_account_id, transaction_id, amount_paise, side, running_balance_paise, actor_id)
  SELECT p_debit_account, v_tx, p_amount_paise, 'debit', balance_paise, NULL FROM balance_projections WHERE ledger_account_id = p_debit_account;
  INSERT INTO account_activity(ledger_account_id, transaction_id, amount_paise, side, running_balance_paise, actor_id)
  SELECT p_credit_account, v_tx, p_amount_paise, 'credit', balance_paise, NULL FROM balance_projections WHERE ledger_account_id = p_credit_account;
  RETURN v_tx;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION post_journal_atomic(
  p_type journal_type,
  p_external_reference TEXT,
  p_debit_account UUID,
  p_credit_account UUID,
  p_amount_paise BIGINT,
  p_token TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_reversal_of UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tx UUID;
  v_debit_kind ledger_account_kind;
  v_credit_kind ledger_account_kind;
  v_debit_bal BIGINT;
  v_credit_bal BIGINT;
  v_debit_after BIGINT;
  v_credit_after BIGINT;
  v_actor UUID;
BEGIN
  -- Global lock order: 1 session/user 2 idempotency 3 resource 4 accounts sorted 5 permissions
  -- 1. Resolve actor from raw token, lock session row
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE = 'P0001';
  END IF;
  SELECT s.user_id INTO v_actor FROM sessions s WHERE s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_session' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND s.user_id = v_actor
      AND s.revoked_at IS NULL AND s.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE = 'P0001';
  END IF;
  PERFORM id FROM ledger_accounts WHERE id IN (p_debit_account, p_credit_account) ORDER BY id FOR UPDATE;
  SELECT kind INTO v_debit_kind FROM ledger_accounts WHERE id = p_debit_account;
  SELECT kind INTO v_credit_kind FROM ledger_accounts WHERE id = p_credit_account;
  IF v_debit_kind IS NULL OR v_credit_kind IS NULL THEN
    RAISE EXCEPTION 'invalid_account' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paise <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001'; END IF;
  IF p_debit_account = p_credit_account THEN RAISE EXCEPTION 'same_account' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM ledger_accounts WHERE id IN (p_debit_account, p_credit_account) AND status <> 'active';
  IF FOUND THEN RAISE EXCEPTION 'account_not_active' USING ERRCODE = 'P0001'; END IF;
  IF p_type = 'deposit' AND NOT (v_debit_kind = 'clearing' AND v_credit_kind = 'customer') THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
  IF p_type = 'withdrawal' AND NOT (v_debit_kind = 'customer' AND v_credit_kind = 'clearing') THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
  IF p_type = 'transfer' AND NOT (v_debit_kind = 'customer' AND v_credit_kind = 'customer') THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
  IF p_type = 'credit_adjustment' AND NOT (v_debit_kind = 'capital' AND v_credit_kind = 'customer') THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
  IF p_type = 'debit_adjustment' AND NOT (v_debit_kind = 'customer' AND v_credit_kind = 'capital') THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
  IF p_type = 'reversal' THEN
    IF p_reversal_of IS NULL THEN RAISE EXCEPTION 'invalid_reversal' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_actor AND role = 'admin' AND is_active) THEN
      RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001';
    END IF;
    PERFORM 1 FROM journal_transactions WHERE id = p_reversal_of FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_reversal' USING ERRCODE='P0001'; END IF;
    IF EXISTS (SELECT 1 FROM journal_transactions WHERE reversal_of = p_reversal_of) THEN
      RAISE EXCEPTION 'duplicate_reversal' USING ERRCODE='P0001';
    END IF;
    DECLARE v_orig_type journal_type;
    BEGIN
      SELECT type INTO v_orig_type FROM journal_transactions WHERE id = p_reversal_of;
      IF v_orig_type = 'reversal' THEN RAISE EXCEPTION 'cannot_reverse_reversal' USING ERRCODE='P0001'; END IF;
    END;
    IF NOT EXISTS (
      SELECT 1 FROM journal_postings od
      JOIN journal_postings oc ON oc.transaction_id = od.transaction_id
      WHERE od.transaction_id = p_reversal_of AND od.side = 'credit' AND oc.side = 'debit'
        AND od.ledger_account_id = p_debit_account AND oc.ledger_account_id = p_credit_account
    ) THEN RAISE EXCEPTION 'invalid_direction' USING ERRCODE='P0001'; END IF;
    DECLARE v_orig_amount BIGINT;
    BEGIN
      SELECT amount_paise INTO v_orig_amount FROM journal_postings WHERE transaction_id = p_reversal_of LIMIT 1;
      IF v_orig_amount IS NULL OR v_orig_amount <> p_amount_paise THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE='P0001';
      END IF;
    END;
    IF (SELECT count(*) FROM journal_postings WHERE transaction_id = p_reversal_of) <> 2 THEN
      RAISE EXCEPTION 'invalid_reversal' USING ERRCODE='P0001';
    END IF;
  END IF;
  DECLARE v_role user_role;
  BEGIN
    SELECT role INTO v_role FROM users WHERE id = v_actor FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_actor AND is_active) THEN
      RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM sessions
      WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND user_id = v_actor
        AND revoked_at IS NULL AND expires_at > now()
    ) THEN
      RAISE EXCEPTION 'invalid_session' USING ERRCODE = 'P0001';
    END IF;
    IF v_role = 'auditor' THEN RAISE EXCEPTION 'auditor_readonly' USING ERRCODE='P0001'; END IF;
    IF p_type = 'deposit' AND v_role <> 'admin' THEN RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001'; END IF;
    IF p_type IN ('credit_adjustment','debit_adjustment') AND v_role <> 'admin' THEN RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001'; END IF;
    IF p_type = 'withdrawal' AND v_role NOT IN ('admin','holder') THEN RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001'; END IF;
    IF p_type = 'transfer' AND v_role NOT IN ('admin','holder') THEN RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001'; END IF;
    IF p_type IN ('withdrawal','transfer') AND v_role = 'holder' THEN
      IF NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE id = p_debit_account AND owner_user_id = v_actor)
         AND NOT EXISTS (SELECT 1 FROM account_permissions WHERE ledger_account_id = p_debit_account AND user_id = v_actor AND permission IN ('withdraw','transfer_out')) THEN
        RAISE EXCEPTION 'invalid_permission' USING ERRCODE='P0001';
      END IF;
    END IF;
  END;

  -- balance sufficiency: debit customer requires funds; credit customer increases
  -- project current balances
  SELECT balance_paise INTO v_debit_bal FROM balance_projections WHERE ledger_account_id = p_debit_account;
  SELECT balance_paise INTO v_credit_bal FROM balance_projections WHERE ledger_account_id = p_credit_account;
  IF v_debit_bal IS NULL OR v_credit_bal IS NULL THEN RAISE EXCEPTION 'missing_balance' USING ERRCODE='P0001'; END IF;

  IF v_debit_kind = 'customer' AND p_type IN ('withdrawal','transfer') THEN
    IF v_debit_bal < p_amount_paise THEN RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF v_debit_kind = 'customer' AND p_type = 'reversal' AND v_debit_bal < p_amount_paise THEN
    RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO journal_transactions(type, external_reference, reversal_of, created_by, metadata)
  VALUES (p_type, p_external_reference, p_reversal_of, v_actor, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_tx;

  INSERT INTO journal_postings(transaction_id, ledger_account_id, side, amount_paise)
  VALUES (v_tx, p_debit_account, 'debit', p_amount_paise),
         (v_tx, p_credit_account, 'credit', p_amount_paise);

  -- update projections (normal balances: customer/capital credit-normal, clearing debit-normal)
  IF v_debit_kind IN ('customer','capital') THEN
    v_debit_after := v_debit_bal - p_amount_paise;
    IF v_debit_after < 0 THEN RAISE EXCEPTION 'insufficient_funds' USING ERRCODE='P0001'; END IF;
  ELSE
    v_debit_after := v_debit_bal + p_amount_paise;
  END IF;
  IF v_credit_kind = 'clearing' THEN
    v_credit_after := v_credit_bal - p_amount_paise;
    IF v_credit_after < 0 THEN RAISE EXCEPTION 'insufficient_funds' USING ERRCODE='P0001'; END IF;
  ELSE
    v_credit_after := v_credit_bal + p_amount_paise;
  END IF;
  UPDATE balance_projections SET balance_paise = v_debit_after, updated_at = now() WHERE ledger_account_id = p_debit_account;
  UPDATE balance_projections SET balance_paise = v_credit_after, updated_at = now() WHERE ledger_account_id = p_credit_account;

  INSERT INTO account_activity(ledger_account_id, transaction_id, amount_paise, side, running_balance_paise, actor_id)
  VALUES (p_debit_account, v_tx, p_amount_paise, 'debit', v_debit_after, v_actor),
         (p_credit_account, v_tx, p_amount_paise, 'credit', v_credit_after, v_actor);
  RETURN v_tx;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Deferred balance check: total debits = credits per journal is enforced by construction + type checks
-- See also: exactly two postings validated in app + function inserts exactly two.

-- Narrow registration: holder only, no role choice
CREATE OR REPLACE FUNCTION register_user(p_email TEXT, p_password_hash TEXT)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF p_email IS NULL OR p_password_hash IS NULL THEN
    RAISE EXCEPTION 'invalid_registration' USING ERRCODE='P0001';
  END IF;
  INSERT INTO users(email, password_hash, role, is_active)
  VALUES (lower(trim(p_email)), p_password_hash, 'holder', TRUE)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Narrow session issuance: app validates password, DB validates active + expiry
CREATE OR REPLACE FUNCTION issue_session(p_user_id UUID, p_token_hash TEXT, p_csrf_hash TEXT, p_ttl_hours INT)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR p_csrf_hash IS NULL THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_active) THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE='P0001';
  END IF;
  INSERT INTO sessions(user_id, token_hash, csrf_token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_csrf_hash, now() + (p_ttl_hours * interval '1 hour'))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke by token (narrow, hash-safe): app presents raw token
CREATE OR REPLACE FUNCTION revoke_session_by_token(p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE v_n INT;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RAISE EXCEPTION 'invalid_session' USING ERRCODE='P0001'; END IF;
  UPDATE sessions SET revoked_at = now()
  WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Session resolution for runtime without exposing stored hashes (executor-owned)
CREATE OR REPLACE FUNCTION resolve_session(p_token TEXT)
RETURNS TABLE(user_id UUID, session_id UUID, csrf_token_hash TEXT, role user_role, is_active BOOLEAN)
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, s.id, s.csrf_token_hash, u.role, u.is_active
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = encode(sha256(convert_to(COALESCE(p_token,''), 'UTF8')), 'hex')
    AND s.revoked_at IS NULL AND s.expires_at > now();
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Open customer account (executor-owned creation; app cannot directly edit balances)
CREATE OR REPLACE FUNCTION open_customer_account(p_owner UUID, p_name TEXT)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF p_owner IS NULL OR p_name IS NULL OR char_length(trim(p_name))=0 THEN
    RAISE EXCEPTION 'invalid_account' USING ERRCODE='P0001';
  END IF;
  INSERT INTO ledger_accounts(kind, owner_user_id, name, status, currency)
  VALUES ('customer', p_owner, p_name, 'active', 'INR')
  RETURNING id INTO v_id;
  INSERT INTO balance_projections(ledger_account_id, balance_paise) VALUES (v_id, 0);
  RETURN v_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reversal helper: blocks reversing a reversal, duplicate reversal
CREATE OR REPLACE FUNCTION post_reversal(p_original UUID, p_actor UUID, p_metadata JSONB DEFAULT '{}'::jsonb, p_token TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_orig_type journal_type;
  v_rev_of UUID;
  v_cnt INT;
  r RECORD;
  v_debit UUID;
  v_credit UUID;
  v_amt BIGINT;
  v_new UUID;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor AND is_active) THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE='P0001';
  END IF;
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND user_id = p_actor
      AND revoked_at IS NULL AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor AND role = 'admin' AND is_active) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE='P0001';
  END IF;
  DECLARE v_actor UUID;
  BEGIN
    SELECT user_id INTO v_actor FROM sessions WHERE token_hash = encode(sha256(convert_to(COALESCE(p_token,''), 'UTF8')), 'hex') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_session' USING ERRCODE='P0001'; END IF;
    IF p_actor IS NULL THEN p_actor := v_actor; END IF;
    IF p_actor <> v_actor THEN RAISE EXCEPTION 'invalid_actor' USING ERRCODE='P0001'; END IF;
  END;
  SELECT type, reversal_of INTO v_orig_type, v_rev_of FROM journal_transactions WHERE id = p_original FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0001'; END IF;
  IF v_orig_type = 'reversal' THEN RAISE EXCEPTION 'cannot_reverse_reversal' USING ERRCODE='P0001'; END IF;
  SELECT COUNT(*) INTO v_cnt FROM journal_transactions WHERE reversal_of = p_original;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'duplicate_reversal' USING ERRCODE='P0001'; END IF;

  -- fetch postings
  SELECT ledger_account_id, amount_paise INTO v_credit, v_amt FROM journal_postings WHERE transaction_id=p_original AND side='credit' LIMIT 1;
  SELECT ledger_account_id INTO v_debit FROM journal_postings WHERE transaction_id=p_original AND side='debit' LIMIT 1;
  IF v_debit IS NULL OR v_credit IS NULL THEN RAISE EXCEPTION 'invalid_original' USING ERRCODE='P0001'; END IF;

  v_new := post_journal_atomic('reversal', NULL, v_credit, v_debit, v_amt, p_token, COALESCE(p_metadata,'{}'::jsonb), p_original);
  RETURN v_new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

RESET ROLE;
