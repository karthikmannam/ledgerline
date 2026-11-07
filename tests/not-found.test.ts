import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Unknown routes', () => {
  it('returns 404 with expected JSON error structure', async () => {
    const app = createApp();
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found'
      }
    });
  });

  it('returns 404 for unknown POST routes', async () => {
    const app = createApp();
    const res = await request(app).post('/unknown').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('can be imported without starting a listener', async () => {
    const { createApp: factory, app } = await import('../src/app.js');
    expect(factory).toBeTypeOf('function');
    expect(app).toBeDefined();
    const instance = factory();
    expect(instance).toBeDefined();
  });

  it('does not require PostgreSQL or external services', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
