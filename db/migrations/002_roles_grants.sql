-- Role grants owned by migrator (schema owner); superuser grants live in db/grants.sql.
-- These grants must be applied by a migrator that can create and own schema objects, but the
-- execution role still owns the SECURITY DEFINER functions that enforce the runtime trust boundary.
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerline_executor;
GRANT USAGE ON SCHEMA public TO ledgerline_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ledgerline_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ledgerline_app;
-- Revoke from migrator-owned functions (log_audit_event, forbid_update) as migrator.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ledgerline_app;
GRANT SELECT ON users, sessions, ledger_accounts, account_permissions TO ledgerline_executor;
GRANT SELECT, INSERT, UPDATE ON ledger_accounts TO ledgerline_executor;
GRANT SELECT, UPDATE ON users, sessions TO ledgerline_executor;
GRANT INSERT ON users, sessions TO ledgerline_executor;
GRANT SELECT, INSERT, UPDATE ON balance_projections TO ledgerline_executor;
GRANT SELECT, INSERT, UPDATE ON journal_transactions, journal_postings TO ledgerline_executor;
GRANT INSERT ON account_activity TO ledgerline_executor;
-- The security-definer functions are created under the executor role so they retain the
-- correct ownership without requiring a later ALTER FUNCTION ... OWNER TO, which hits the
-- public schema ACL checks and fails under the migrator-only execution path.
-- Must run as ledgerline_executor to revoke PUBLIC from executor-owned functions.
SET ROLE ledgerline_executor;
REVOKE ALL ON FUNCTION post_bootstrap_opening(uuid, uuid, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_journal_atomic(journal_type, text, uuid, uuid, bigint, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_reversal(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION open_customer_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_session(uuid, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_session_by_token(text) FROM PUBLIC;
RESET ROLE;
GRANT EXECUTE ON FUNCTION resolve_session(text) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION register_user(text, text) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION issue_session(uuid, text, text, int) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION revoke_session_by_token(text) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION post_journal_atomic(journal_type, text, uuid, uuid, bigint, text, jsonb, uuid) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION post_reversal(uuid, uuid, jsonb, text) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION open_customer_account(uuid, text) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION log_audit_event(uuid, text, text, text, jsonb) TO ledgerline_app;
GRANT SELECT, INSERT ON TABLE auth_rate_limits, attempts TO ledgerline_app;
GRANT SELECT, INSERT ON TABLE account_permissions, idempotency_records TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE ON TABLE deposit_requests, adjustment_requests TO ledgerline_app;
GRANT SELECT ON TABLE audit_events TO ledgerline_app;
GRANT SELECT (id, email, password_hash, role, is_active, created_at) ON TABLE users TO ledgerline_app;
GRANT SELECT (id, user_id, expires_at, revoked_at, created_at) ON TABLE sessions TO ledgerline_app;
GRANT SELECT ON TABLE ledger_accounts, journal_transactions, journal_postings, balance_projections, account_activity TO ledgerline_app;
GRANT USAGE ON SEQUENCE auth_rate_limits_id_seq TO ledgerline_app;
