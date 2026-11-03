import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as assetsModule from '../../games/zoo-sprint/src/character-assets';
import {
  EXPRESSION_SOURCE_FILES,
  M4_SOURCE_ROOT,
  expressionTextureKey,
  getExpressionAssetRef,
} from '../../games/zoo-sprint/src/character-assets';
import * as definitionsModule from '../../games/zoo-sprint/src/character-definitions';
import {
  CAST_SCALE_FACTORS,
  CHARACTER_DEFINITIONS,
  EXPRESSION_STATES,
  HOST_DEFINITION,
  STARTER_DEFINITIONS,
  getCharacterDefinition,
  isCastId,
  type CastId,
} from '../../games/zoo-sprint/src/character-definitions';
import {
  CHARACTER_STORAGE_KEY,
  DEFAULT_CHARACTER,
  STARTERS,
  isCharacterId,
  loadCharacter,
  saveCharacter,
  type KeyValueStore,
} from '../../games/zoo-sprint/src/roster';

/** The repository root (this file lives in tests/integration). */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const SIX_STATES = ['idle', 'happy', 'thinking', 'cheer', 'discover', 'tryAgain'];

const EXPECTED_SCALE: Record<CastId, number> = {
  eagle: 1.0,
  click: 0.92,
  bronco: 0.92,
  dino: 0.85,
  koala: 0.76,
  tarsier: 0.57,
};

/** Anything that would make a character definition about learning or the game economy. */
const FORBIDDEN_NAME = /difficult|question|mastery|grad(e|ing)|\bxp\b|coin|progress|correct|attempt|score|reward|session|level|skill|wallet|currency/i;

function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      into.push(key);
      collectKeys(inner, into);
    }
  }
  return into;
}

/** The module's code with comments removed, so prose in a comment never trips a code check. */
function codeOf(file: string): string {
  const text = readFileSync(join(REPO_ROOT, 'games/zoo-sprint/src', file), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function importsOf(code: string): string[] {
  return [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string);
}

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

describe('character definitions: the cast (presentation only)', () => {
  it('has exactly the five selectable starters, in roster order', () => {
    const selectable = CHARACTER_DEFINITIONS.filter((definition) => definition.selectable);
    expect(selectable.map((d) => d.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco']);
    expect(selectable.map((d) => d.displayName)).toEqual(['Dino', 'Koala', 'Tarsier', 'Eagle', 'Bronco']);
    expect(selectable).toHaveLength(5);
    expect(STARTER_DEFINITIONS.map((d) => d.id)).toEqual(selectable.map((d) => d.id));
    for (const definition of STARTER_DEFINITIONS) {
      expect(definition.selectable).toBe(true);
      expect(definition.role).toBe('starter');
    }
  });

  it('derives the starters from roster.ts instead of keeping a second list', () => {
    expect(STARTER_DEFINITIONS.map((d) => [d.id, d.displayName])).toEqual(STARTERS.map((s) => [s.id, s.name]));
    for (const starter of STARTERS) expect(isCharacterId(starter.id)).toBe(true);
  });

  it('registers Click as the host and guide, and Click is NOT selectable', () => {
    const click = CHARACTER_DEFINITIONS.find((d) => d.id === 'click');
    expect(click).toBeDefined();
    expect(click).toBe(HOST_DEFINITION);
    expect(click?.selectable).toBe(false);
    expect(click?.role).toBe('host-guide');
    expect(click?.displayName).toBe('Click');
    expect(getCharacterDefinition('click')).toBe(HOST_DEFINITION);
    // Click never enters the starter list or the saved-choice validation.
    expect(STARTER_DEFINITIONS.map((d) => d.id as string)).not.toContain('click');
    expect(STARTERS.map((s) => s.id as string)).not.toContain('click');
    expect(isCharacterId('click')).toBe(false);
    expect(isCastId('click')).toBe(true);
  });

  it('is exactly six unique characters: the five starters plus Click', () => {
    expect(CHARACTER_DEFINITIONS).toHaveLength(6);
    expect(new Set(CHARACTER_DEFINITIONS.map((d) => d.id)).size).toBe(6);
    expect(CHARACTER_DEFINITIONS.map((d) => d.id)).toEqual(['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click']);
    for (const id of CHARACTER_DEFINITIONS.map((d) => d.id)) expect(getCharacterDefinition(id).id).toBe(id);
  });

  it('rejects anything that is not someone in the cast', () => {
    for (const junk of ['panda', 'monkey', 'lion', 'Click', 'Dino', '', 'dinosaur', null, undefined, 7, {}]) {
      expect(isCastId(junk), String(junk)).toBe(false);
    }
  });

  it('gives every character exactly the six canonical expression states, in order', () => {
    expect([...EXPRESSION_STATES]).toEqual(SIX_STATES);
    for (const definition of CHARACTER_DEFINITIONS) {
      expect([...definition.expressions], definition.id).toEqual(SIX_STATES);
      expect(definition.expressions).toHaveLength(6);
    }
  });

  it('uses exactly the owner-approved cast-relative scale factors', () => {
    expect({ ...CAST_SCALE_FACTORS }).toEqual(EXPECTED_SCALE);
    for (const id of Object.keys(EXPECTED_SCALE) as CastId[]) {
      expect(getCharacterDefinition(id).scaleFactor, id).toBe(EXPECTED_SCALE[id]);
    }
    expect(getCharacterDefinition('eagle').scaleFactor).toBe(1.0);
    expect(getCharacterDefinition('click').scaleFactor).toBe(0.92);
    expect(getCharacterDefinition('bronco').scaleFactor).toBe(0.92);
    expect(getCharacterDefinition('dino').scaleFactor).toBe(0.85);
    expect(getCharacterDefinition('koala').scaleFactor).toBe(0.76);
    expect(getCharacterDefinition('tarsier').scaleFactor).toBe(0.57);
    // The cast is deliberately NOT normalized to one apparent height.
    expect(new Set(Object.values(EXPECTED_SCALE)).size).toBe(5);
    expect(Math.max(...Object.values(CAST_SCALE_FACTORS))).toBe(CAST_SCALE_FACTORS.eagle);
  });

  it('is deeply immutable', () => {
    for (const definition of CHARACTER_DEFINITIONS) {
      expect(Object.isFrozen(definition), definition.id).toBe(true);
      expect(Object.isFrozen(definition.expressions), definition.id).toBe(true);
      expect(() => {
        (definition as unknown as { scaleFactor: number }).scaleFactor = 2;
      }).toThrow(TypeError);
    }
    expect(Object.isFrozen(CHARACTER_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(STARTER_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(EXPRESSION_STATES)).toBe(true);
    expect(Object.isFrozen(CAST_SCALE_FACTORS)).toBe(true);
  });
});

describe('character definitions carry no learning or game-economy properties', () => {
  it('has exactly the six presentation fields and nothing else', () => {
    for (const definition of CHARACTER_DEFINITIONS) {
      expect(Object.keys(definition).sort(), definition.id).toEqual(
        ['displayName', 'expressions', 'id', 'role', 'scaleFactor', 'selectable'],
      );
    }
  });

  it('has no academic, scoring, reward, or progression name anywhere in its data or exports', () => {
    expect(collectKeys(CHARACTER_DEFINITIONS).filter((key) => FORBIDDEN_NAME.test(key))).toEqual([]);
    expect(collectKeys(EXPRESSION_SOURCE_FILES).filter((key) => FORBIDDEN_NAME.test(key))).toEqual([]);
    expect(Object.keys(definitionsModule).filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
    expect(Object.keys(assetsModule).filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
  });

  it('only imports roster.ts (definitions) and the definitions (assets): no platform, no Phaser, no network, no storage', () => {
    const definitions = codeOf('character-definitions.ts');
    const assets = codeOf('character-assets.ts');
    expect(importsOf(definitions)).toEqual(['./roster']);
    expect(importsOf(assets)).toEqual(['./character-definitions']);
    for (const code of [definitions, assets]) {
      expect(code).not.toMatch(/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document|window|navigator|Phaser|require)\b|import\(/);
    }
  });
});

describe('character selection stays presentation-only', () => {
  it('keeps the existing roster behavior and the saved-choice key', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('bidazoo.animal');
    expect(DEFAULT_CHARACTER).toBe('dino');
    expect(STARTERS).toHaveLength(5);
    expect(STARTERS.map((s) => Object.keys(s).sort())).toEqual(STARTERS.map(() => ['id', 'name']));
    expect(loadCharacter(memoryStore())).toBe('dino');
    for (const legacy of ['panda', 'monkey', 'lion', 'click', 'not-a-starter']) {
      expect(loadCharacter(memoryStore({ [CHARACTER_STORAGE_KEY]: legacy })), legacy).toBe('dino');
    }
  });

  it('saving any starter writes only the one local key, and nothing about the cast changes it', () => {
    for (const definition of STARTER_DEFINITIONS) {
      const store = memoryStore();
      saveCharacter(definition.id, store);
      expect(store.writes).toEqual([CHARACTER_STORAGE_KEY]);
      expect(store.data).toEqual({ [CHARACTER_STORAGE_KEY]: definition.id });
      expect(loadCharacter(store)).toBe(definition.id);
    }
  });
});

describe('expression source mapping (curated, M4 filenames untouched)', () => {
  const ids = CHARACTER_DEFINITIONS.map((d) => d.id);

  it('maps every character and every state, and nothing else (36 entries)', () => {
    expect(Object.keys(EXPRESSION_SOURCE_FILES).sort()).toEqual([...ids].sort());
    let total = 0;
    for (const id of ids) {
      expect(Object.keys(EXPRESSION_SOURCE_FILES[id]).sort(), id).toEqual([...SIX_STATES].sort());
      total += Object.keys(EXPRESSION_SOURCE_FILES[id]).length;
    }
    expect(total).toBe(36);
    expect(new Set(ids.flatMap((id) => Object.values(EXPRESSION_SOURCE_FILES[id]))).size).toBe(36);
  });

  it('only ever points at a character\'s own expression-batch PNG', () => {
    for (const id of ids) {
      for (const state of SIX_STATES) {
        const file = EXPRESSION_SOURCE_FILES[id][state as keyof (typeof EXPRESSION_SOURCE_FILES)[typeof id]];
        expect(file, `${id}/${state}`).toMatch(new RegExp(`^expression-batch/${id}/${id}_[A-Za-z_]+\\.png$`));
        expect(file).not.toMatch(/\.\.|\\|asset-library|_superseded|_historical|logo|renderer|qa|composite/);
      }
    }
  });

  it('keeps the runtime vocabulary stable while source filenames vary (Koala thinking is "analytical")', () => {
    expect(EXPRESSION_SOURCE_FILES.koala.thinking).toBe('expression-batch/koala/koala_thinking_analytical.png');
    expect(getExpressionAssetRef('koala', 'thinking').state).toBe('thinking');
    for (const id of ids.filter((candidate) => candidate !== 'koala')) {
      expect(EXPRESSION_SOURCE_FILES[id].thinking).toBe(`expression-batch/${id}/${id}_thinking.png`);
    }
  });

  it('is exactly the 36 canonical expression PNGs in production-v1.1, with none missing or extra', () => {
    expect(M4_SOURCE_ROOT).toBe('docs/reference-art/world-expedition/production-v1.1');
    expect(M4_SOURCE_ROOT).not.toMatch(/production-v1\/?$/);
    const batchRoot = join(REPO_ROOT, M4_SOURCE_ROOT, 'expression-batch');
    expect(existsSync(batchRoot)).toBe(true);
    const onDisk = readdirSync(batchRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((dir) =>
        readdirSync(join(batchRoot, dir.name))
          .filter((file) => file.endsWith('.png'))
          .map((file) => `expression-batch/${dir.name}/${file}`),
      )
      .sort();
    const mapped = ids.flatMap((id) => Object.values(EXPRESSION_SOURCE_FILES[id])).sort();
    expect(mapped).toEqual(onDisk);
    for (const file of mapped) expect(existsSync(join(REPO_ROOT, M4_SOURCE_ROOT, file)), file).toBe(true);
  });

  it('gives each state a unique, well-formed texture key that cannot collide with the code-drawn fallback', () => {
    const keys = ids.flatMap((id) => SIX_STATES.map((state) => expressionTextureKey(id, state as never)));
    expect(new Set(keys).size).toBe(36);
    for (const key of keys) {
      expect(key).toMatch(/^bz-we-character-(dino|koala|tarsier|eagle|bronco|click)-(idle|happy|thinking|cheer|discover|tryAgain)$/);
      expect(key.startsWith('bz-character-')).toBe(false);
    }
    expect(expressionTextureKey('dino', 'tryAgain')).toBe('bz-we-character-dino-tryAgain');
  });

  it('describes an asset with provenance only: no runtime URL, no loading', () => {
    const ref = getExpressionAssetRef('dino', 'thinking');
    expect(Object.keys(ref).sort()).toEqual(['id', 'sourcePath', 'state', 'textureKey']);
    expect(ref.textureKey).toBe('bz-we-character-dino-thinking');
    expect(ref.sourcePath).toBe(`${M4_SOURCE_ROOT}/expression-batch/dino/dino_thinking.png`);
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(EXPRESSION_SOURCE_FILES)).toBe(true);
    for (const id of ids) expect(Object.isFrozen(EXPRESSION_SOURCE_FILES[id]), id).toBe(true);
  });
});
