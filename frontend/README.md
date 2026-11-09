# LedgerLine frontend

This is the LedgerLine browser client: a React 19 + TypeScript single-page application built with Vite. It calls the separate Express API; it does not connect to PostgreSQL directly and does not enforce financial authorization itself.

## Architecture and structure

- `src/api/` contains the typed API client and endpoint wrappers.
- `src/context/AuthContext.tsx` restores and exposes the current session via `GET /auth/me`.
- `src/lib/` contains CSRF-cookie and money-format helpers.
- `src/components/auth/` provides route guards; `src/components/layout/` and `src/components/common/` provide shared UI.
- `src/pages/auth/`, `src/pages/holder/`, `src/pages/admin/`, and `src/pages/auditor/` contain role-oriented screens.
- `src/router.tsx` defines page routing; `src/App.tsx` installs React Query and authentication providers.
- `vite.config.ts` defines the `@` alias and the development server (port 5173).

Page guards improve navigation only. The backend must authorize every API request.

## Install and run

From the repository root:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open the Vite URL shown in the terminal (default `http://localhost:5173`). Start the backend separately with `npm run dev` from the repository root; the API defaults to `http://localhost:3000`.

## API base URL and CORS

The client uses `VITE_API_BASE_URL`, falling back to `http://localhost:3000` when unset. The checked-in `frontend/.env.example` contains a local example. For a local override, copy it to `frontend/.env.local` and set `VITE_API_BASE_URL` to the backend origin. Vite variables are public build-time configuration; do not put secrets in `VITE_*` variables.

The API must allow the exact browser origin in backend `FRONTEND_ORIGINS` (comma-separated), for example `http://localhost:5173`. Credentialed CORS requires an explicit origin; wildcard origins are not suitable. Use the same hostname for the frontend and API configuration (`localhost` differs from `127.0.0.1`). Deployment/proxy CORS behavior has not been verified.

## Authentication, sessions, and CSRF

- Login calls `POST /auth/login`; the API sets an HttpOnly `ledgerline_session` cookie and a separate JavaScript-readable `ledgerline_csrf` cookie. Registration creates a holder account but does not log the user in.
- The API client always uses `credentials: 'include'` so browser requests carry the session cookie. The raw session token is not read by frontend code or stored in local storage.
- `src/lib/csrf.ts` reads the CSRF cookie and `src/api/client.ts` sends it as `x-csrf-token` for mutating methods. Do not remove this behavior; authenticated mutations without a valid token are rejected by the backend.
- Session identity is restored with `GET /auth/me`. Logout calls the backend to revoke the session and clear cookies.
- Cookie `Secure`, `SameSite`, origin, and server authorization behavior are controlled by the backend. A browser page guard is not a substitute for backend authorization.

## Build and verification

From the repository root:

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
```

`build` runs `tsc -b` followed by `vite build`; `lint` runs Oxlint. The frontend package currently defines no test script. Backend tests, typecheck, lint, and build are run from the repository root using the commands in the main README.
