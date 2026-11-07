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
