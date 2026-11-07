import type { NextFunction, Request, Response } from 'express';
import { hashSessionToken, parseCookies, safeEqual } from '../lib/auth.js';
import { query, withTransaction } from '../db/pool.js';
import type { UserRole } from '../lib/auth.js';

export interface ActorUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  sessionId: string;
  csrfHash: string;
  sessionHash: string;
  sessionToken: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    actor?: ActorUser;
  }
}

export const SESSION_COOKIE = 'ledgerline_session';
export const CSRF_COOKIE = 'ledgerline_csrf';

export async function currentActor(req: Request): Promise<ActorUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const res = await query(
    `SELECT user_id, session_id, csrf_token_hash, role, is_active FROM resolve_session($1) AS resolved`,
    [token]
  );
  const row = res.rows[0];
  if (!row || !row.is_active) {
    return null;
  }
  const userRes = await query('SELECT email FROM users WHERE id=$1', [String(row.user_id)]);
  if (!userRes.rows[0]) {
    return null;
  }
  // session expiry/revocation already enforced in resolve_session
  return {
    id: String(row.user_id),
    email: String(userRes.rows[0].email),
    role: row.role as UserRole,
    isActive: Boolean(row.is_active),
    sessionId: String(row.session_id),
    csrfHash: String(row.csrf_token_hash),
    sessionHash: hashSessionToken(token),
    sessionToken: token
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const actor = await currentActor(req);
  if (!actor) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }
  req.actor = actor;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.actor) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    if (!roles.includes(req.actor.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  };
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  if (!req.actor) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }
  const presented = req.headers['x-csrf-token'];
  if (typeof presented !== 'string' || presented.length === 0) {
    res.status(403).json({ error: { code: 'CSRF', message: 'CSRF token required' } });
    return;
  }
  const presentedHash = hashSessionToken(presented);
  if (!safeEqual(presentedHash, req.actor.csrfHash)) {
    res.status(403).json({ error: { code: 'CSRF', message: 'Invalid CSRF token' } });
    return;
  }
  next();
}

export async function revokeSession(sessionId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sessionId]);
  });
}
