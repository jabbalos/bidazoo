import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DESTINATION_IDS,
  EXPEDITION_UNLOCKED_KEY,
  mapTiles,
  parseDestinationManifest,
  serverUnlockedIds,
  type DestinationManifest,
} from '../../games/zoo-sprint/src/presentation/destination-model';

const DIR = fileURLToPath(new URL('../../games/zoo-sprint/assets/world-expedition/destinations', import.meta.url));
const folders = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const manifests = (): DestinationManifest[] =>
  folders.map((f) => parseDestinationManifest(JSON.parse(readFileSync(join(DIR, f, 'manifest.json'), 'utf8')))!).sort((a, b) => a.order - b.order);

describe('destination ids match the server list', () => {
  it('uses the short ids in the server order', () => {
    expect([...DESTINATION_IDS]).toEqual(['great-wall', 'petra', 'andes', 'maya', 'taj', 'nile', 'philippine-highlands']);
  });

  it('has one folder per id, and each manifest id equals its folder name', () => {
    expect([...folders].sort()).toEqual([...DESTINATION_IDS].sort());
    for (const f of folders) expect(manifests().some((m) => m.id === f)).toBe(true);
    expect(manifests().map((m) => m.id)).toEqual([...DESTINATION_IDS]);
  });

  it('every unlock.requires entry names a known destination', () => {
    for (const m of manifests()) for (const r of m.unlock.requires) expect(DESTINATION_IDS).toContain(r);
  });
});

describe('server-driven unlocks', () => {
  it('uses the key expeditionUnlocked', () => {
    expect(EXPEDITION_UNLOCKED_KEY).toBe('expeditionUnlocked');
  });

  it('shows only great-wall unlocked until the server list is set', () => {
    for (const raw of [undefined, null, 'petra', 42, {}]) {
      expect(mapTiles(manifests(), serverUnlockedIds(raw)).filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall']);
    }
    expect(mapTiles(manifests()).filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall']);
  });

  it('unlocks exactly the ids the server lists, ignoring manifest rules', () => {
    const tiles = mapTiles(manifests(), serverUnlockedIds(['great-wall', 'andes']));
    // andes requires petra in its manifest, but the server list wins
    expect(tiles.filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall', 'andes']);
  });

  it('does not unlock from a manifest startsUnlocked flag', () => {
    const ms = manifests().map((m) => ({ ...m, unlock: { ...m.unlock, startsUnlocked: true } }));
    expect(mapTiles(ms, serverUnlockedIds([])).filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall']);
  });

  it('keeps great-wall open even if the server list omits it, and drops non-string and unknown ids', () => {
    expect([...serverUnlockedIds(['petra', 7, null])].sort()).toEqual(['great-wall', 'petra']);
    expect([...serverUnlockedIds(new Set(['maya']))].sort()).toEqual(['great-wall', 'maya']);
    const tiles = mapTiles(manifests(), serverUnlockedIds(['not-a-place']));
    expect(tiles.filter((t) => t.unlocked).map((t) => t.id)).toEqual(['great-wall']);
  });

  it('updates when the list changes, and the manifest only supplies the lock text', () => {
    const before = mapTiles(manifests(), serverUnlockedIds(['great-wall']));
    const after = mapTiles(manifests(), serverUnlockedIds(['great-wall', 'petra']));
    expect(before.find((t) => t.id === 'petra')!.unlocked).toBe(false);
    expect(after.find((t) => t.id === 'petra')!.unlocked).toBe(true);
    for (const t of before.filter((x) => !x.unlocked)) expect(t.rule).toBe(manifests().find((m) => m.id === t.id)!.unlock.rule);
  });
});
