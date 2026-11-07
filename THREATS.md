# LedgerLine Threat Register — Milestone 1

This is an initial register for the backend foundation milestone. Most financial controls are **planned, not implemented**, at this stage.

| # | Threat | Potential impact | Planned mitigation | Current status (Milestone 1) | Residual risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Unauthorized account access** | Viewing or acting on another holder's account | Server-side per-account authorization on every request; ownership checks in Financial Service | Not implemented — no accounts | High until authz milestone |
| 2 | **Session theft and impersonation** | Attacker acts as victim, moves funds | Opaque server-side sessions, token hash at rest, `httpOnly; Secure; SameSite`, rotation, CSRF, expiry | Not implemented — no sessions | High until session milestone |
| 3 | **Duplicate requests and replay** | Double debit/credit from retries | Idempotency `(actor_id, key)` + request hash, same-txn result storage | Not implemented — no financial endpoints | High until idempotency milestone |
| 4 | **Concurrent spending** | Overdraft / negative balances under race | `READ COMMITTED` + ordered `SELECT FOR UPDATE` + conditional updates | Not implemented — no balances | High until concurrency milestone |
| 5 | **SQL injection** | Data breach, ledger tampering | Parameterized `pg` queries only, no string-concatenated SQL, function allow-list | No DB yet; foundation has no SQL | Low at foundation; must remain enforced |
| 6 | **Privilege escalation** | Holder gains admin powers | Least-privilege DB roles (app vs migrator vs auditor), no admin bypass, server-derived actor | Not implemented | High until roles milestone |
| 7 | **Direct database manipulation** | Balance/ledger edits outside pipeline | `REVOKE UPDATE/DELETE` + immutability triggers + `SECURITY DEFINER` posting function | Not implemented — no DB | High until append-only milestone |
| 8 | **Duplicate external deposits** | Phantom money from double-claimed funding | Unique `external_reference` + maker-checker verification (initiator≠verifier, holder≠verifier) | Not implemented | High until deposit milestone |
| 9 | **Insider abuse** | Admin creates funds, reverses audit | Separation of duties, audited admin actions, no admin balance bypass, seed restricted to system | Not implemented | High until admin controls |
| 10 | **Ledger corruption** | Unbalanced journals, projection drift | Deferred balanced-journal trigger (sum=envelope=type rules) + reconciliation job | Not implemented | High until ledger milestone |
| 11 | **Denial of service** | Lock contention, huge payloads, log flooding | 16 KB JSON limit, Helmet, lock/statement timeouts, rate limiting, pool caps | Implemented: 16 KB limit + Helmet; shutdown idempotent with 10s force-close and EADDRINUSE handling; graceful shutdown sets exit code 0 and exits naturally (no `process.exit(0)`), forced timeout calls `closeAllConnections()` and exits non-zero | Medium |
| 12 | **Sensitive information leaking through logs** | Tokens/passwords in logs | Pino redaction (cookies, auth headers, tokens), allowlisted error metadata only, query/body stripped, `headersSent` delegation, generic 500s, no stack/query in logs | Implemented: redaction + no raw `url`/`originalUrl`/`path`/`baseUrl` logging (safe route template only via `safeRouteTemplate` returning `req.route.path` verbatim, e.g. `/accounts/:accountId`; `baseUrl` and all request-derived segments are ignored so parameterized mounts cannot leak; unmatched paths omitted) + generic 500s; malformed JSON 400 only for `entity.parse.failed`, internal `SyntaxError` → 500; env config via `node --env-file-if-exists=.env` with process-env precedence and missing-file tolerance | Low for foundation; must audit after auth/session added |

Implementation status legend: **Implemented** = present in this milestone; **Partial** = foundation control only; **Not implemented** = planned for future authorized milestone.
