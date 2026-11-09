# LedgerLine Prompt History

Future prompt entries must preserve this structure: Date, Prompt, Expected output, Actual output, What was wrong, Correction made, Commit link. Do not fabricate results.

---

## 1. Milestone 1 — Backend Foundation

- **Date:** 2026-11-06
- **Prompt:** Implement Milestone 1 backend foundation exactly as specified: Node.js 22, TypeScript, Express 5, Zod, Pino, Pino HTTP, Helmet, Vitest, Supertest, npm; ES modules, strict TypeScript, npm scripts, `src/` structure, Zod env validation, Express factory with Helmet/16 KB JSON/logging/health/404/error handling, Pino redaction, `GET /health`, tests, README/THREATS/PROMPTS, git hygiene; no financial functionality, no DB, no commit/push.
- **Expected output:** Production-conscious foundation with `package-lock.json`, verified `npm install`, `typecheck`, `lint`, `test`, `build`, dev/prod startup, and implementation report; no financial functionality.
- **Actual output:** Awaiting implementation review.
- **What was wrong:** Awaiting implementation review.
- **Correction made:** Awaiting implementation review.
- **Commit link:** Awaiting implementation review (no commit performed per milestone instructions).

---

## 2. Milestone 1 Correction — K1–K4

- **Date:** 2026-11-06
- **Prompt:** Implement K1–K4 corrections: K1 reliable server errors and graceful shutdown (EADDRINUSE handling, idempotent SIGINT/SIGTERM, 10s force-close), K2 error handling after headersSent (delegate via `next(err)`, never second response), K3 safer logging (no raw messages/stacks, allowlisted error metadata, no query/body secrets), K4 regression tests (400/413/500 sanitization, request-ID, log redaction, lifecycle); no dependency/architecture changes, no commit/push.
- **Actual implementation output:** `src/server.ts` adds `handleServerError` + idempotent `shutdownServer` with `closeAllConnections` timeout; `src/middleware/error-handler.ts` adds `headersSent` guard and allowlisted `errCode/status` logging; `src/lib/logger.ts` adds query/params/body/err redaction; `src/app.ts` adds query-stripping serializers; new tests `error-handling.test.ts`, `logging-security.test.ts`, `server-lifecycle.test.ts`; `THREATS.md` updated for DoS/logging rows. Verification: `typecheck PASS`, `lint PASS`, `test PASS (5 files)`, `build PASS (dist/server.js)`, `npm audit 10 moderate dev-only`, `npm audit --omit=dev 0 vulnerabilities` (see report).
- **What was wrong:** Original `server.ts` had no startup error handler, no shutdown timeout/idempotence; `error-handler.ts` logged raw `err.message/stack` + `originalUrl` with query and attempted second response after headers; request serializer logged `query` values; tests did not cover error/log/lifecycle paths.
- **Correction made:** Server errors now log only `code/syscall/address/port` and set exit code 1; shutdown stops accepting connections, allows 10s, force-closes via `closeAllConnections`, clears timer, exits 1 on forced timeout; error handler delegates when `headersSent` and logs only `requestId/method/path/errCode/status`; request logs use query-stripped serializers and retain cookie/auth/password/token redaction.
- **Commit link:** Not committed — awaiting independent review.

---

## 3. Milestone 1 Correction 2 — K5–K8

- **Date:** 2026-11-06
- **Prompt:** Implement K5 reliable `.env` loading (Node `--env-file-if-exists` for dev and prod, process-env precedence, missing file tolerance), K6 prevent sensitive URL-path leakage (no raw path/`originalUrl` logging, safe route template only), K7 graceful shutdown without `process.exit(0)` (natural exit on success, forced `closeAllConnections` + non-zero exit on timeout), K8 malformed JSON classified 400 only for body-parser `entity.parse.failed` (internal `SyntaxError` → sanitized 500); preserve K1–K4, no dependencies/architecture/Milestone 2 changes, no commit/push.
- **Expected output:** Production-conscious corrections with regression tests, doc updates, and verified `typecheck`/`lint`/`test`/`build`/`audit`/`audit --omit=dev`; no financial functionality.
- **Actual implementation output:** K5 scripts use `--env-file-if-exists=.env` with precedence/missing tests (`tests/env-loading.test.ts`); K6 adds `src/lib/safe-route.ts`, removes `url`/`path` from request and error logs in favour of `customProps`/`route` template (`tests/logging-security.test.ts` captured-log tests); K7 removes `process.exit(0)`, sets `exitCode` 0 on success, forced path exits 1 with cleared fallback timer (`tests/server-lifecycle.test.ts` real-socket tests); K8 narrows 400 to `entity.parse.failed` only (`tests/error-handling.test.ts` internal `SyntaxError` → 500). Verification: `typecheck PASS`, `lint PASS`, `test PASS (6 files, 37 tests)`, `build PASS`, `npm audit` and `npm audit --omit=dev` reported (see report).
- **What was wrong:** K6 initial safe-route attempt via Pino serializer saw `route`/`baseUrl` as `undefined` (Pino serializer receives a pre-route lightweight `req`), so `/health` template was missing from request logs; dev command rewrite needed verification that `--watch` + `--import tsx/esm` starts and honours `.env`; existing error-log test asserted raw `path` `/health` with a fake request lacking `route`.
- **Correction made:** Use `pinoHttp` `customProps` (called at response finish with Express `req.route`) to add safe template; keep serializer free of `url`/`originalUrl`; update fake test request to supply `route: {path:'/health'}` and assert template rather than raw path; verify dev/prod start commands manually against health endpoint.
- **Commit link:** Not committed — awaiting independent review.

---

## 4. Milestone 1 Final Correction — K6 route-template privacy

- **Date:** 2026-11-06
- **Prompt:** Fix `src/lib/safe-route.ts` to never use `req.baseUrl` or other request-derived concrete segments; log only registered `req.route.path` templates (e.g. `/health`, `/accounts/:accountId`), omit when unavailable; add baseUrl-privacy regression tests including nested parameterized router; preserve K5/K7/K8 and all prior log privacy; no deps/architecture/DB/auth/Milestone 2; no commit/push.
- **Expected output:** `safeRouteTemplate()` returns `req.route.path` verbatim (no `baseUrl` concatenation, no reconstruction from request values); sensitive mount values never appear in request/error logs.
- **Actual implementation output:** `src/lib/safe-route.ts` now ignores `baseUrl`/`path`/`url`/`originalUrl`/`params` and returns only `route.path` if it is a non-empty `/`-prefixed string, else `undefined`. `src/app.ts`/`src/middleware/error-handler.ts` unchanged (still `customProps`/`route` via helper). New tests in `tests/logging-security.test.ts` (`safeRouteTemplate baseUrl privacy`): secret `baseUrl` ignored, `/health` available, `/accounts/:accountId` safe, missing/unsupported → `undefined`, error-log baseUrl privacy, nested `/tenant/:tenantId` router request logs `/health` without `SECRET_TENANT_TOKEN`. Verification: `typecheck PASS`, `lint PASS`, `test PASS (6 files, 43 tests)`, `build PASS`, `npm audit 10 moderate dev-only`, `npm audit --omit=dev 0 vulnerabilities` (see report).
- **What was wrong:** Prior helper built `baseUrl + route.path`; Express `req.baseUrl` for a parameterized mount contains concrete values, so `/tenant/SECRET_TENANT_TOKEN/health` could be logged despite appearing to be a template.
- **Correction made:** Removed all `baseUrl` handling; helper returns registered `route.path` verbatim or omits; nested-router captured-log test proves concrete mount value never emitted.
- **Commit link:** Not committed — awaiting independent review.

---

## 5. Complete backend implementation — Milestones 2–9

- **Date:** 2026-11-06
- **Prompt:** Complete backend for Milestones 2–9 (PostgreSQL infrastructure, Argon2id auth/sessions/CSRF, double-entry ledger, accounts/authz, maker-checker deposits, withdrawals/transfers with idempotency/concurrency, statements/audit/reconciliation, reversals/adjustments) plus full API/OpenAPI and real-PostgreSQL integration tests; preserve Milestone 1; no frontend/AI; no commit/push.
- **Actual implementation output:** Added `pg`+`argon2` runtime and `embedded-postgres` (dev, real-PG test harness) deps; `db/migrations/001_init.sql` (users/sessions/accounts/ledger/idempotency/activity/deposits/adjustments/audit + `post_journal_atomic`/`post_reversal`/`open_customer_account`), `002_roles_grants.sql` (migrator/executor/app grants, system accounts), `db/provision.sql`, `db/bootstrap.sql`, `src/db/{pool,migrate}.ts`, auth/accounts/deposits/money/transactions/adjustments/audit routes, `src/openapi.ts`, docs. Integration suite `tests/integration.test.ts` (14 tests, real PG 18 via embedded-postgres) covers registration/auth/session revocation, role/authz, maker-checker deposits, withdrawal/transfer, conservation, insufficient funds, concurrent withdrawals, duplicate idempotency (same/diff payload), opposite transfers, duplicate external refs, ledger update/delete rejection, auditor write rejection, duplicate reversal, adjustment separation, statement pagination, reconciliation, balance-privilege check. Follow-up fixes after first integration run: account-list `DISTINCT`/`ORDER BY` bug, savepoint-wrapped posting for business refusals, normal-balance accounting (clearing debit-normal vs capital/customer credit-normal), reversal `reversal_of` at insert, advisory-lock idempotency serialization, capital seed via bootstrap-equivalent in tests, and graceful-shutdown best-effort pool close.
- **Verification:** `typecheck PASS`, `lint PASS`, `test PASS (7 files, 57 tests incl. 14 integration)`, `build PASS`, `npm audit 10 moderate dev-only`, `npm audit --omit=dev 0` (see report).
- **Commit link:** Not committed — awaiting independent review.

---

## 6. Complete backend self-audit — correction

- **Date:** 2026-11-06
- **Prompt:** Independently inspect source/migrations/SQL/routes/tests, verify against real PostgreSQL, probe failure modes (unbalanced, negative, duplicate, concurrent, unauthorized, ledger-mod, self-approval), fix defects without architecture change, rerun suite, report defects/severity/fixes/remaining risks.
- **Actual output:** Baseline `npm test` 57 passed, then disposable probe proved 3 defects (see below); added `tests/audit-regression.test.ts` (7 tests). Fixes: pool no longer uses `MIGRATIONS_URL`; `post_journal_atomic` hardened with same-account/actor-active/status/direction/role/permission validation including reversal-mirroring; `post_reversal` requires active actor; deposits reject suspended accounts; `requestHashOf` upgraded FNV→SHA-256; money-routes `assertAccountActive` no longer writes response inside tx (throws to outer handler). Final: `npm test PASS (8 files, 64 tests)`.
- **Commit link:** Not committed — awaiting independent review.

---

## 7. Independent review correction pass — K1–K7

- **Date:** 2026-11-06
- **Prompt:** Session-derived DB actor (K1), executor ownership/revoke (K2), admin reversal + serialization (K3), stable pagination (K4), durable refusals (K5), runtime-role suite (K6), permission/status serialization (K7); new regressions, no redesign, no commit/push.
- **Actual output:** K1 `p_token` raw hashing in DB, `resolve_session` without hash exposure, `post_bootstrap_opening` separate offline function, column-level session/user grants; K2 executor ownership + `REVOKE FROM PUBLIC` verified via catalogs, `db/provision.sql` superuser boundary documented; K3 `post_journal_atomic` reversal branch admin+duplicate checks + `uq_single_reversal`, `post_reversal` `FOR UPDATE`; K4 `?hw=` bound; K5 committed `refusal` (403/422 + attempts); K6 `runtime-role.test.ts` + `migrator.test.ts` actual-role suites; K7 session→idempotency→resource→accounts sorted locks + genuine overlap PG-client races. Final: `npm test PASS (11 files, 83 tests)`.
- **Commit link:** Not committed — awaiting independent review.

---

## 8. Embedded PostgreSQL migration-test startup correction

- **Date:** 2026-11-09
- **Prompt:** The original prompt text is not preserved in this repository. The task recoverable from the fix commit was to correct the embedded PostgreSQL startup configuration used by `tests/migrator.test.ts`.
- **Issue and diagnosis:** The embedded PostgreSQL instance used by the migration test was reported as failing to start reliably. The evidence retained in the fix is the test configuration diff: its port changed from `54405` to `54406`, and the server was explicitly bound to `127.0.0.1`. The original startup error output is not preserved here, so the exact OS/network cause and the individual necessity of each setting cannot be independently confirmed.
- **Changes implemented:** `tests/migrator.test.ts` now uses port `54406` and passes `postgresFlags: ['-c', 'listen_addresses=127.0.0.1']` to the embedded server. These are the only changes shown by the fixing commit.
- **Verification:** This checkout contains the targeted migration tests, but no post-fix targeted-test output was found; they were not run during this documentation task because database provisioning and migration execution were explicitly out of scope. The latest full-suite result recorded in the preceding entry is `PASS (11 files, 83 tests)` from November 6, before this fix. No post-fix full-suite result is recorded here, and the earlier result must not be interpreted as verification of the November 9 change.
- **AI suggestions vs. implemented changes:** No AI transcript or specific AI suggestion for this fix is preserved in the repository, so none is attributed. The test-configuration changes described above are those present in the committed source.
- **Commit:** `473b5f0` (actual fixing commit; no permalink is recorded in this repository).
