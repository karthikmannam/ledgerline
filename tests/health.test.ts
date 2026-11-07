import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns 200 with expected status and service', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'ledgerline-api'
    });
  });

  it('does not expose X-Powered-By header', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns X-Request-ID header', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
