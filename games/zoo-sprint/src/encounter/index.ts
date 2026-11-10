import type { CharacterId } from '../roster';
import type { SessionClient } from '../session-client';
import { challengerFor, loadChallengerArt } from './challengers';
import { EncounterOverlay } from './EncounterOverlay';
import { initialState, runEncounter } from './encounter-flow';

/** A challenger id from Lane A's challenger definitions (challengers.ts). */
export type ChallengerId = string;

export interface EncounterOutcome {
  won: boolean;
  correct: number;
  asked: number;
  bestStreak: number;
  heartsLeft: number;
}

/**
 * Runs one encounter over the current play session (proposal 2.6 item 1; Lane A owns it, Lane B
 * calls it). Each question comes from and is graded by the server through `opts.session`.
 *
 * The overlay shows the challenger on the right and the buddy's painted bust on the left, with
 * hearts, the charge meter, a display-only timer and the answer tiles. Hearts, strikes, charge and
 * special moves come from the encounter model in `@bidazoo/learning-core` applied to the server's
 * grades (one special move for a node, two for the boss; the charge meter carries from encounter to
 * encounter while the same session client is used). Hearts at 0 end the encounter at once: lost,
 * nothing else happens; the session itself continues. The outcome is for presentation only: the
 * server replays its own answers for beacons and stamps.
 */
export async function startEncounter(
  scene: Phaser.Scene,
  opts: { session: SessionClient; questions: number; kind: 'node' | 'boss'; challenger: ChallengerId; buddy: CharacterId },
): Promise<EncounterOutcome> {
  const challenger = challengerFor(opts.challenger, opts.kind);
  await loadChallengerArt(scene, [challenger.id]);
  const overlay = new EncounterOverlay(scene, {
    kind: opts.kind,
    questions: opts.questions,
    buddy: opts.buddy,
    challenger,
    initial: initialState(opts.session, opts),
  });
  try {
    await overlay.intro();
    return await runEncounter(opts.session, { questions: opts.questions, kind: opts.kind }, overlay);
  } finally {
    overlay.close();
  }
}
