import { buildApp } from '@bidazoo/api/app';
import { afterEach, describe, expect, it } from 'vitest';
import { expectSecurityHeaders } from './support/security';



describe('API security headers (health-only app, no database)', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  const make = (hstsMaxAgeSeconds?: number) => {
    const app = buildApp({ checks: { database: async () => true }, hstsMaxAgeSeconds });
    apps.push(app);
    return app;
  };
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('are present on success responses', async () => {
    const res = await make().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expectSecurityHeaders(res.headers, '/health 200');
  });

  it('are present on 404 and on malformed-request error responses', async () => {
    const app = make();
    const notFound = await app.inject({ method: 'GET', url: '/nope' });
    expect(notFound.statusCode).toBe(404);
    expectSecurityHeaders(notFound.headers, '404');
    const badMethod = await app.inject({ method: 'POST', url: '/health', payload: '{"x"' , headers: { 'content-type': 'application/json' } });
    expect(badMethod.statusCode).toBeGreaterThanOrEqual(400);
    expectSecurityHeaders(badMethod.headers, `${badMethod.statusCode} on /health`);
  });

  it('send no HSTS unless configured, then send exactly the configured max-age', async () => {
    const off = await make().inject({ method: 'GET', url: '/health' });
    expect(off.headers['strict-transport-security']).toBeUndefined();
    const on = await make(31_536_000).inject({ method: 'GET', url: '/health' });
    expect(on.headers['strict-transport-security']).toBe('max-age=31536000');
  });
});
