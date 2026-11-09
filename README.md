# LedgerLine

LedgerLine is an assessment-stage money-movement prototype. It combines a PostgreSQL-backed double-entry ledger and REST API with a React web interface for account holders, administrators, and auditors. It is designed to demonstrate financial invariants and authorization controls; it is not a deployed banking service or a production-readiness claim.

## Architecture and implementation status

```text
React + Vite browser
        │ JSON, cookies, CSRF header
        ▼
Express 5 + TypeScript API ─── PostgreSQL
        │                         ├── journal and balance projections
        │                         ├── sessions and account permissions
        │                         └── audit and workflow records
        └── GET /openapi.json
```

The browser and API run as separate development servers. The API enforces authorization and financial rules; frontend route guards are for user experience and are not a security boundary.

Implemented in this repository:

- Holder registration and login, opaque server-side sessions, CSRF checks, and role-based API authorization.
- Customer accounts, account-level `view`, `withdraw`, and `transfer_out` permissions, and stable-paginated statements.
- INR deposits with maker-checker approval, withdrawals, transfers, reversals, and dual-admin adjustment requests.
- Balanced journal postings, balance projections, idempotency records, audit events, and read-only reconciliation.
- React views for holder, administrator, and auditor workflows.
- OpenAPI documentation and backend tests that exercise real PostgreSQL using `embedded-postgres`.

The AI anomaly/reconciliation assistant and automatic external-bank integration are not implemented. Some frontend notices identify backend capabilities that are not exposed. Deployment and release verification are **pending and out of scope** for this assessment update. This prototype has not had a production operational review or independent security certification.

## Roles and permissions

| Application role | Implemented access |
| --- | --- |
| **Account holder** | Registration creates a holder role. A holder can see owned or explicitly permitted accounts, create an account, request a deposit for an owned/permitted account, and withdraw or transfer from an owned account or one with the corresponding permission. A holder cannot approve deposits, perform admin adjustments, reverse transactions, or access admin-only audit endpoints. |
| **Administrator** | Can view customer accounts, change account status, grant account permissions, verify deposits, request and approve adjustments (with a different admin as approver), reverse transactions, and read audit/reconciliation endpoints. Withdrawal and transfer routes still check source-account ownership/permission. |
| **Auditor** | Read-only access to account/statement and transaction data and to audit, attempt, and reconciliation endpoints. Mutating API routes reject auditor actions. Deposit-request listing remains scoped by the request's maker/account visibility logic; it is not an unrestricted auditor export. |

These are application roles. The API connects using `DATABASE_URL`, which should be configured for the `ledgerline_app` database role; the pool does not verify the connected role itself. Frontend page guards do not replace backend checks.

## Ledger and money rules

- Currency is INR and money is represented as **integer paise**. For example, `"100000"` paise is ₹1,000.00. Requests may accept safe integer numbers, but decimal strings are recommended; responses represent paise as strings. Do not convert money through JavaScript floating-point arithmetic.
- A customer account has a balance projection backed by ledger postings. A posted movement records one debit and one credit for the same positive amount. The database posting function restricts account kinds and transaction directions, writes the journal and postings, and updates projections and account activity in the same transaction.
- Transfers debit the source customer account and credit the destination customer account; total debits and credits are equal, so a transfer does not create money. Deposits debit clearing and credit the customer; withdrawals debit the customer and credit clearing. Adjustments use capital as the counterpart. A reversal appends compensating postings rather than editing the original transaction.
- Customer balances cannot become negative: amounts must be positive, the projection has a non-negative constraint, and the posting function checks available funds while locking the accounts. A failed withdrawal/transfer does not post a journal.
- Withdrawal and transfer idempotency is scoped to the actor and key. The server stores a request hash and response transactionally, serializes requests on a PostgreSQL advisory lock, replays a same-key/same-payload result, and returns `409` for a changed payload. Refusals such as insufficient funds are also recorded. Keys do not currently expire.
- Posting locks the session/user and account rows in a deterministic order. Integration tests exercise concurrent withdrawals, identical retries, opposite-direction transfers, and permission/status/session races; this is not a general load or stress-test guarantee.

## Authentication and web security

- Passwords are hashed with Argon2id. Login issues a random opaque session token; the database stores its SHA-256 hash, and the raw session is sent in the `HttpOnly` `ledgerline_session` cookie. Sessions expire and can be revoked; active-user and session validity are checked by the API and posting function.
- A separate `ledgerline_csrf` cookie is readable by browser code. Authenticated `POST`, `PATCH`, `PUT`, and `DELETE` requests require its value in `x-csrf-token`; safe `GET`, `HEAD`, and `OPTIONS` requests do not. Registration and login are unauthenticated.
- Cookies use `SameSite=Lax`; `Secure` is enabled by default in production and can be overridden with `COOKIE_SECURE`. Do not disable secure cookies in a real HTTPS deployment. The session cookie is HttpOnly; the CSRF cookie intentionally is not.
- CORS allows only origins listed in `FRONTEND_ORIGINS` (or the legacy single `FRONTEND_ORIGIN` setting) and returns credential support for an allowed origin. The local frontend and API should use the same hostname (for example both `localhost`); `localhost` and `127.0.0.1` are different origins.
- Helmet, a 16 KB JSON body limit, login-failure throttling, parameterized runtime SQL, sanitized error responses, and Pino redaction are present. These controls do not replace production rate limiting, secure secret management, monitoring, or an external security review.

## Repository structure

```text
src/
  config/                 Environment validation
  db/                     PostgreSQL pool and migration runner
  lib/                    Auth, money, logging, audit helpers
  middleware/             Authentication, errors, 404 handling
  routes/                 Auth, accounts, deposits, money, audit, admin routes
  services/               Account authorization and ledger operations
  app.ts, openapi.ts      Express app and OpenAPI document
db/
  migrations/             Versioned schema and role/grant migrations
  provision.sql           Local database-role provisioning
  grants.sql              Database grants
  bootstrap.sql           Reviewed offline opening-balance example
frontend/
  src/api/                API client and endpoint wrappers
  src/components/         Shared auth, layout, and UI components
  src/context/            Browser authentication state
  src/pages/               Holder, admin, auditor, and auth views
  src/router.tsx           Frontend routes and page guards
scripts/
  dev-seed.mjs            Development-only sample data creation
tests/                    Vitest unit, API, PostgreSQL, and lifecycle tests
.env.example              Non-secret backend configuration template
```

## Local setup

Prerequisites: Node.js 22 or newer, npm, and PostgreSQL for manual local development. The backend test suite uses `embedded-postgres`; do not point assessment tests or scripts at a shared or production database.

Install dependencies and copy the example configurations:

```bash
npm install
npm --prefix frontend install
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

In PowerShell, use `Copy-Item .env.example .env` and `Copy-Item frontend/.env.example frontend/.env.local` for the copy commands. Edit `.env` with local connection values. Do not commit `.env` or paste credentials, session cookies, or seed output into tickets or screenshots.

### Database provisioning and migrations

These steps are instructions only; review each SQL file and use a **disposable local database**. The target database must exist before provisioning. **`db/provision.sql` contains literal placeholder passwords for the application and migrator login roles. Replace those placeholders with unique local-only values before running the file. Never use the placeholders as credentials or use this script unchanged for a shared or production database.**

1. Create an empty local database named `ledgerline`.
2. Replace the provisioning SQL password placeholders and run `db/provision.sql` against that local database as a PostgreSQL administrator.
3. Configure `DATABASE_URL` for the runtime application role and `MIGRATIONS_URL` for the migrator role in `.env`. Keep credentials private.
4. Apply the versioned schema to that local database:

   ```bash
   npm run db:migrate
   ```

`npm run db:migrate` applies ordered SQL files from `db/migrations/` under an advisory lock, records them in `schema_migrations`, and applies `db/grants.sql`. Do not run it against an environment you do not own.

### Development seed

After local provisioning and migrations, optional sample data can be created with:

```bash
npm run db:seed
```

This helper upserts fixed development users and creates sample accounts/balances; it is not safe to rerun and may fail on already-used references. The script contains hard-coded development-only passwords and prints session/CSRF material in its output. Run it only against a disposable local database; never reuse its credentials, expose its output, or run it against a shared or production database. The seed script is not an HTTP endpoint. `db/bootstrap.sql` is a separate, commented, manually reviewed opening-balance example and is not part of normal setup.

## Environment configuration

The backend validates these values in [`src/config/env.ts`](./src/config/env.ts). `.env` is loaded by the Node commands that start the server, run migrations, or seed development data; existing process environment variables take precedence.

| Variable | Default / required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`; production enables `Secure` cookies unless overridden. |
| `PORT` | `3000` | API listening port, 1–65535. |
| `LOG_LEVEL` | `info` | Pino log level. |
| `DATABASE_URL` | Local PostgreSQL URL if unset | Runtime application connection. Configure a local `ledgerline_app` connection; do not put production credentials in a committed file. |
| `MIGRATIONS_URL` | Falls back to `DATABASE_URL` | Migration runner connection. The API pool uses `DATABASE_URL`, not this variable. |
| `FRONTEND_ORIGINS` | Empty | Comma-separated exact browser origins allowed by API CORS; use `http://localhost:5173` for the default Vite server. `FRONTEND_ORIGIN` is a legacy single-origin fallback. |
| `SESSION_TTL_HOURS` | `24` | Session lifetime, 1–168 hours. |
| `COOKIE_SECURE` | Production-dependent | Optional explicit `true`/`false`; leave unset for the environment default. |

The frontend reads `VITE_API_BASE_URL` at build/dev time and defaults to `http://localhost:3000`. See [`frontend/README.md`](./frontend/README.md).

## Development

Run the API and frontend in separate terminals:

```bash
npm run dev
npm run frontend:dev
```

The API listens on port 3000 by default; Vite listens on port 5173. Health endpoints are `GET /health`, `GET /health/live`, and `GET /health/ready` (the last checks database availability). `GET /openapi.json` serves the API specification.

## API overview

All amounts are integer paise. Unless noted, authenticated mutations require the CSRF header. The complete request/response contract is [`src/openapi.ts`](./src/openapi.ts), served at `GET /openapi.json`.

| Endpoint(s) | Access | Money effect |
| --- | --- | --- |
| `POST /auth/register`, `POST /auth/login` | Public; registration creates a holder | None. Login sets session and CSRF cookies. |
| `GET /auth/me`, `POST /auth/logout` | Authenticated; logout also requires CSRF | None; logout revokes the current session. |
| `GET /accounts`, `GET /accounts/:id`, `GET /accounts/:id/statement` | Authenticated; holders are scoped by ownership/permissions; admins/auditors may view all account/statement data | Read-only. Statements support `limit`, `before`, and stable `hw` high-water pagination. |
| `POST /accounts` | Holder/admin; auditors rejected | Opens an empty customer account; no opening funds. |
| `PATCH /accounts/:id/status`, `POST /accounts/:id/suspend`, `POST /accounts/:id/permission` | Admin | Account/permission state only; no journal posting. |
| `GET /deposit-requests` | Authenticated; admin sees all, other users use maker/account visibility filters | Read-only. |
| `POST /deposit-requests` | Holder/admin; auditor rejected; account access checked | Creates a pending request only. |
| `POST /deposit-requests/:id/verify-and-post` | Admin other than the maker and account holder | Debits clearing and credits the customer account. |
| `POST /withdrawals` | Holder/admin, with source-account access; auditor rejected | Debits the customer and credits clearing; insufficient funds returns `422`. |
| `POST /transfers` | Holder/admin, with source-account transfer permission; auditor rejected | Debits source and credits destination for the same amount. |
| `GET /transactions/:id` | Admin/auditor; holder if a posting touches an account they can view | Read-only. |
| `POST /transactions/:id/reverse` | Admin only | Appends a compensating transaction; may be refused if it would overdraw. |
| `POST /adjustments` | Admin only | Creates a pending request; no immediate money effect. |
| `POST /adjustments/:id/approve` | A different admin than the requester | Posts a balanced customer/capital adjustment. |
| `GET /audit/events`, `GET /audit/attempts`, `GET /audit/reconciliation` | Admin/auditor | Read-only. Reconciliation reports discrepancies; it does not repair or alert on them. |

The idempotency key is required for withdrawals and transfers. Reuse it only for retries of the same logical operation and payload; a different payload returns `409`. No public endpoint seeds account balances.

## Five-minute demonstration

Prerequisites: a disposable local database is already provisioned and migrated, and development seed data is available. The seed warnings above apply; do not capture its session output.

1. Start `npm run dev` and `npm run frontend:dev` in separate terminals; open the Vite URL.
2. Sign in as a seeded holder using the development-only credentials locally defined by the seed script. Show the holder dashboard, account balance, and statement.
3. Create a deposit request with a new, unique external reference. Confirm that the request is pending and did not yet change the balance.
4. Sign in as a seeded administrator in a separate browser profile and verify the holder's request. Show the resulting balance and posted transaction. The administrator must not be the maker or account holder.
5. Return to the holder and transfer a small test amount to the other seeded holder. Show both statements and balances.
6. Sign in as an auditor (or use the admin audit view) and show the reconciliation result and audit events. The reconciliation endpoint reports ledger/projection mismatches without silently changing data.

Do not use real funds or real personal data in the demonstration.

## Commands and verification record

Backend commands from the repository root:

```bash
npm test                    # Vitest suite, including PostgreSQL-backed tests
npm run test:integration    # Integration tests
npm run typecheck           # TypeScript without emit
npm run lint                # ESLint
npm run build               # TypeScript build to dist/
npm run verify              # Integration verification script
```

Frontend commands:

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
```

There is no frontend test script in `frontend/package.json`. The repository's `PROMPTS.md` records an earlier full-suite result of 83 passing tests across 11 files (November 6, before the November 9 migration-test startup change). Commit `473b5f0` changes the migration test's embedded PostgreSQL port and bind address, but this checkout contains no post-fix targeted-test output or post-fix full-suite record. Do not treat the earlier result as verification of that fix. No tests, builds, or database commands were run for this documentation update; deployment remains pending.
