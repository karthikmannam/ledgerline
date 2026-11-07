# LedgerLine

## Problem statement

LedgerLine is a secure money-movement and ledger-integrity system designed to move money between accounts while guaranteeing that money is never created or lost, internal transfers conserve money, accounts cannot be overdrawn, the same request cannot execute twice, concurrent requests cannot corrupt balances, every movement (or refusal) is traceable, ledger records are append-only, and account-level authorization is enforced server-side.

This is not a generic CRUD application. Financial correctness, security, concurrency, and auditability take priority over feature quantity.

## Current technology stack

- **Backend:** Node.js 22, TypeScript (strict), Express 5
- **Validation:** Zod
- **Logging:** Pino + pino-http
- **Security headers:** Helmet
- **Testing:** Vitest + Supertest
- **Dev execution:** `tsx`
- **Package manager:** npm

PostgreSQL, React, and all financial modules are **not yet integrated** (see Implementation status).

## Project structure

```text
ledgerline/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── middleware/
│   │   ├── error-handler.ts
│   │   └── not-found.ts
│   ├── routes/
│   │   └── health.routes.ts
│   ├── lib/
│   │   ├── logger.ts
│   │   └── safe-route.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── env-loading.test.ts
│   ├── error-handling.test.ts
│   ├── health.test.ts
│   ├── logging-security.test.ts
│   ├── not-found.test.ts
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
npm test            # run Vitest once
npm run test:watch  # run Vitest in watch mode
```

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

This endpoint does not report database health; database connectivity is not implemented yet.

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

Copy the example file and adjust for local development:

```bash
cp .env.example .env
```

Both startup commands load `.env` via Node.js built-in `--env-file-if-exists=.env` (`npm run dev` and `npm run start`): variables already set in the process/deployment environment take precedence and are not overwritten by `.env`; a missing `.env` does not prevent startup. Do not commit `.env`. No database credentials or `DATABASE_URL` exist in this milestone.

## Implementation status

Milestone 1 implements **backend foundation only**:

- ✅ Express application factory, Helmet, JSON limit (16 KB)
- ✅ Pino structured logging with correlation IDs and redaction
- ✅ Zod environment validation, health endpoint, 404/500 handling
- ✅ Vitest/Supertest suite (no PostgreSQL required)

**Not implemented yet:**

- ❌ Authentication, sessions, password hashing
- ❌ Users, accounts, balances, statements
- ❌ PostgreSQL connection, migrations, roles, ledger tables
- ❌ Deposits, withdrawals, transfers, reversals, idempotency, audit trail
- ❌ Frontend, AI functionality

This repository is **not production-ready**. No financial operations exist in this milestone.

## License

No license has been added in this milestone.
