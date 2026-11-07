import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { logger } from '../src/lib/logger.js';
import { safeRouteTemplate } from '../src/lib/safe-route.js';
import express from 'express';
import { pinoHttp } from 'pino-http';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createMemoryLogger(): { logger: unknown; output: string[] } {
  const output: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output.push(String(chunk));
      callback();
    }
  });
  const logger: unknown = pino({ level: 'info' }, stream);
  return { logger, output };
}

describe('Request IDs', () => {
  it('accepts a valid UUID request ID', async () => {
    const app = createApp();
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const res = await request(app).get('/health').set('X-Request-ID', id);
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('replaces an invalid request ID with a generated UUID', async () => {
    const app = createApp();
    const res = await request(app).get('/health').set('X-Request-ID', 'not-a-uuid');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
    expect(res.headers['x-request-id']).not.toBe('not-a-uuid');
  });
});

describe('Log redaction', () => {
  it('does not emit cookie or authorization values in request logs', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    await request(app)
      .get('/health')
      .set('Cookie', 'session=SECRET_COOKIE_VALUE')
      .set('Authorization', 'Bearer SECRET_AUTH_VALUE');
    const joined = output.join('');
    expect(joined).not.toContain('SECRET_COOKIE_VALUE');
    expect(joined).not.toContain('SECRET_AUTH_VALUE');
    expect(joined).toContain('/health');
  });

  it('does not emit password or token body values in logs', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    await request(app)
      .post('/unknown')
      .set('Content-Type', 'application/json')
      .send({ password: 'SECRET_PASSWORD', token: 'SECRET_TOKEN_BODY' });
    const joined = output.join('');
    expect(joined).not.toContain('SECRET_PASSWORD');
    expect(joined).not.toContain('SECRET_TOKEN_BODY');
  });

  it('does not emit query-string values in request logs', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    await request(app).get('/health?token=SECRET_QUERY_VALUE');
    const joined = output.join('');
    expect(joined).not.toContain('SECRET_QUERY_VALUE');
    expect(joined).toContain('/health');
  });

  it('does not emit secrets placed in arbitrary URL paths', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    const res = await request(app).get('/reset/SECRET_PATH_TOKEN_123');
    expect(res.status).toBe(404);
    const joined = output.join('');
    expect(joined).not.toContain('SECRET_PATH_TOKEN_123');
    expect(joined).not.toContain('/reset/SECRET_PATH_TOKEN_123');
    expect(joined).not.toContain('originalUrl');
  });

  it('does not emit secrets placed in a known route path segment', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    await request(app).get('/health/SECRET_SUFFIX_TOKEN');
    const joined = output.join('');
    expect(joined).not.toContain('SECRET_SUFFIX_TOKEN');
  });
});

describe('Safe route logging', () => {
  it('logs the safe route template for matched routes without concrete values', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    const id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    await request(app).get('/health?token=SECRET_QUERY').set('X-Request-ID', id);
    const joined = output.join('');
    expect(joined).toContain('/health');
    expect(joined).toContain('GET');
    expect(joined).toContain(id);
    expect(joined).not.toContain('SECRET_QUERY');
  });

  it('omits raw paths for unmatched routes', async () => {
    const { logger, output } = createMemoryLogger();
    const app = createApp({ logger });
    const res = await request(app).get('/does-not-exist-SECRET123');
    expect(res.status).toBe(404);
    const joined = output.join('');
    expect(joined).not.toContain('SECRET123');
    expect(joined).not.toContain('/does-not-exist-SECRET123');
  });

  it('logs route template without concrete param values in error logs', () => {
    const err = new Error('SECRET_MESSAGE_TOKEN_123');
    const req = {
      method: 'GET',
      route: { path: '/accounts/:accountId' },
      baseUrl: '',
      path: '/accounts/secret-account-token-123',
      originalUrl: '/accounts/secret-account-token-123?token=SECRET_QUERY',
      id: '11111111-2222-3333-4444-555555555555'
    } as unknown as Parameters<typeof errorHandler>[1];
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const res = {
      headersSent: false,
      status: statusSpy,
      json: jsonSpy
    } as unknown as Parameters<typeof errorHandler>[2];
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger as unknown as typeof logger);
    try {
      errorHandler(err, req, res, vi.fn());
      expect(logSpy).toHaveBeenCalled();
      const logArg = JSON.stringify(logSpy.mock.calls[0]?.[0]);
      expect(logArg).toContain('/accounts/:accountId');
      expect(logArg).not.toContain('secret-account-token-123');
      expect(logArg).not.toContain('SECRET_MESSAGE_TOKEN_123');
      expect(logArg).not.toContain('SECRET_QUERY');
      expect(logArg).toContain('INTERNAL_ERROR');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('omits path entirely in error logs when no safe route template exists', () => {
    const err = new Error('boom');
    const req = {
      method: 'GET',
      path: '/unmatched-secret-XYZ',
      originalUrl: '/unmatched-secret-XYZ',
      id: '11111111-2222-3333-4444-555555555555'
    } as unknown as Parameters<typeof errorHandler>[1];
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const res = {
      headersSent: false,
      status: statusSpy,
      json: jsonSpy
    } as unknown as Parameters<typeof errorHandler>[2];
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger as unknown as typeof logger);
    try {
      errorHandler(err, req, res, vi.fn());
      const logArg = JSON.stringify(logSpy.mock.calls[0]?.[0]);
      expect(logArg).not.toContain('unmatched-secret-XYZ');
      expect(logArg).not.toContain('/unmatched-secret-XYZ');
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('safeRouteTemplate baseUrl privacy', () => {
  it('never exposes a sensitive concrete baseUrl', () => {
    const req = {
      route: { path: '/health' },
      baseUrl: '/tenant/SECRET_TENANT_TOKEN',
      path: '/tenant/SECRET_TENANT_TOKEN/health',
      url: '/tenant/SECRET_TENANT_TOKEN/health',
      originalUrl: '/tenant/SECRET_TENANT_TOKEN/health'
    };
    expect(safeRouteTemplate(req)).toBe('/health');
    expect(safeRouteTemplate(req)).not.toContain('SECRET_TENANT_TOKEN');
  });

  it('returns the registered static route template', () => {
    const req = { route: { path: '/health' }, baseUrl: '' };
    expect(safeRouteTemplate(req)).toBe('/health');
  });

  it('returns the registered parameterized route template', () => {
    const req = {
      route: { path: '/accounts/:accountId' },
      baseUrl: '/tenant/SECRET_TENANT_TOKEN',
      path: '/tenant/SECRET_TENANT_TOKEN/accounts/SECRET_ACCOUNT_TOKEN'
    };
    expect(safeRouteTemplate(req)).toBe('/accounts/:accountId');
    expect(safeRouteTemplate(req)).not.toContain('SECRET_TENANT_TOKEN');
    expect(safeRouteTemplate(req)).not.toContain('SECRET_ACCOUNT_TOKEN');
  });

  it('produces no route value for missing or unsupported route paths', () => {
    expect(safeRouteTemplate(undefined)).toBeUndefined();
    expect(safeRouteTemplate(null)).toBeUndefined();
    expect(safeRouteTemplate({})).toBeUndefined();
    expect(safeRouteTemplate({ route: undefined })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: undefined } })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: null } })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: '' } })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: [] } })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: '/health' } })).toBe('/health');
    expect(safeRouteTemplate({ route: { path: 42 } })).toBeUndefined();
    expect(safeRouteTemplate({ route: { path: 'health' } })).toBeUndefined();
  });

  it('does not log a sensitive baseUrl in error logs', () => {
    const err = new Error('boom');
    const req = {
      method: 'GET',
      route: { path: '/health' },
      baseUrl: '/tenant/SECRET_TENANT_TOKEN',
      path: '/tenant/SECRET_TENANT_TOKEN/health',
      originalUrl: '/tenant/SECRET_TENANT_TOKEN/health',
      id: '11111111-2222-3333-4444-555555555555'
    } as unknown as Parameters<typeof errorHandler>[1];
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const res = {
      headersSent: false,
      status: statusSpy,
      json: jsonSpy
    } as unknown as Parameters<typeof errorHandler>[2];
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger as unknown as typeof logger);
    try {
      errorHandler(err, req, res, vi.fn());
      expect(logSpy).toHaveBeenCalled();
      const logArg = JSON.stringify(logSpy.mock.calls[0]?.[0]);
      expect(logArg).toContain('/health');
      expect(logArg).not.toContain('SECRET_TENANT_TOKEN');
      expect(logArg).not.toContain('/tenant/');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('never logs a parameterized mount-path value via a nested Express router', async () => {
    const { logger: memLogger, output } = createMemoryLogger();
    const nestedApp = express();
    nestedApp.use(
      pinoHttp({
        logger: memLogger as unknown as typeof logger,
        customProps(req: express.Request) {
          const route = safeRouteTemplate(req);
          return route ? { route } : {};
        },
        serializers: {
          req(rawReq: express.Request) {
            return { id: (rawReq as unknown as { id?: string }).id, method: rawReq.method };
          },
          res(rawRes: express.Response) {
            return { statusCode: rawRes.statusCode };
          }
        }
      })
    );
    const tenant = express.Router();
    tenant.get('/health', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    nestedApp.use('/tenant/:tenantId', tenant);

    const res = await request(nestedApp).get('/tenant/SECRET_TENANT_TOKEN/health');
    expect(res.status).toBe(200);
    const joined = output.join('');
    expect(joined).toContain('/health');
    expect(joined).not.toContain('SECRET_TENANT_TOKEN');
    expect(joined).not.toContain('/tenant/');
  });
});
