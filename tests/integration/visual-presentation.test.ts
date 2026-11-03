import { describe, expect, it } from 'vitest';
import { CAST_SCALE_FACTORS, STARTER_DEFINITIONS, castPresence } from '../../games/zoo-sprint/src/character-definitions';
import { computeHeroFit } from '../../games/zoo-sprint/src/character-assets';
import { frameFor, resultsLayout, runLayout, selectLayout, type Rect } from '../../games/zoo-sprint/src/presentation/layout';
import { BUDDY_PROFILES, GUIDE_LINE } from '../../games/zoo-sprint/src/presentation/traits';
import { STARTERS } from '../../games/zoo-sprint/src/roster';

/** Phone portrait and landscape, tablet and desktop, including the small and short ones. */
const VIEWPORTS: Array<[number, number]> = [
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [844, 390],
  [667, 375],
  [820, 1180],
  [1180, 820],
  [1280, 800],
  [1920, 1080],
];

const inside = (r: Rect, w: number, h: number): boolean => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

describe('visual presentation: responsive layout rules', () => {
  it('chooses a composition from the shape of the screen, not just its size', () => {
    expect(frameFor(390, 844).composition).toBe('stack');
    expect(frameFor(820, 1180).composition).toBe('stack');
    expect(frameFor(844, 390).composition).toBe('split');
    expect(frameFor(1280, 800).composition).toBe('split');
  });

  it.each(VIEWPORTS)('Character Select %ix%i: everything fits, nothing overlaps, targets are tappable', (w, h) => {
    const L = selectLayout(w, h);
    const all: Rect[] = [L.title, L.guide, L.stage, L.cta, ...L.medallions.map((m) => ({ x: m.cx - m.d / 2, y: m.cy - m.d / 2, w: m.d, h: m.d }))];
    for (const r of all) expect(inside(r, w, h), JSON.stringify(r)).toBe(true);
    expect(L.medallions).toHaveLength(5);
    for (const m of L.medallions) expect(m.d).toBeGreaterThanOrEqual(52 - 0.5);
    expect(L.cta.h).toBeGreaterThanOrEqual(56 - 0.5);
    expect(inside(L.charBox, w, h)).toBe(true);
    expect(L.stage.h).toBeGreaterThan(h * 0.3);
    expect(overlaps(L.stage, L.cta)).toBe(false);
    const dots = L.medallions.map((m) => ({ x: m.cx - m.d / 2, y: m.cy - m.d / 2, w: m.d, h: m.d }));
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) expect(overlaps(dots[i] as Rect, dots[j] as Rect)).toBe(false);
  });

  it.each(VIEWPORTS)('Gameplay %ix%i: HUD, card, feedback and four answers fit with 44px+ targets', (w, h) => {
    const L = runLayout(w, h);
    for (const r of [L.hud, L.route, L.card, L.feedback, ...L.answers]) expect(inside(r, w, h), JSON.stringify(r)).toBe(true);
    expect(L.answers).toHaveLength(4);
    for (const a of L.answers) {
      expect(a.w).toBeGreaterThanOrEqual(44);
      expect(a.h).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(overlaps(L.answers[i] as Rect, L.answers[j] as Rect)).toBe(false);
    expect(overlaps(L.card, L.answers[0] as Rect)).toBe(false);
    expect(L.buddyBox.w).toBeGreaterThan(0);
    expect(L.buddyBox.h).toBeGreaterThanOrEqual(60);
  });

  it.each(VIEWPORTS)('Results %ix%i: banner, summary, button and the buddy box fit', (w, h) => {
    const L = resultsLayout(w, h);
    for (const r of [L.banner, L.panel, L.cta]) expect(inside(r, w, h), JSON.stringify(r)).toBe(true);
    expect(L.cta.h).toBeGreaterThanOrEqual(56 - 0.5);
    expect(overlaps(L.panel, L.cta)).toBe(false);
    expect(L.buddyBox.h).toBeGreaterThanOrEqual(40);
  });
});

describe('visual presentation: sizing characters to the space', () => {
  it('fits every starter in a hero box at one uniform scale, with the flat crop below the box', () => {
    for (const starter of STARTERS) {
      const fit = computeHeroFit(starter.id, { width: 320, height: 360 }, { overlap: 20 });
      expect(fit, starter.id).toBeDefined();
      if (!fit) continue;
      expect(fit.scale).toBeGreaterThan(0);
      expect(fit.cutY).toBe(380);
      expect(fit.topY).toBeGreaterThanOrEqual(-1);
    }
  });

  it('keeps the cast scale relationships: Eagle largest, Tarsier smallest, others between', () => {
    const order = ['eagle', 'bronco', 'dino', 'koala', 'tarsier'] as const;
    const presence = order.map((id) => castPresence(id));
    for (let i = 1; i < presence.length; i++) expect(presence[i] as number).toBeLessThanOrEqual(presence[i - 1] as number);
    expect(castPresence('eagle')).toBe(1);
    expect(CAST_SCALE_FACTORS.tarsier).toBeCloseTo(0.57, 2);
    // presence compresses, but never inverts, the relationships
    expect(castPresence('tarsier')).toBeGreaterThan(CAST_SCALE_FACTORS.tarsier);
  });
});

describe('visual presentation: buddy profiles', () => {
  it('has exactly the five selectable starters, each with exactly three traits, and no host', () => {
    expect(Object.keys(BUDDY_PROFILES).sort()).toEqual(STARTER_DEFINITIONS.map((d) => d.id).sort());
    for (const profile of Object.values(BUDDY_PROFILES)) {
      expect(profile.traits).toHaveLength(3);
      for (const trait of profile.traits) expect(trait.word.length).toBeLessThanOrEqual(12);
    }
    expect(Object.keys(BUDDY_PROFILES)).not.toContain('click');
    expect(GUIDE_LINE).toBe('Pick a buddy to start your adventure!');
  });
});
