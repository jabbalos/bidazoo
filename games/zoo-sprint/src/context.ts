import type { BidaZooPlatform, Totals } from '@bidazoo/game-sdk';
import type { A11yMirror } from './a11y';
import type { CharacterId } from './roster';

/** Everything the scenes share. None of it is authoritative: totals are copies of server facts. */
export interface GameContext {
  platform: BidaZooPlatform;
  parent: HTMLElement;
  a11y: A11yMirror;
  /** The starter the child picked. Presentation only: it never leaves the browser. */
  character: CharacterId;
  totals: Totals;
  activeSessionId: string | null;
}

export function getContext(scene: Phaser.Scene): GameContext {
  return scene.registry.get('ctx') as GameContext;
}
