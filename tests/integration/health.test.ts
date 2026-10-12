import { buildApp } from '@bidazoo/api/app';
import type { HealthResponse, ReadyResponse } from '@bidazoo/contracts';
import { afterEach, describe, expect, it } from 'vitest';

describe('API operational endpoints', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  const make = (database: () => Promise<boolean>) => {
    const app = buildApp({ checks: { database } });
    apps.push(app);
    return app;
  };

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('GET /health returns ok without consulting any dependency', async () => {
    const app = make(async () => {
      throw new Error('health must not touch the database');
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json<HealthResponse>()).toEqual({ status: 'ok', service: 'bidazoo-api' });
  });

  it('GET /ready returns 200 when the database check passes', async () => {
    const app = make(async () => true);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json<ReadyResponse>()).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /ready returns 503 when the database check reports unavailable', async () => {
    const app = make(async () => false);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyResponse>()).toEqual({
      status: 'not_ready',
      checks: { database: 'unavailable' },
    });
  });

  it('GET /ready returns 503 and leaks no error details when the check throws', async () => {
    const app = make(async () => {
      throw new Error('connect ECONNREFUSED db.internal.example:5432 user=secret_user');
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('ECONNREFUSED');
    expect(res.body).not.toContain('secret_user');
    expect(res.json<ReadyResponse>().status).toBe('not_ready');
  });

  it('returns 404 for unknown routes', async () => {
    const app = make(async () => true);
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
  });
});
