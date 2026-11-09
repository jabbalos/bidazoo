/**
 * Type-level assertions on every interface fixed in proposal 2.6. Nothing here runs and nothing
 * imports this file; `npm run typecheck` compiles it, so changing any of these signatures fails
 * the typecheck. A lane may ADD to its side of a contract; changing a signature needs the
 * integration workspace's merge, which updates this file in the same commit.
 */
import type {
  ApiPaths,
  Daily,
  DailySchema,
  ExpeditionProgress,
  ExpeditionProgressSchema,
  Gear,
  GearSchema,
  PublicQuestion,
  PublicQuestionSchema,
  Stamp,
  StampSchema,
} from '@bidazoo/contracts';
import type { AnswerResult, PlaySession, SessionResults, StartPlaySessionRequest } from '@bidazoo/game-sdk';
import type { EncounterState, applyAnswer, createEncounter, replayExpedition } from '@bidazoo/learning-core';
import type { OverlayDef, OverlayHotspot, OverlayId, overlaysAt, registerOverlay } from './basecamp/overlays';
import type { ChallengerId, EncounterOutcome, startEncounter } from './encounter';
import type { CharacterId } from './roster';
import type { BasecampScene } from './scenes/BasecampScene';
import type { DestinationId, SessionClient, createSessionClient } from './session-client';

/** True only when A and B are the identical type. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// 1. Encounter overlay: games/zoo-sprint/src/encounter/index.ts
type Item1 = [
  Assert<
    Equals<
      typeof startEncounter,
      (
        scene: Phaser.Scene,
        opts: { session: SessionClient; questions: number; kind: 'node' | 'boss'; challenger: ChallengerId; buddy: CharacterId },
      ) => Promise<EncounterOutcome>
    >
  >,
  Assert<Equals<EncounterOutcome, { won: boolean; correct: number; asked: number; bestStreak: number; heartsLeft: number }>>,
];

// 2. Session client: games/zoo-sprint/src/session-client.ts
type Item2 = [
  Assert<Equals<SessionClient['startSession'], (req: StartPlaySessionRequest & { destination?: DestinationId }) => Promise<PlaySession>>>,
  Assert<Equals<SessionClient['nextQuestion'], () => Promise<PublicQuestion>>>,
  Assert<Equals<SessionClient['submitAnswer'], (choice: number | string) => Promise<AnswerResult>>>,
  Assert<Equals<SessionClient['results'], () => Promise<SessionResults | null>>>,
  Assert<Equals<keyof SessionClient, 'startSession' | 'nextQuestion' | 'submitAnswer' | 'results'>>,
  Assert<Equals<typeof createSessionClient, (platform: import('@bidazoo/game-sdk').BidaZooPlatform) => SessionClient>>,
];

// 3. Basecamp overlay registry: games/zoo-sprint/src/basecamp/overlays.ts
type Item3 = [
  Assert<
    Equals<
      typeof registerOverlay,
      (
        id: 'map' | 'outfitter' | 'passport' | 'daily',
        def: { hotspot: 'map-board' | 'lodge-door' | 'banner'; open(scene: BasecampScene): Phaser.GameObjects.Container },
      ) => void
    >
  >,
  Assert<Equals<OverlayId, 'map' | 'outfitter' | 'passport' | 'daily'>>,
  Assert<Equals<OverlayHotspot, 'map-board' | 'lodge-door' | 'banner'>>,
  Assert<Equals<OverlayDef['open'], (scene: BasecampScene) => Phaser.GameObjects.Container>>,
  Assert<Equals<typeof overlaysAt, (hotspot: OverlayHotspot) => Array<{ id: OverlayId; def: OverlayDef }>>>,
];

// 4. Progress contracts: packages/contracts/src/progress.ts, re-exported by the contracts index.
//    The shapes are Lane C's to grow; the exports and the paths are fixed.
type Item4 = [
  Assert<Equals<(typeof ExpeditionProgressSchema)['type'], 'object'>>,
  Assert<Equals<(typeof StampSchema)['type'], 'object'>>,
  Assert<Equals<(typeof GearSchema)['type'], 'object'>>,
  Assert<Equals<(typeof DailySchema)['type'], 'object'>>,
  Assert<ExpeditionProgress extends object ? true : false>,
  Assert<Stamp extends object ? true : false>,
  Assert<Gear extends object ? true : false>,
  Assert<Daily extends object ? true : false>,
  Assert<Equals<(typeof ApiPaths)['meExpedition'], '/api/v1/me/expedition'>>,
  Assert<Equals<(typeof ApiPaths)['meGear'], '/api/v1/me/gear'>>,
  Assert<Equals<(typeof ApiPaths)['meDaily'], '/api/v1/me/daily'>>,
];

// 5. Question kind: PublicQuestionSchema in packages/contracts/src/index.ts.
type Item5 = [
  Assert<Equals<PublicQuestion['kind'], 'number' | 'text' | undefined>>,
  Assert<Equals<PublicQuestion['choices'], number[] | string[]>>,
  Assert<Equals<keyof PublicQuestion, 'id' | 'sequence' | 'prompt' | 'type' | 'kind' | 'choices'>>,
  Assert<Equals<(typeof PublicQuestionSchema)['type'], 'object'>>,
];

// 6. Encounter model: packages/learning-core/src/encounter/encounter-model.ts
type Item6 = [
  Assert<Equals<typeof createEncounter, (opts: { questions: number; kind: 'node' | 'boss'; specialMoves: number }) => EncounterState>>,
  Assert<Equals<typeof applyAnswer, (state: EncounterState, answer: { correct: boolean }) => EncounterState>>,
  Assert<Equals<typeof replayExpedition, (answers: { correct: boolean }[]) => { beaconsLit: number; bossWon: boolean }>>,
];

export type ContractChecks = [Item1, Item2, Item3, Item4, Item5, Item6];
