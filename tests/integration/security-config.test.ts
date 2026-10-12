import { loadConfig } from '@bidazoo/api/config';
import { DEFAULT_RATE_LIMITS } from '@bidazoo/api/rate-limit';
import { describe, expect, it } from 'vitest';

const base = { DATABASE_URL: 'postgres://u:secret-pw@localhost:5432/x' };

describe('Checkpoint D configuration (no database needed)', () => {
  it('defaults: limits ON, no proxy trusted, no HSTS', () => {
    const config = loadConfig(base);
    expect(config.rateLimits).toEqual(DEFAULT_RATE_LIMITS);
    expect(config.rateLimits.enabled).toBe(true);
    expect(config.trustProxy).toBe(false);
    expect(config.hstsMaxAgeSeconds).toBe(0);
  });

  it('every default leaves real headroom over one 10-question game (about 22 requests, 10 answers)', () => {
    const d = DEFAULT_RATE_LIMITS;
    expect(d.answer.max / d.answer.windowSeconds).toBeGreaterThanOrEqual(1); // >= 60 answers a minute
    expect(d.answer.max).toBeGreaterThanOrEqual(10 * 10); // ten full games' worth in one window
    expect(d.sessionStart.max).toBeGreaterThanOrEqual(20);
    expect(d.guestCreateBurst.max).toBeGreaterThanOrEqual(30); // a classroom behind one NAT
    expect(d.guestCreateHourly.max).toBeGreaterThanOrEqual(d.guestCreateBurst.max);
    expect(d.globalGuestCreate.max).toBeGreaterThan(d.guestCreateHourly.max); // ceiling is not the primary limiter
    expect(d.apiPerIp.max).toBeGreaterThanOrEqual(1000);
  });

  it('reads every limit from the environment', () => {
    const config = loadConfig({
      ...base,
      RATE_LIMIT_ENABLED: 'false',
      RATE_GUEST_CREATE_BURST_MAX: '5',
      RATE_GUEST_CREATE_BURST_WINDOW_SECONDS: '10',
      RATE_GUEST_CREATE_HOURLY_MAX: '50',
      RATE_GLOBAL_GUEST_CREATE_MAX: '0',
      RATE_SESSION_START_MAX: '7',
      RATE_ANSWER_MAX: '200',
      RATE_ANSWER_WINDOW_SECONDS: '30',
      RATE_API_PER_IP_MAX: '999',
      RATE_CACHE_SIZE: '500',
      HSTS_MAX_AGE_SECONDS: '31536000',
    });
    expect(config.rateLimits.enabled).toBe(false);
    expect(config.rateLimits.guestCreateBurst).toEqual({ max: 5, windowSeconds: 10 });
    expect(config.rateLimits.guestCreateHourly).toEqual({ max: 50, windowSeconds: 3600 });
    expect(config.rateLimits.globalGuestCreate.max).toBe(0); // 0 disables the breaker
    expect(config.rateLimits.sessionStart.max).toBe(7);
    expect(config.rateLimits.answer).toEqual({ max: 200, windowSeconds: 30 });
    expect(config.rateLimits.apiPerIp.max).toBe(999);
    expect(config.rateLimits.cacheSize).toBe(500);
    expect(config.hstsMaxAgeSeconds).toBe(31_536_000);
  });

  it('rejects bad values, naming the variable but never the value or the database password', () => {
    for (const [name, value] of [
      ['RATE_ANSWER_MAX', '0'],
      ['RATE_ANSWER_MAX', 'lots'],
      ['RATE_ANSWER_WINDOW_SECONDS', '-1'],
      ['RATE_SESSION_START_MAX', '1.5'],
      ['RATE_LIMIT_ENABLED', 'yes'],
      ['HSTS_MAX_AGE_SECONDS', '999999999'],
    ] as const) {
      let message = '';
      try {
        loadConfig({ ...base, [name]: value });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message, `${name}=${value}`).toContain(name);
      if (/[a-z]/i.test(value) || value.length > 4) expect(message).not.toContain(value);
      expect(message).not.toContain('secret-pw');
    }
  });

  describe('TRUST_PROXY', () => {
    it('is off by default and for "false"', () => {
      expect(loadConfig({ ...base, TRUST_PROXY: '' }).trustProxy).toBe(false);
      expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    });

    it('accepts proxy addresses, CIDR ranges, and the named ranges', () => {
      expect(loadConfig({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8 ,::1,fd00::/8' }).trustProxy).toEqual([
        'loopback',
        '10.0.0.0/8',
        '::1',
        'fd00::/8',
      ]);
    });

    it('REFUSES blanket trust, hop counts, and malformed values', () => {
      for (const bad of ['true', 'TRUE', '1', '2', '0', '11', '-1', 'proxy.example.com', '10.0.0.0/33', '1.2.3.4/8/9', '::1/129', 'loopback,,nope']) {
        expect(() => loadConfig({ ...base, TRUST_PROXY: bad }), bad).toThrow(/TRUST_PROXY/);
      }
    });
  });
});
