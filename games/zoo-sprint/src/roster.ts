/**
 * The locked BidaZoo starter roster (docs/CHARACTER-BIBLE.md).
 *
 * Pure data and one tiny storage helper: no Phaser, no network, no server. Which starter a child
 * picks is PRESENTATION ONLY. It is never sent to the API, never stored by the server, and never
 * changes questions, grading, mastery, XP, or coins.
 *
 * Click, the platform host, is deliberately NOT here: Click is not a selectable starter.
 * The ids are implementation conventions, not permanent brand contracts.
 */
export type CharacterId = 'dino' | 'koala' | 'tarsier' | 'eagle' | 'bronco';

export interface Starter {
  readonly id: CharacterId;
  /** The child-facing label. */
  readonly name: string;
}

export const STARTERS: ReadonlyArray<Starter> = [
  { id: 'dino', name: 'Dino' },
  { id: 'koala', name: 'Koala' },
  { id: 'tarsier', name: 'Tarsier' },
  { id: 'eagle', name: 'Eagle' },
  { id: 'bronco', name: 'Bronco' },
];

export const DEFAULT_CHARACTER: CharacterId = 'dino';

export function isCharacterId(value: unknown): value is CharacterId {
  return STARTERS.some((starter) => starter.id === value);
}

export function characterName(id: CharacterId): string {
  return STARTERS.find((starter) => starter.id === id)?.name ?? '';
}

/**
 * Same key Checkpoint B used. Keeping it means a browser that still holds an old placeholder
 * value ('panda', 'monkey', 'lion') meets it, fails `isCharacterId`, and safely gets the default.
 * Old values are never migrated to a particular starter.
 */
export const CHARACTER_STORAGE_KEY = 'bidazoo.animal';

/** The two storage calls this module needs, so tests can pass a stub without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): KeyValueStore | undefined {
  try {
    return (globalThis as { localStorage?: KeyValueStore }).localStorage;
  } catch {
    return undefined; // storage blocked: behave as if there is none
  }
}

/** The remembered starter, or Dino when nothing valid is stored. Never throws. */
export function loadCharacter(store: KeyValueStore | undefined = browserStore()): CharacterId {
  try {
    const stored = store?.getItem(CHARACTER_STORAGE_KEY);
    if (isCharacterId(stored)) return stored;
  } catch {
    // storage unavailable: use the default
  }
  return DEFAULT_CHARACTER;
}

/** Remember the choice as a convenience only. Losing it changes nothing about progress. */
export function saveCharacter(id: CharacterId, store: KeyValueStore | undefined = browserStore()): void {
  try {
    store?.setItem(CHARACTER_STORAGE_KEY, id);
  } catch {
    // storage unavailable: the choice just won't survive a reload
  }
}
