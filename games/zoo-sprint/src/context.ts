import type { BidaZooPlatform, Totals } from '@bidazoo/game-sdk';
import type { A11yMirror } from './a11y';
import { isAnimalKind, type AnimalKind } from './animals';

/** Everything the scenes share. None of it is authoritative: totals are copies of server facts. */
export interface GameContext {
  platform: BidaZooPlatform;
  parent: HTMLElement;
  a11y: A11yMirror;
  animal: AnimalKind;
  totals: Totals;
  activeSessionId: string | null;
}

const ANIMAL_KEY = 'bidazoo.animal';

/**
 * Which animal the child picked is presentation state only. It is kept in localStorage purely as
 * a convenience; losing it changes nothing about progress, which lives on the server.
 */
export function loadAnimal(): AnimalKind {
  try {
    const stored = localStorage.getItem(ANIMAL_KEY);
    if (isAnimalKind(stored)) return stored;
  } catch {
    // storage unavailable: use the default
  }
  return 'panda';
}

export function saveAnimal(animal: AnimalKind): void {
  try {
    localStorage.setItem(ANIMAL_KEY, animal);
  } catch {
    // storage unavailable: the choice just won't survive a reload
  }
}

export function getContext(scene: Phaser.Scene): GameContext {
  return scene.registry.get('ctx') as GameContext;
}
