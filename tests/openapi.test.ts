import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('OpenAPI contract', () => {
  it('exposes the frontend API operations and reusable schemas', async () => {
    const response = await request(createApp()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(response.body.paths).toEqual(expect.objectContaining({
      '/auth/register': expect.objectContaining({ post: expect.any(Object) }),
      '/auth/login': expect.objectContaining({ post: expect.any(Object) }),
      '/accounts': expect.objectContaining({ get: expect.any(Object), post: expect.any(Object) }),
      '/accounts/{id}/statement': expect.objectContaining({ get: expect.any(Object) }),
      '/deposit-requests': expect.objectContaining({ get: expect.any(Object), post: expect.any(Object) }),
      '/transfers': expect.objectContaining({ post: expect.any(Object) }),
      '/transactions/{id}/reverse': expect.objectContaining({ post: expect.any(Object) }),
      '/audit/reconciliation': expect.objectContaining({ get: expect.any(Object) })
    }));
    expect(response.body.components.securitySchemes.sessionCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'ledgerline_session'
    });
  });

  it('documents cookie authentication and CSRF on mutating authenticated routes', async () => {
    const response = await request(createApp()).get('/openapi.json');
    const paths = response.body.paths;

    expect(paths['/accounts'].post.security).toEqual([{ sessionCookie: [] }]);
    expect(paths['/accounts'].post.parameters).toContainEqual({ $ref: '#/components/parameters/CsrfToken' });
    expect(paths['/auth/login'].post.security).toBeUndefined();
    expect(paths['/auth/logout'].post.parameters).toContainEqual({ $ref: '#/components/parameters/CsrfToken' });
  });
});
