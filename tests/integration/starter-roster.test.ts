import { describe, expect, it } from 'vitest';
import {
  CHARACTER_STORAGE_KEY,
  DEFAULT_CHARACTER,
  STARTERS,
  characterName,
  isCharacterId,
  loadCharacter,
  saveCharacter,
  type KeyValueStore,
} from '../../games/zoo-sprint/src/roster';

/** A throwaway in-memory stand-in for localStorage that records every write. */
function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string>; writes: string[] } {
  const data = { ...initial };
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (key) => (key in data ? (data[key] as string) : null),
    setItem: (key, value) => {
      writes.push(key);
      data[key] = value;
    },
  };
}

describe('starter roster (presentation only)', () => {
  it('has exactly the five locked starters, in order, with the child-facing labels', () => {
    expect(STARTERS.map((s) => s.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco']);
    expect(STARTERS.map((s) => s.name)).toEqual(['Dino', 'Koala', 'Tarsier', 'Eagle', 'Bronco']);
    expect(STARTERS).toHaveLength(5);
  });

  it('does not make Click selectable, and rejects the retired placeholders', () => {
    for (const notSelectable of ['click', 'Click', 'panda', 'monkey', 'lion', '', 'dinosaur', null, undefined, 7]) {
      expect(isCharacterId(notSelectable), String(notSelectable)).toBe(false);
    }
    for (const starter of STARTERS) expect(isCharacterId(starter.id)).toBe(true);
    expect(characterName('bronco')).toBe('Bronco');
  });

  it('defaults to Dino', () => {
    expect(DEFAULT_CHARACTER).toBe('dino');
    expect(isCharacterId(DEFAULT_CHARACTER)).toBe(true);
    expect(loadCharacter(memoryStore())).toBe('dino');
    expect(loadCharacter(undefined)).toBe('dino');
  });

  it('remembers a valid choice under the same storage key Checkpoint B used', () => {
    const store = memoryStore();
    for (const starter of STARTERS) {
      saveCharacter(starter.id, store);
      expect(store.data[CHARACTER_STORAGE_KEY]).toBe(starter.id);
      expect(loadCharacter(store)).toBe(starter.id);
    }
    expect(CHARACTER_STORAGE_KEY).toBe('bidazoo.animal');
  });

  it('safely falls back to Dino for legacy panda / monkey / lion values, without migrating them', () => {
    for (const legacy of ['panda', 'monkey', 'lion']) {
      const store = memoryStore({ [CHARACTER_STORAGE_KEY]: legacy });
      expect(loadCharacter(store), legacy).toBe('dino');
      // Loading never rewrites the old value into some other starter.
      expect(store.writes, legacy).toEqual([]);
      expect(store.data[CHARACTER_STORAGE_KEY]).toBe(legacy);
    }
  });

  it('falls back to Dino for any other junk value, including click', () => {
    for (const junk of ['click', 'CLICK', 'Dino', ' dino', '{"id":"dino"}', 'undefined']) {
      expect(loadCharacter(memoryStore({ [CHARACTER_STORAGE_KEY]: junk })), junk).toBe('dino');
    }
  });

  it('never throws when storage is blocked', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadCharacter(blocked)).toBe('dino');
    expect(() => saveCharacter('eagle', blocked)).not.toThrow();
  });
});
