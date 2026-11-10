/**
 * Gemini review 4 (High): the game's destinations and the server's must be ONE list. Every destination
 * manifest the game ships has an id the server accepts on POST /api/v1/me/expedition/runs, and the game's
 * DESTINATION_IDS is the contracts list itself (owner decision, November 10, 2026: short ids).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '@bidazoo/api/app';
import type { AppContext } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
import { EXPEDITION_DESTINATIONS } from '@bidazoo/contracts';
import type { FastifyInstance } from 'fastify';
import { DESTINATION_IDS } from '../../games/zoo-sprint/src/presentation/destination-model';
import { FakeClock, HAS_DB, PATHS, TEST_DATABASE_URL, TestBrowser, startSession } from './support/harness';

const RUNS = '/api/v1/me/expedition/runs';
const DESTINATIONS_DIR = join(__dirname, '../../games/zoo-sprint/assets/world-expedition/destinations');

function manifestIds(): string[] {
  return readdirSync(DESTINATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => (JSON.parse(readFileSync(join(DESTINATIONS_DIR, d.name, 'manifest.json'), 'utf8')) as { id: string }).id);
}

describe('destination ids: one list for game and server', () => {
  it("the game's DESTINATION_IDS is the contracts list, in the same order", () => {
    expect(DESTINATION_IDS).toBe(EXPEDITION_DESTINATIONS);
  });

  it('every manifest id is a server destination, and every server destination has a manifest', () => {
    expect([...manifestIds()].sort()).toEqual([...EXPEDITION_DESTINATIONS].sort());
  });
});

describe.skipIf(!HAS_DB)('every manifest id is accepted by POST /api/v1/me/expedition/runs (real PostgreSQL)', () => {
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
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await database.close();
  });

  it.each(manifestIds())('%s starts an expedition run once the destinations before it are stamped', async (id) => {
    const browser = new TestBrowser(app, ctx.cookie.name);
    const guest = await browser.request('POST', PATHS.guest, {});
    expect(guest.status).toBe(200);
    const playerId = guest.body.player.id as string;
    const before = EXPEDITION_DESTINATIONS.slice(0, EXPEDITION_DESTINATIONS.indexOf(id as (typeof EXPEDITION_DESTINATIONS)[number]));
    for (const stamped of before) {
      await database.pool.query('insert into destination_stamps (player_id, destination, count) values ($1, $2, 1)', [
        playerId,
        stamped,
      ]);
    }
    const sessionId = await startSession(browser);
    const res = await browser.request('POST', RUNS, { sessionId, destination: id });
    expect(res.status, id).toBe(201);
    expect(res.body).toEqual({ sessionId, destination: id });
  });
});
