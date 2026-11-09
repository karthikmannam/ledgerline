# LedgerLine threat model

This register describes controls present in the checked-in source and migrations, not planned controls. Tests listed below are evidence for the specific behaviors they exercise, not proof that the system is secure. This assessment prototype has not had a full adversarial, load, or production-operations review.

## 1. Unauthorized account access and privilege escalation

- **Attack scenario:** A holder guesses an account or transaction ID, changes a request role, or attempts to use another account's permissions to read or move funds.
- **Existing mitigation:** The API derives identity and role from a resolved server-side session. Account reads check ownership or `view`; withdrawals/transfers check the source account's ownership or relevant permission; the posting function rechecks actor/session status, role, direction, and holder source-account permission. Registration calls a database function that assigns the default holder role rather than accepting a role from the request. Admin-only operations use server-side role checks.
- **Evidence:** [`src/middleware/auth.ts`](./src/middleware/auth.ts), [`src/services/authz.ts`](./src/services/authz.ts), [`src/routes/accounts.routes.ts`](./src/routes/accounts.routes.ts), [`src/routes/money.routes.ts`](./src/routes/money.routes.ts), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); [`tests/integration.test.ts`](./tests/integration.test.ts) covers cross-holder access and role escalation; [`tests/concurrency.test.ts`](./tests/concurrency.test.ts) covers permission revocation racing with a transfer.
- **Residual risk / unverified:** No dedicated fuzzing of IDs, role claims, or every route's authorization matrix was found. Admin and auditor roles can view broadly by design. Frontend guards are not a security boundary.

## 2. Duplicate requests and idempotency

- **Attack scenario:** A client times out after a successful withdrawal/transfer and retries, or reuses a key with changed account or amount data.
- **Existing mitigation:** Withdrawals and transfers use actor-scoped idempotency records with a SHA-256 request hash, PostgreSQL advisory transaction lock, and stored response. Same-payload retries replay; changed payloads return `409`. Business refusals are stored as well.
- **Evidence:** [`src/routes/money.routes.ts`](./src/routes/money.routes.ts), [`src/services/ledger.ts`](./src/services/ledger.ts), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); [`tests/integration.test.ts`](./tests/integration.test.ts) covers identical and changed requests and concurrent identical requests; [`tests/audit-regression.test.ts`](./tests/audit-regression.test.ts) covers durable refusals and request hashes.
- **Residual risk / unverified:** Idempotency records have no expiry or cleanup policy. External callers must persist keys for the lifetime of an operation and avoid accidental reuse; high-volume storage behavior was not tested.

## 3. Concurrent withdrawals and transfers

- **Attack scenario:** Concurrent withdrawals spend the same apparent balance, or opposite-direction transfers acquire locks in inconsistent order and deadlock.
- **Existing mitigation:** Posting runs in a database transaction, locks account rows in deterministic ID order, checks current projection balances, and updates postings/projections atomically. Idempotency and resource lock ordering serialize relevant operations.
- **Evidence:** [`src/routes/money.routes.ts`](./src/routes/money.routes.ts), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); [`tests/integration.test.ts`](./tests/integration.test.ts) covers concurrent withdrawals, identical retries, and opposite transfers; [`tests/concurrency.test.ts`](./tests/concurrency.test.ts) exercises races with user/session/account/permission state changes.
- **Residual risk / unverified:** Tests exercise specific overlap cases, not broad contention, long-running transactions, multi-process load, failover, or production database isolation/timeout behavior.

## 4. Negative balances and overdrafts

- **Attack scenario:** A caller submits zero, negative, malformed, or oversized money, or races a withdrawal against another posting to spend more than the available balance.
- **Existing mitigation:** Request parsing accepts only positive paise; SQL posting amounts must be positive; balance projections have a non-negative constraint; posting checks available customer funds while holding account locks. Insufficient funds is refused without a journal posting.
- **Evidence:** [`src/lib/money.ts`](./src/lib/money.ts), [`src/routes/money.routes.ts`](./src/routes/money.routes.ts), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); [`tests/integration.test.ts`](./tests/integration.test.ts), [`tests/audit-regression.test.ts`](./tests/audit-regression.test.ts), and [`tests/concurrency.test.ts`](./tests/concurrency.test.ts) cover insufficient funds and races.
- **Residual risk / unverified:** Maximum amount and long-term `BIGINT` capacity limits are not documented as a business policy. Overflow boundaries and unusually large valid amounts were not independently tested here.

## 5. SQL injection and database privileges

- **Attack scenario:** An attacker supplies SQL syntax through an API field, or compromises the runtime API credentials and directly edits ledger rows, roles, or balances.
- **Existing mitigation:** Runtime routes pass input values as query parameters. The runtime `ledgerline_app` role is distinct from the migrator and `ledgerline_executor`; grants limit direct journal/projection writes, and posting functions are `SECURITY DEFINER` with a fixed `search_path` and revoked public execution. The runtime role does not receive migrator/executor membership.
- **Evidence:** [`src/routes/`](./src/routes/), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql), [`db/migrations/002_roles_grants.sql`](./db/migrations/002_roles_grants.sql), [`db/grants.sql`](./db/grants.sql); [`tests/runtime-role.test.ts`](./tests/runtime-role.test.ts), [`tests/migrator.test.ts`](./tests/migrator.test.ts), and [`tests/integration.test.ts`](./tests/integration.test.ts) check role ownership and direct-write restrictions.
- **Residual risk / unverified:** No dedicated SQL-injection fuzz test was found; parameterization is based on source review. The pool trusts `DATABASE_URL` and does not check the connected database role, so least privilege depends on correct local/deployment configuration. Provisioning and migration credentials are powerful. A compromised PostgreSQL superuser or migrator can alter grants/functions or bypass triggers. `db/provision.sql` contains placeholder passwords that must be replaced before use.

## 6. Session theft and CSRF

- **Attack scenario:** Malware, a logging/debugging path, or a cross-site request steals or abuses an authenticated browser session.
- **Existing mitigation:** Sessions use random opaque tokens with SHA-256 hashes stored in the database, expiry/revocation, active-user checks, `HttpOnly` session cookies, `SameSite=Lax`, and `Secure` cookies by default in production. Mutating authenticated requests validate a separate CSRF token hash presented in `x-csrf-token`. CORS reflects only explicitly configured origins with credentials.
- **Evidence:** [`src/lib/auth.ts`](./src/lib/auth.ts), [`src/middleware/auth.ts`](./src/middleware/auth.ts), [`src/routes/auth.routes.ts`](./src/routes/auth.routes.ts), [`src/app.ts`](./src/app.ts); [`tests/integration.test.ts`](./tests/integration.test.ts) covers login/logout/session behavior; [`tests/env-loading.test.ts`](./tests/env-loading.test.ts) covers environment loading.
- **Residual risk / unverified:** Session rotation on use is not implemented. The CSRF cookie is intentionally readable by JavaScript, and XSS prevention/content policy has not been independently reviewed. `COOKIE_SECURE=false` can override production defaults. Cookie-domain and cross-site deployment behavior are not verified; deployment is pending.

## 7. Ledger tampering, conservation, and append-only behavior

- **Attack scenario:** An application user or database operator edits/deletes a posted journal, inserts an unbalanced posting, or changes a balance projection without a corresponding transaction.
- **Existing mitigation:** The posting function creates exactly two equal postings with type-specific account direction checks and updates projections/activity in the same transaction. Update/delete triggers reject modifications to journal transactions and postings. Runtime grants deny direct journal and projection writes. Reconciliation recomputes account balances from postings and compares total debits with credits; it reports discrepancies without silently repairing them.
- **Evidence:** [`db/migrations/001_init.sql`](./db/migrations/001_init.sql), [`db/migrations/002_roles_grants.sql`](./db/migrations/002_roles_grants.sql), [`src/routes/audit.routes.ts`](./src/routes/audit.routes.ts); [`tests/audit-regression.test.ts`](./tests/audit-regression.test.ts) checks exactly-two balanced postings; [`tests/integration.test.ts`](./tests/integration.test.ts) and [`tests/runtime-role.test.ts`](./tests/runtime-role.test.ts) check direct-write rejection and reconciliation.
- **Residual risk / unverified:** Triggers and grants do not protect against a PostgreSQL superuser or privileged migrator. Reconciliation is a request-time read endpoint; it does not alert operators, repair drift, or provide an independently immutable audit store.

## 8. Duplicate deposits and insider abuse

- **Attack scenario:** A user or administrator claims the same external funding reference twice, approves their own request, credits an account they own, or uses privileged access to create unsupported funds.
- **Existing mitigation:** Deposit requests and posted journal external references are unique. A request does not post funds; posting requires an admin checker who is neither the maker nor the account holder. Admin adjustments require a different admin to approve, and admin/security actions are recorded as audit events. The application exposes no general balance-seeding endpoint.
- **Evidence:** [`src/routes/deposits.routes.ts`](./src/routes/deposits.routes.ts), [`src/routes/adjustments.routes.ts`](./src/routes/adjustments.routes.ts), [`src/lib/audit.ts`](./src/lib/audit.ts), [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); [`tests/integration.test.ts`](./tests/integration.test.ts) covers duplicate references, maker-checker, and adjustment separation.
- **Residual risk / unverified:** There is no external bank/payment-provider verification or webhook integration; evidence is supplied manually. Colluding administrators and database operators are not prevented. The development seed has fixed credentials and emits session/CSRF material, so it must remain local-only.

## 9. Denial of service and resource exhaustion

- **Attack scenario:** A client floods login or API endpoints, submits oversized bodies, or creates lock/pool contention to exhaust CPU, database connections, or storage.
- **Existing mitigation:** JSON bodies are limited to 16 KB, Helmet is enabled, the PostgreSQL pool has a maximum of 10 connections and a 5-second connection timeout, and login failures are throttled after five recent failures per email or IP within 15 minutes. Server shutdown has a bounded graceful-close period.
- **Evidence:** [`src/app.ts`](./src/app.ts), [`src/routes/auth.routes.ts`](./src/routes/auth.routes.ts), [`src/db/pool.ts`](./src/db/pool.ts), [`src/server.ts`](./src/server.ts); [`tests/error-handling.test.ts`](./tests/error-handling.test.ts) and [`tests/server-lifecycle.test.ts`](./tests/server-lifecycle.test.ts).
- **Residual risk / unverified:** No general API rate limit, deployment-level request limit, lock/statement timeout policy, or load/stress test was verified in this checkout. Login-attempt records have no cleanup/retention policy. Helmet/body limits alone do not prevent DoS.

## 10. Sensitive information in logs and development output

- **Attack scenario:** Session cookies, CSRF values, passwords, query parameters, request bodies, concrete secret-bearing paths, or database error details are retained in logs or copied into assessment artifacts.
- **Existing mitigation:** Pino redacts cookie/auth headers, request URL/query/params/body, and error message/stack fields. Request/error logs use a registered route template rather than a concrete path; API errors are generic. The frontend seed is not exposed as an API endpoint.
- **Evidence:** [`src/lib/logger.ts`](./src/lib/logger.ts), [`src/lib/safe-route.ts`](./src/lib/safe-route.ts), [`src/middleware/error-handler.ts`](./src/middleware/error-handler.ts), [`scripts/dev-seed.mjs`](./scripts/dev-seed.mjs); [`tests/logging-security.test.ts`](./tests/logging-security.test.ts) checks captured logs and route-template privacy.
- **Residual risk / unverified:** `scripts/dev-seed.mjs` prints a session and CSRF material to stdout and contains fixed development passwords; never share or retain that output. Migration failures log database error text. Log sinks, retention, access control, and production log redaction are not verified. Do not include secrets in screenshots or assessment artifacts.

## Overall trust boundary

The API runtime role is constrained by database grants, but the migrator and PostgreSQL superuser are trusted administrators who can alter the schema and ledger controls. A compromised API process can exercise its granted functions and modify some non-ledger workflow data. Before any deployment, replace provisioning placeholders, isolate and rotate credentials, review seed behavior, define operational monitoring/retention and rate limits, test recovery and backups, and perform an independent security and deployment review. These are residual requirements, not implemented controls.
