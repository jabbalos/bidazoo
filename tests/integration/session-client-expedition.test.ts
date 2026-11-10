import { describe, expect, it, vi } from 'vitest';
import type {
  BidaZooPlatform,
  PlaySession,
  StartExpeditionRunRequest,
  StartPlaySessionRequest,
  StartPlaySessionResponse,
} from '@bidazoo/game-sdk';

// ui.ts imports Phaser, which cannot load in Node; the session client only needs its attempt ids.
vi.mock('../../games/zoo-sprint/src/ui', () => ({ makeAttemptId: () => 'attempt-1' }));
const { PlaySessionClient } = await import('../../games/zoo-sprint/src/session-client');

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-11-09T12:00:00.000Z';

function session(mode: string): PlaySession {
  return {
    id: SESSION_ID,
    gameId: 'zoo-sprint',
    mode,
    status: 'active',
    total: mode === 'expedition' ? 15 : 10,
    answered: 0,
    correct: 0,
    startedAt: NOW,
    expiresAt: NOW,
    completedAt: null,
    currentQuestion: null,
    results: null,
  } as PlaySession;
}

/** A platform that records what the client sends; only the calls these tests make are implemented. */
function fakePlatform(opts: { withRuns: boolean; refuseRun?: boolean }) {
  const starts: StartPlaySessionRequest[] = [];
  const runs: StartExpeditionRunRequest[] = [];
  const platform: BidaZooPlatform = {
    ensureGuest: () => Promise.reject(new Error('not used')),
    startSession: async (request) => {
      starts.push(request);
      return { session: session(request.mode) } as StartPlaySessionResponse;
    },
    getSession: () => Promise.reject(new Error('not used')),
    nextQuestion: () => Promise.reject(new Error('not used')),
    submitAnswer: () => Promise.reject(new Error('not used')),
    ...(opts.withRuns
      ? {
          startExpeditionRun: async (request: StartExpeditionRunRequest) => {
            if (opts.refuseRun) throw new Error('destination_locked');
            runs.push(request);
            return { ...request };
          },
        }
      : {}),
  };
  return { platform, starts, runs };
}

describe('session client: an expedition tells the server its destination', () => {
  it('records the destination right after an expedition session starts, and sends the start request without it', async () => {
    const { platform, starts, runs } = fakePlatform({ withRuns: true });
    const client = new PlaySessionClient(platform);
    await client.startSession({ gameId: 'zoo-sprint', mode: 'expedition', destination: 'great-wall' });
    expect(starts).toEqual([{ gameId: 'zoo-sprint', mode: 'expedition' }]);
    expect(runs).toEqual([{ sessionId: SESSION_ID, destination: 'great-wall' }]);
  });

  it('records nothing for the gate quiz, even with a destination', async () => {
    const { platform, runs } = fakePlatform({ withRuns: true });
    const client = new PlaySessionClient(platform);
    await client.startSession({ gameId: 'zoo-sprint', mode: 'multiplication', destination: 'great-wall' });
    expect(runs).toEqual([]);
  });

  it('records nothing for an expedition without a destination', async () => {
    const { platform, runs } = fakePlatform({ withRuns: true });
    const client = new PlaySessionClient(platform);
    await client.startSession({ gameId: 'zoo-sprint', mode: 'expedition' });
    expect(runs).toEqual([]);
  });

  it('still starts on a platform without the expedition call (no stamps)', async () => {
    const { platform, starts } = fakePlatform({ withRuns: false });
    const client = new PlaySessionClient(platform);
    const started = await client.startSession({ gameId: 'zoo-sprint', mode: 'expedition', destination: 'great-wall' });
    expect(started.id).toBe(SESSION_ID);
    expect(starts).toHaveLength(1);
  });

  it('a refused destination (for example a locked one) surfaces as an error', async () => {
    const { platform } = fakePlatform({ withRuns: true, refuseRun: true });
    const client = new PlaySessionClient(platform);
    await expect(client.startSession({ gameId: 'zoo-sprint', mode: 'expedition', destination: 'andes' })).rejects.toThrow(/destination_locked/);
  });
});
