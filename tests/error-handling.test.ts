import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { logger } from '../src/lib/logger.js';

describe('HTTP error handling', () => {
  it('returns 400 for malformed JSON', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad request'
      }
    });
  });

  it('returns 413 for oversized JSON payload', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(20_000));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large'
      }
    });
  });

  it('returns generic 500 without internal details for unexpected errors', () => {
    const err = Object.assign(new Error('db failed at C:\\secret\\config.rs with token SECRET_DB'), {
      type: 'db_error'
    });
    const req = {
      method: 'GET',
      path: '/health',
      originalUrl: '/health',
      id: '11111111-2222-3333-4444-555555555555'
    } as unknown as Parameters<typeof errorHandler>[1];
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const res = {
      headersSent: false,
      status: statusSpy,
      json: jsonSpy
    } as unknown as Parameters<typeof errorHandler>[2];
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
    const body = JSON.stringify(jsonSpy.mock.calls[0]?.[0]);
    expect(body).not.toContain('SECRET_DB');
    expect(body).not.toContain('C:\\secret');
    expect(body).not.toContain('db failed');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 for an ordinary internal SyntaxError without exposing details', () => {
    const err = new SyntaxError('SECRET_INTERNAL_SYNTAX_MSG with C:\\vault\\trace');
    const req = {
      method: 'POST',
      route: { path: '/health' },
      baseUrl: '',
      originalUrl: '/health',
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
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
      const body = JSON.stringify(jsonSpy.mock.calls[0]?.[0]);
      expect(body).not.toContain('SECRET_INTERNAL_SYNTAX_MSG');
      expect(body).not.toContain('vault');
      expect(logSpy).toHaveBeenCalled();
      const logArg = JSON.stringify(logSpy.mock.calls[0]?.[0]);
      expect(logArg).not.toContain('SECRET_INTERNAL_SYNTAX_MSG');
      expect(logArg).not.toContain('vault');
      expect(logArg).not.toContain('SyntaxError');
      expect(logArg).toContain('INTERNAL_ERROR');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('delegates to next when headers already sent', () => {
    const err = new Error('after headers');
    const req = {
      method: 'GET',
      path: '/health',
      originalUrl: '/health',
      id: '11111111-2222-3333-4444-555555555555'
    } as unknown as Parameters<typeof errorHandler>[1];
    const statusSpy = vi.fn();
    const jsonSpy = vi.fn();
    const res = {
      headersSent: true,
      status: statusSpy,
      json: jsonSpy
    } as unknown as Parameters<typeof errorHandler>[2];
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(statusSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('logs allowlisted error metadata without raw message or stack', async () => {
    const err = Object.assign(new Error('SECRET_MESSAGE_TOKEN_123 with C:\\vault\\path'), {
      type: 'entity.too.large'
    });
    const req = {
      method: 'POST',
      route: { path: '/health' },
      baseUrl: '',
      originalUrl: '/health?token=SECRET_QUERY',
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
      expect(logArg).not.toContain('SECRET_MESSAGE_TOKEN_123');
      expect(logArg).not.toContain('vault');
      expect(logArg).not.toContain('C:\\');
      expect(logArg).not.toContain('SECRET_QUERY');
      expect(logArg).toContain('PAYLOAD_TOO_LARGE');
      expect(logArg).toContain('/health');
    } finally {
      logSpy.mockRestore();
    }
  });
});
