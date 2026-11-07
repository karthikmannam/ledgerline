# LedgerLine

## Problem statement

LedgerLine is a secure money-movement and ledger-integrity system designed to move money between accounts while guaranteeing that money is never created or lost, internal transfers conserve money, accounts cannot be overdrawn, the same request cannot execute twice, concurrent requests cannot corrupt balances, every movement (or refusal) is traceable, ledger records are append-only, and account-level authorization is enforced server-side.

This is not a generic CRUD application. Financial correctness, security, concurrency, and auditability take priority over feature quantity.

## Current technology stack

- **Backend:** Node.js 22, TypeScript (strict), Express 5
- **Database:** PostgreSQL via `pg` (explicit SQL, no ORM for financials)
- **Auth:** Argon2id, opaque server-side sessions, HttpOnly/Secure/SameSite cookies, CSRF
- **Validation:** Zod
- **Logging:** Pino + pino-http
- **Security headers:** Helmet
- **Testing:** Vitest + Supertest (real PostgreSQL via `embedded-postgres` in integration tests)
- **Dev execution:** `tsx`
- **Package manager:** npm

React frontend and AI features are not in this backend milestone (see Implementation status).

## Project structure

```text
ledgerline/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── db/
│   │   ├── pool.ts
│   │   └── migrate.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── error-handler.ts
│   │   └── not-found.ts
│   ├── routes/
│   │   ├── accounts.routes.ts
│   │   ├── adjustments.routes.ts
│   │   ├── audit.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── deposits.routes.ts
│   │   ├── health.routes.ts
│   │   ├── money.routes.ts
│   │   └── transactions.routes.ts
│   ├── services/
│   │   ├── authz.ts
│   │   └── ledger.ts
│   ├── lib/
│   │   ├── audit.ts
│   │   ├── auth.ts
│   │   ├── logger.ts
│   │   ├── money.ts
│   │   └── safe-route.ts
│   ├── openapi.ts
│   ├── app.ts
│   └── server.ts
├── db/
│   ├── bootstrap.sql
│   ├── provision.sql
│   └── migrations/
├── tests/
│   ├── audit-regression.test.ts
│   ├── env-loading.test.ts
│   ├── error-handling.test.ts
│   ├── health.test.ts
│   ├── integration.test.ts
│   ├── logging-security.test.ts
│   ├── not-found.test.ts
│   ├── runtime-role.test.ts
│   └── server-lifecycle.test.ts
├── .env.example
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.js
├── package.json
└── package-lock.json
```

## Prerequisites

- Node.js 22 or newer (`node --version`)
- npm (`npm --version`)

## Installation

```bash
npm install
```

## Development startup

```bash
npm run dev
```

Development server starts with automatic reload via Node `--watch` and `tsx` (`node --env-file-if-exists=.env --import tsx/esm --watch src/server.ts`). Default port is `3000` (override with `PORT`).

## Build and test commands

```bash
npm run build       # compile TypeScript into dist/
npm run start       # run compiled production server
npm run typecheck   # type-check without emitting files
npm run lint        # run ESLint
npm test            # run Vitest once (incl. real-PostgreSQL integration via embedded-postgres)
npm run test:integration # integration tests only
npm run db:migrate  # run SQL migrations (MIGRATIONS_URL / DATABASE_URL)
npm run test:watch  # run Vitest in watch mode
```

Local DB: run `db/provision.sql` once as superuser, then `npm run db:migrate`. Integration tests spin a real PostgreSQL 18 via `embedded-postgres` (no system DB required).

## Health endpoint

```http
GET /health
```

Success response (`200`):

```json
{
  "status": "ok",
  "service": "ledgerline-api"
}
```

`GET /health/ready` reports DB readiness (`503` when PostgreSQL is unreachable); `GET /health/live` is a liveness probe.

Unknown routes return `404`:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Not found"
  }
}
```

Internal errors return generic `500`:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  }
}
```

No stack traces, SQL details, filesystem paths, or credentials are exposed in responses.

## Environment configuration

Validated at startup by Zod in `src/config/env.ts`:

| Variable    | Required | Default         | Description |
| ----------- | -------- | --------------- | ----------- |
| `NODE_ENV`  | No       | `development`   | `development`, `test`, or `production` |
| `PORT`      | No       | `3000`          | TCP port, 1–65535 |
| `LOG_LEVEL` | No       | `info`          | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `DATABASE_URL` | No | `postgres://ledgerline_app:...@localhost:5432/ledgerline` | Runtime app-role connection |
| `MIGRATIONS_URL` | No | — (falls back to `DATABASE_URL`) | Migrator connection |
| `SESSION_TTL_HOURS` | No | `24` | Opaque session lifetime (1–168) |

Copy the example file and adjust for local development:

```bash
cp .env.example .env
```

Both startup commands load `.env` via Node.js built-in `--env-file-if-exists=.env` (`npm run dev` and `npm run start`): variables already set in the process/deployment environment take precedence and are not overwritten by `.env`; a missing `.env` does not prevent startup. Do not commit `.env`.

## Frontend integration guide

The API supports a separate Vite dev origin, provided it is explicitly allowed and remains same-site with the API (the default `SameSite=Lax` session cookies are not intended for cross-site hosting).

1. Configure the exact frontend origin in `.env` using `FRONTEND_ORIGINS` (comma-separated values):
   ```bash
   FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   ```
2. Register, then log in. Registration creates a holder but does not log the browser in. Login sets `ledgerline_session` (HttpOnly) and `ledgerline_csrf` (readable by browser JavaScript) cookies.
3. Use `credentials: 'include'` for every API request. For authenticated non-GET requests, read `ledgerline_csrf` from `document.cookie` and send its value in `x-csrf-token`. This includes logout and requests that do not have a JSON body. GET requests do not need a CSRF header.
4. Example browser helper:
   ```js
   const API = 'http://localhost:3000';

   function csrfToken() {
     const cookie = document.cookie.split('; ').find((part) => part.startsWith('ledgerline_csrf='));
     return cookie ? decodeURIComponent(cookie.slice('ledgerline_csrf='.length)) : '';
   }

   async function api(path, options = {}) {
     const method = (options.method ?? 'GET').toUpperCase();
     const headers = new Headers(options.headers);
     if (options.body !== undefined) headers.set('Content-Type', 'application/json');
     if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
       const token = csrfToken();
       if (token) headers.set('x-csrf-token', token);
     }

     const response = await fetch(`${API}${path}`, {
       ...options,
       method,
       headers,
       credentials: 'include'
     });
     const body = await response.json();
     if (!response.ok) {
       throw Object.assign(new Error(body.error?.message ?? 'Request failed'), {
         status: response.status,
         code: body.error?.code
       });
     }
     return body;
   }

   await api('/auth/register', {
     method: 'POST',
     body: JSON.stringify({ email: 'holder@example.test', password: 'a-long-demo-password' })
   });
   await api('/auth/login', {
     method: 'POST',
     body: JSON.stringify({ email: 'holder@example.test', password: 'a-long-demo-password' })
   });
   const accounts = await api('/accounts');
   ```
5. Amounts are positive integer paise, preferably sent as decimal strings (for example `"100000"` = ₹1000.00); responses also use paise strings. Do not convert money through JavaScript floating-point arithmetic.
6. API errors use `{ "error": { "code": "...", "message": "..." } }`. Handle HTTP status and `error.code`; expected refusals include `FORBIDDEN`, `INSUFFICIENT_FUNDS`, and `ACCOUNT_NOT_ACTIVE`.
7. `GET /openapi.json` describes payloads, response shapes, authentication, CSRF, pagination, and role restrictions. Sessions are opaque; never obtain or copy session tokens from server logs.

Common frontend flows:

- Accounts: `GET /accounts`, `POST /accounts` with `{ "name": "Main" }`, and `GET /accounts/{id}/statement`. Statement pagination returns `highWater` and `nextBefore`; pass both back as `hw` and `before` to continue a stable snapshot.
- Deposits: `POST /deposit-requests` with `{ "accountId": "...", "amount": "100000", "externalReference": "..." }`. An admin other than the maker and account holder verifies it with `POST /deposit-requests/{id}/verify-and-post`.
- Transfers: `POST /transfers` with `{ "idempotencyKey": "...", "fromAccountId": "...", "toAccountId": "...", "amount": "1000", "currency": "INR" }`. Persist a key for a logical operation and reuse it only for retries of the same payload. Reuse with a different payload returns `409`.
- Role-specific tools: auditors are read-only; administrators manage account status/permissions, verify deposits, reverse transactions, request adjustments, and inspect audit/reconciliation endpoints. Admin adjustments require approval by a different admin.

## Controlled development bootstrap

Use the controlled dev bootstrap script after provisioning and running migrations:

```bash
npm run db:seed
```

This creates a local admin, an auditor, and two holders with sample account data and an opening balance for each holder. The script is intentionally offline and not exposed as an HTTP endpoint. It uses local test credentials only; do not reuse them in production.

## Local smoke test

The backend includes a full end-to-end smoke test that verifies:

- admin and holder authentication
- account creation
- deposit approval
- transfer execution
- statement retrieval
- reconciliation
- reversal

Run it with:

```bash
npm test
```

## API

All financial amounts are integer paise strings (`"100000"` = ₹1000.00), currency `INR`. Authenticated non-GET requests require `x-csrf-token` (from login). Sessions set `ledgerline_session` (HttpOnly) + `ledgerline_csrf` cookies.

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET /accounts`, `POST /accounts`, `GET /accounts/:id`, `PATCH /accounts/:id/status`, `POST /accounts/:id/suspend`, `POST /accounts/:id/permission`, `GET /accounts/:id/statement?limit=&before=&hw=`
- `GET /deposit-requests`, `POST /deposit-requests`, `POST /deposit-requests/:id/verify-and-post`
- `POST /withdrawals`, `POST /transfers` (both `{idempotencyKey, amount, currency:"INR", …}`; same key+payload replays, differing payload `409`)
- `GET /transactions/:id`, `POST /transactions/:id/reverse`
- `POST /adjustments`, `POST /adjustments/:id/approve`
- `GET /audit/events`, `GET /audit/attempts`, `GET /audit/reconciliation` (admin/auditor)
- `GET /openapi.json`, `GET /health`, `GET /health/ready`, `GET /health/live`

## Implementation status

Milestones 2–9 backend is implemented in this delivery:

- ✅ PostgreSQL pool, versioned migrations with advisory-lock protection, provision/bootstrap scripts, roles (`migrator`/`executor` NOLOGIN/`app`)
- ✅ Argon2id registration/login, opaque hashed sessions, CSRF, rate limiting, role + per-account authz
- ✅ Balanced double-entry ledger (`BIGINT` paise, deferred constraints, append-only triggers, SECURITY DEFINER posting functions)
- ✅ Accounts/permissions, maker-checker deposits, withdrawals/transfers with deterministic locks, idempotency, concurrency checks
- ✅ Statements (running balance, high-water pagination), audit events, reconciliation (ledger recomputation, no silent correction)
- ✅ Reversals (compensating entries, no double reversal) and admin adjustments (dual admins, capital counterpart)
- ✅ OpenAPI at `GET /openapi.json`; integration tests against real PostgreSQL

**Not in this backend milestone:**

- ❌ React frontend (Milestone 10)
- ❌ AI anomaly/reconciliation assistant (Milestone 11)
- ❌ Final deployment/release verification (Milestone 12)
- ❌ Automatic external bank integration; no public balance-seeding endpoint (opening balances via `db/bootstrap.sql` only)

Database trust boundary: a compromised app process or PostgreSQL superuser can bypass function-level controls; see `THREATS.md`.

## License

No license has been added in this milestone.
