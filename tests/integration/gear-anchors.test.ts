import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GEAR_CATALOG, GEAR_SLOTS, publicCatalog } from '../../apps/api/src/modules/progress/gear-catalog';
import { requestForTap } from '../../games/zoo-sprint/src/basecamp/outfitter/gear-client';
import {
  GEAR_ANCHORS,
  GEAR_LOOKS,
  SKIPPED,
  gearPlacements,
  overlaps,
  type GearSlotId,
  type GearView,
} from '../../games/zoo-sprint/src/basecamp/outfitter/gear-model';
import { STARTERS } from '../../games/zoo-sprint/src/roster';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VIEWS: GearView[] = ['walk', 'bust'];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('gear on the painted buddy never covers a Character Bible LOCKED feature', () => {
  it('covers exactly the five starters, and no host or new starter', () => {
    expect(Object.keys(GEAR_ANCHORS).sort()).toEqual(STARTERS.map((s) => s.id).sort());
    expect(Object.keys(GEAR_ANCHORS)).not.toContain('click');
    expect(gearPlacements('click', 'walk', ['hat-sun', 'scarf-red', 'stick-oak'])).toEqual([]);
  });

  it('every LOCKED feature named in the Bible for a starter is listed in both views', () => {
    const expected: Record<string, RegExp[]> = {
      dino: [/dorsal spikes/, /one explorer backpack/],
      koala: [/glasses/],
      tarsier: [/goggles/, /eyes/],
      eagle: [/white head/, /varsity jacket/],
      bronco: [/maroon bandana/],
    };
    for (const [cast, features] of Object.entries(expected)) {
      for (const view of VIEWS) {
        const named = GEAR_ANCHORS[cast as keyof typeof GEAR_ANCHORS][view].locked.map((l) => l.feature).join(' | ');
        for (const feature of features) expect(named, `${cast} ${view}`).toMatch(feature);
      }
    }
  });

  it("every slot anchor clears every LOCKED feature of that starter's view", () => {
    for (const [cast, views] of Object.entries(GEAR_ANCHORS)) {
      for (const view of VIEWS) {
        const { locked, slots } = views[view];
        for (const [slot, rect] of Object.entries(slots)) {
          expect(rect.x0 >= 0 && rect.y0 >= 0 && rect.x1 <= 1 && rect.y1 <= 1 && rect.x0 < rect.x1 && rect.y0 < rect.y1, `${cast} ${view} ${slot}`).toBe(true);
          for (const feature of locked) {
            expect(overlaps(rect, feature.rect), `${cast} ${view} ${slot} covers "${feature.feature}"`).toBe(false);
          }
        }
      }
    }
  });

  it('a slot with no clear spot is skipped and the reason is recorded; the stick is never on a bust', () => {
    for (const [cast, views] of Object.entries(GEAR_ANCHORS)) {
      for (const slot of ['hat', 'scarf', 'stick'] as GearSlotId[]) {
        if (!views.walk.slots[slot]) expect(SKIPPED[cast as keyof typeof SKIPPED][slot], `${cast} ${slot}`).toBeTruthy();
      }
      expect(views.bust.slots.stick).toBeUndefined();
    }
    // The owner's examples: the scarf is not drawn over Bronco's bandana, no hat over Tarsier's goggles.
    expect(GEAR_ANCHORS.bronco.walk.slots.scarf).toBeUndefined();
    expect(GEAR_ANCHORS.bronco.bust.slots.scarf).toBeUndefined();
    expect(GEAR_ANCHORS.tarsier.walk.slots.hat).toBeUndefined();
  });

  it('no gear is a bag (Dino exactly one backpack, Koala no backpack)', () => {
    for (const [id, look] of Object.entries(GEAR_LOOKS)) {
      expect(id).not.toMatch(/pack|bag/);
      expect(look.slot).not.toMatch(/pack|bag/);
    }
  });

  it('placements: one per slot, hat then scarf then stick, unknown items and skipped slots dropped', () => {
    expect(gearPlacements('koala', 'walk', ['stick-oak', 'scarf-red', 'hat-sun', 'cape-gold']).map((p) => p.itemId)).toEqual([
      'hat-sun',
      'scarf-red',
      'stick-oak',
    ]);
    expect(gearPlacements('bronco', 'walk', ['hat-sun', 'scarf-red']).map((p) => p.itemId)).toEqual(['hat-sun']);
    expect(gearPlacements('eagle', 'bust', ['hat-sun', 'scarf-red', 'stick-oak'])).toEqual([]);
    expect(gearPlacements('dino', 'walk', ['scarf-red', 'scarf-silk']).map((p) => p.itemId)).toEqual(['scarf-red']);
  });
});

describe('the client gear looks mirror the server catalog', () => {
  it('every catalog item has a code-drawn look in the same slot, and nothing else does', () => {
    expect(Object.keys(GEAR_LOOKS).sort()).toEqual(GEAR_CATALOG.map((i) => i.id).sort());
    for (const item of GEAR_CATALOG) expect(GEAR_LOOKS[item.id]?.slot, item.id).toBe(item.slot);
    expect([...GEAR_SLOTS].sort()).toEqual(['hat', 'scarf', 'stick']);
  });

  it('the gear sprites load no image file and the outfitter never sends a price or coins', () => {
    const dir = join(REPO_ROOT, 'games/zoo-sprint/src/basecamp/outfitter');
    for (const file of ['gear-sprites.ts', 'gear-model.ts', 'OutfitterOverlay.ts', 'gear-client.ts', 'index.ts']) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'));
      expect(code, file).not.toMatch(/\.load\.|new URL\(|\.(png|webp|jpe?g|svg)\b|textures\.add|addBase64/);
      expect(code, file).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sessionStorage/);
    }
  });
});

describe('outfitter taps (pure request builder)', () => {
  const gear = { owned: ['hat-sun', 'scarf-red'], equipped: ['hat-sun'], coins: 50, catalog: publicCatalog() };

  it('an unowned item is bought and worn in its slot; the body names the item only, never a price', () => {
    expect(requestForTap(gear, 'hat-ranger')).toEqual({ buy: 'hat-ranger', equipped: ['hat-ranger'] });
    expect(requestForTap(gear, 'stick-oak')).toEqual({ buy: 'stick-oak', equipped: ['hat-sun', 'stick-oak'] });
  });

  it('an owned item is worn (replacing the same slot); a worn item is taken off', () => {
    expect(requestForTap(gear, 'scarf-red')).toEqual({ equipped: ['hat-sun', 'scarf-red'] });
    expect(requestForTap(gear, 'hat-sun')).toEqual({ equipped: [] });
    expect(requestForTap(gear, 'cape-gold')).toBeNull();
  });
});
