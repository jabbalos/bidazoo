import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '@bidazoo/api/app';
import type { AppContext } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
import { GearSchema } from '@bidazoo/contracts';
import type { FastifyInstance } from 'fastify';
import { modules } from '../../apps/api/src/modules';
import { GEAR_CATALOG, GEAR_SLOTS, gearItem, progressModule } from '../../apps/api/src/modules/progress';
import { FakeClock, HAS_DB, PATHS, TEST_DATABASE_URL, TestBrowser, playSession } from './support/harness';

const GEAR = '/api/v1/me/gear';

describe('gear catalog (server-side, PENDING names and prices)', () => {
  it('has 3 slots x 4 items with unique ids and positive whole-coin prices', () => {
    expect(GEAR_SLOTS).toHaveLength(3);
    expect(GEAR_CATALOG).toHaveLength(12);
    for (const slot of GEAR_SLOTS) expect(GEAR_CATALOG.filter((item) => item.slot === slot)).toHaveLength(4);
    expect(new Set(GEAR_CATALOG.map((item) => item.id)).size).toBe(12);
    for (const item of GEAR_CATALOG) {
      expect(Number.isInteger(item.price) && item.price > 0, item.id).toBe(true);
      expect(item.id).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
      expect(gearItem(item.id)).toBe(item);
    }
  });

  it('has no bag slot (Character Bible LOCKED: Dino exactly one backpack, Koala no backpack)', () => {
    for (const item of GEAR_CATALOG) {
      expect(item.slot).not.toMatch(/pack|bag/);
      expect(item.id).not.toMatch(/pack|bag/);
    }
  });

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(GEAR_CATALOG)).toBe(true);
    expect(Object.isFrozen(GEAR_CATALOG[0])).toBe(true);
  });
});

describe.skipIf(!HAS_DB)('GET/PUT /api/v1/me/gear (real PostgreSQL)', () => {
  let database: Database;
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeAll(async () => {
    database = createDatabase(TEST_DATABASE_URL as string);
    ctx = {
      db: database.db,
      clock: new FakeClock(),
      cookie: { name: 'bidazoo_guest', secure: false, maxAgeSeconds: 90 * 86_400 },
      allowedOrigins: [],
    };
    app = buildApp({ checks: { database: () => database.ping() }, ctx });
    // Until the progress module is in the API's module list (a cross-lane change), register it here.
    if (!modules.some((m) => m.name === 'progress')) void app.register(progressModule, { ctx });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await database.pool.query(text, params)).rows as T[];

  async function newGuest(): Promise<{ browser: TestBrowser; playerId: string }> {
    const browser = new TestBrowser(app, ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    if (res.status !== 200) throw new Error(`guest creation failed: ${res.status} ${res.raw}`);
    return { browser, playerId: res.body.player.id as string };
  }

  /** TestBrowser has no PUT; this sends one with the same cookie. */
  async function put(browser: TestBrowser, body: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({
      method: 'PUT',
      url: GEAR,
      headers: {
        'content-type': 'application/json',
        ...(browser.cookie ? { cookie: `${ctx.cookie.name}=${browser.cookie}` } : {}),
        ...headers,
      },
      payload: JSON.stringify(body),
    });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  }

  /** Test setup only: an earned-coins ledger row, as a completed session would write. */
  async function grantCoins(playerId: string, amount: number): Promise<void> {
    await query(
      `insert into wallet_transactions (player_id, currency, amount, reason, source_type, source_id, idempotency_key)
       values ($1, 'coins', $2, 'session_completion', 'play_session', $3, $4)`,
      [playerId, amount, randomUUID(), `test:${randomUUID()}`],
    );
  }

  async function coinsOf(browser: TestBrowser): Promise<number> {
    return (await browser.request('GET', PATHS.me)).body.totals.coins as number;
  }

  async function gearRows(playerId: string) {
    return query<{ amount: number; reason: string; source_type: string; source_id: string; play_session_id: string | null }>(
      `select amount, reason, source_type, source_id, play_session_id from wallet_transactions
       where player_id = $1 and source_type = 'gear_purchase' order by created_at`,
      [playerId],
    );
  }

  it('requires a player: no cookie is a 401 for GET and PUT', async () => {
    const anon = new TestBrowser(app, ctx.cookie.name);
    expect((await anon.request('GET', GEAR)).status).toBe(401);
    expect((await put(anon, { equipped: [] })).status).toBe(401);
  });

  it('a new guest owns nothing, has 0 coins and sees the whole catalog, in the strict contract shape; GET writes nothing', async () => {
    const { browser, playerId } = await newGuest();
    const res = await browser.request('GET', GEAR);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(Object.keys(GearSchema.properties).sort());
    expect(res.body.owned).toEqual([]);
    expect(res.body.equipped).toEqual([]);
    expect(res.body.coins).toBe(0);
    expect(res.body.catalog).toEqual(GEAR_CATALOG.map(({ id, slot, name, price }) => ({ id, slot, name, price })));
    const [row] = await query<{ n: string }>('select count(*)::text as n from player_progress where player_id = $1', [playerId]);
    expect(row?.n).toBe('0');
  });

  it('a purchase debits the catalog price from coins earned in real play, server-side, and shows in /me totals', async () => {
    const { browser, playerId } = await newGuest();
    await playSession(browser);
    const earned = await coinsOf(browser);
    const scarf = gearItem('scarf-red');
    expect(scarf).toBeDefined();
    expect(earned).toBeGreaterThanOrEqual(scarf!.price);

    const res = await put(browser, { buy: 'scarf-red', equipped: ['scarf-red'] });
    expect(res.status).toBe(200);
    expect(res.body.owned).toEqual(['scarf-red']);
    expect(res.body.equipped).toEqual(['scarf-red']);
    expect(res.body.coins).toBe(earned - scarf!.price);
    expect(await coinsOf(browser)).toBe(earned - scarf!.price);
    expect(await gearRows(playerId)).toEqual([
      { amount: -scarf!.price, reason: 'gear:scarf-red', source_type: 'gear_purchase', source_id: playerId, play_session_id: null },
    ]);

    // Persisted: a later GET says the same.
    const again = await browser.request('GET', GEAR);
    expect(again.body).toMatchObject({ owned: ['scarf-red'], equipped: ['scarf-red'], coins: earned - scarf!.price });
  });

  it('buying an item already owned charges nothing, including a retried or concurrent purchase', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 100);
    const results = await Promise.all([
      put(browser, { buy: 'hat-ranger', equipped: [] }),
      put(browser, { buy: 'hat-ranger', equipped: [] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await put(browser, { buy: 'hat-ranger', equipped: ['hat-ranger'] })).status).toBe(200);
    expect(await gearRows(playerId)).toHaveLength(1);
    expect(await coinsOf(browser)).toBe(100 - gearItem('hat-ranger')!.price);
  });

  it('not enough coins is a 409 and changes nothing', async () => {
    const { browser, playerId } = await newGuest();
    const price = gearItem('stick-compass')!.price;
    await grantCoins(playerId, price - 1);
    const res = await put(browser, { buy: 'stick-compass', equipped: [] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'invalid_request', message: 'Not enough coins.' } });
    expect(await gearRows(playerId)).toEqual([]);
    expect(await coinsOf(browser)).toBe(price - 1);
    expect((await browser.request('GET', GEAR)).body.owned).toEqual([]);
  });

  it('never trusts a client price, coins or ownership: such fields are rejected before anything is written', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 50);
    for (const body of [
      { buy: 'hat-explorer', equipped: [], price: 1 },
      { buy: 'hat-explorer', equipped: [], coins: 9999 },
      { equipped: [], owned: ['hat-explorer'] },
      { buy: { id: 'hat-explorer', price: 0 }, equipped: [] },
      { buy: 'hat-sun' },
    ]) {
      const res = await put(browser, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('invalid_request');
    }
    expect(await gearRows(playerId)).toEqual([]);
    expect((await browser.request('GET', GEAR)).body).toMatchObject({ owned: [], equipped: [], coins: 50 });
  });

  it('concurrent purchases cannot spend the same coins twice', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 60);
    // 60 coins buys either the beanie (60) or the striped scarf (30) plus the sun hat (20), never all three.
    const results = await Promise.all([
      put(browser, { buy: 'hat-beanie', equipped: [] }),
      put(browser, { buy: 'scarf-striped', equipped: [] }),
      put(browser, { buy: 'hat-sun', equipped: [] }),
    ]);
    const bought = ['hat-beanie', 'scarf-striped', 'hat-sun'].filter((_, i) => results[i]!.status === 200);
    for (const r of results) expect([200, 409]).toContain(r.status);
    const spent = bought.reduce((sum, id) => sum + gearItem(id)!.price, 0);
    expect(spent).toBeLessThanOrEqual(60);
    expect(await coinsOf(browser)).toBe(60 - spent);
    expect(await coinsOf(browser)).toBeGreaterThanOrEqual(0);
    expect((await gearRows(playerId)).map((r) => r.reason).sort()).toEqual(bought.map((id) => `gear:${id}`).sort());
  });

  it('equipping is validated server-side: owned items only (403), known items and one per slot (400)', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 200);
    expect((await put(browser, { buy: 'scarf-red', equipped: [] })).status).toBe(200);
    expect((await put(browser, { buy: 'scarf-woven', equipped: [] })).status).toBe(200);

    const notOwned = await put(browser, { equipped: ['hat-sun'] });
    expect(notOwned.status).toBe(403);
    expect(notOwned.body.error.code).toBe('forbidden');
    expect((await put(browser, { equipped: ['cape-gold'] })).status).toBe(400);
    expect((await put(browser, { equipped: ['scarf-red', 'scarf-woven'] })).status).toBe(400);
    expect((await put(browser, { equipped: ['scarf-red', 'scarf-red'] })).status).toBe(400);
    expect((await put(browser, { buy: 'cape-gold', equipped: [] })).status).toBe(400);

    const ok = await put(browser, { equipped: ['scarf-woven'] });
    expect(ok.status).toBe(200);
    expect(ok.body.equipped).toEqual(['scarf-woven']);
    const off = await put(browser, { equipped: [] });
    expect(off.body).toMatchObject({ owned: ['scarf-red', 'scarf-woven'], equipped: [] });
  });

  it('an invalid equip list undoes the purchase in the same request', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 100);
    const res = await put(browser, { buy: 'hat-sun', equipped: ['hat-sun', 'stick-oak'] });
    expect(res.status).toBe(403);
    expect(await gearRows(playerId)).toEqual([]);
    expect((await browser.request('GET', GEAR)).body).toMatchObject({ owned: [], coins: 100 });
  });

  it('buy and equip in one request, one item per slot, listed in slot order', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 300);
    await put(browser, { buy: 'stick-bamboo', equipped: ['stick-bamboo'] });
    await put(browser, { buy: 'scarf-silk', equipped: ['stick-bamboo', 'scarf-silk'] });
    const res = await put(browser, { buy: 'hat-explorer', equipped: ['stick-bamboo', 'hat-explorer', 'scarf-silk'] });
    expect(res.status).toBe(200);
    expect(res.body.owned).toEqual(['hat-explorer', 'scarf-silk', 'stick-bamboo']);
    expect(res.body.equipped).toEqual(['hat-explorer', 'scarf-silk', 'stick-bamboo']);
    expect(res.body.coins).toBe(300 - 25 - 80 - 90);
  });

  it("one player's gear and coins are invisible to another", async () => {
    const a = await newGuest();
    const b = await newGuest();
    await grantCoins(a.playerId, 40);
    await put(a.browser, { buy: 'hat-sun', equipped: ['hat-sun'] });
    expect((await b.browser.request('GET', GEAR)).body).toMatchObject({ owned: [], equipped: [], coins: 0 });
    expect((await put(b.browser, { equipped: ['hat-sun'] })).status).toBe(403);
  });

  it('a cross-site PUT is refused by the origin check', async () => {
    const { browser, playerId } = await newGuest();
    await grantCoins(playerId, 40);
    const res = await put(browser, { buy: 'hat-sun', equipped: [] }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden_origin');
    expect(await gearRows(playerId)).toEqual([]);
  });

  it('the database refuses a gear purchase that adds coins, an earning that removes coins, or a purchase keyed to another player', async () => {
    const { playerId } = await newGuest();
    const insert = (amount: number, sourceType: string, sourceId: string) =>
      query(
        `insert into wallet_transactions (player_id, currency, amount, reason, source_type, source_id, idempotency_key)
         values ($1, 'coins', $2, 'gear:hat-sun', $3, $4, $5)`,
        [playerId, amount, sourceType, sourceId, `test:${randomUUID()}`],
      );
    await expect(insert(20, 'gear_purchase', playerId)).rejects.toThrow(/wallet_transactions_debit_ck/);
    await expect(insert(-20, 'play_session', randomUUID())).rejects.toThrow(/wallet_transactions_debit_ck/);
    await expect(insert(-20, 'gear_purchase', randomUUID())).rejects.toThrow(/wallet_transactions_gear_ck/);
    await expect(insert(20, 'shop', playerId)).rejects.toThrow(/wallet_transactions_source_ck/);
    // The same item cannot be bought (debited) twice, even around the API.
    await insert(-20, 'gear_purchase', playerId);
    await expect(insert(-20, 'gear_purchase', playerId)).rejects.toThrow(/wallet_transactions_source_uq/);
  });
});
