import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword, generateSessionToken, hashSessionToken, generateCsrfToken } from '../lib/auth.js';
import { withTransaction, query } from '../db/pool.js';
import { env, cookieSecure } from '../config/env.js';
import { SESSION_COOKIE, CSRF_COOKIE, requireAuth, requireCsrf, type ActorUser } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128)
});

function setCookies(res: Response, token: string, csrf: string): void {
  const maxAge = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const opts: Record<string, unknown> = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge
  };
  res.cookie(SESSION_COOKIE, token, opts);
  // CSRF cookie is readable client-side counterpart (double submit) - token hash stored server-side only.
  res.cookie(CSRF_COOKIE, csrf, { secure: cookieSecure, sameSite: 'lax', path: '/', maxAge });
}

function clearCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid registration input' } });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const userId = await withTransaction(async (client) => {
      const r = await client.query('SELECT register_user($1,$2) AS id', [email, passwordHash]);
      const id = String(r.rows[0].id);
      await audit(client, id, 'user.register', 'user', id, { email });
      return id;
    });
    res.status(201).json({ id: userId });
  } catch (err) {
    if (String((err as { code?: string }).code) === '23505') {
      res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
      return;
    }
    throw err;
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid login input' } });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  // rate limit: >=5 failures in 15 min -> 429
  const recent = await query(
    `SELECT count(*)::text AS c FROM auth_rate_limits WHERE (email=$1 OR ip=$2) AND succeeded=FALSE AND created_at > now() - interval '15 minutes'`,
    [email, ip]
  );
  const failures = Number(recent.rows[0]?.c ?? 0);
  if (failures >= 5) {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } });
    return;
  }

  const userRes = await query('SELECT id, email, password_hash, role, is_active FROM users WHERE email=$1', [email]);
  const user = userRes.rows[0];
  const fail = async (code: string, status: number): Promise<void> => {
    await query('INSERT INTO auth_rate_limits(email,ip,succeeded) VALUES($1,$2,FALSE)', [email, ip]);
    res.status(status).json({ error: { code, message: 'Invalid credentials' } });
  };
  if (!user) {
    await fail('INVALID_CREDENTIALS', 401);
    return;
  }
  if (!user.is_active) {
    await fail('ACCOUNT_INACTIVE', 403);
    return;
  }
  const ok = await verifyPassword(String(user.password_hash), parsed.data.password);
  if (!ok) {
    await fail('INVALID_CREDENTIALS', 401);
    return;
  }
  await query('INSERT INTO auth_rate_limits(email,ip,succeeded) VALUES($1,$2,TRUE)', [email, ip]);

  const token = generateSessionToken();
  const csrf = generateCsrfToken();
  const tokenHash = hashSessionToken(token);
  await withTransaction(async (client) => {
    const sessionId = (
      await client.query('SELECT issue_session($1,$2,$3,$4) AS id', [
        String(user.id),
        tokenHash,
        hashSessionToken(csrf),
        env.SESSION_TTL_HOURS
      ])
    ).rows[0].id;
    await audit(client, String(user.id), 'auth.login', 'session', String(sessionId));
  });
  setCookies(res, token, csrf);
  res.status(200).json({ id: String(user.id), role: user.role });
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor as ActorUser;
  res.json({
    id: actor.id,
    email: actor.email,
    role: actor.role,
    isActive: actor.isActive,
    sessionId: actor.sessionId
  });
});

router.post('/logout', requireAuth, requireCsrf, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor as ActorUser;
  const token = actor.sessionToken;
  await withTransaction(async (client) => {
    await client.query('SELECT revoke_session_by_token($1)', [token]);
    await audit(client, actor.id, 'auth.logout', 'session', actor.sessionId);
  });
  clearCookies(res);
  res.status(200).json({ ok: true });
});

export default router;
