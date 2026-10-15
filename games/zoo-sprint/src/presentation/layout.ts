/**
 * Responsive layout RULES for the World Expedition screens. Pure numbers in, rectangles out: no
 * Phaser, no network, no storage, so every rule is unit-tested across a matrix of real viewports
 * (tests/integration/presentation-layout.test.ts).
 *
 * Two compositions, chosen from the shape of the screen rather than a device list:
 *   - 'stack': portrait. One column; the hero (or the gameplay buddy) gets the tall middle.
 *   - 'split': landscape (phone on its side, tablet, desktop). The hero gets its own column on the
 *              left and the controls stack on the right.
 * Phones are NOT handled by shrinking the desktop layout: sizes come from the space that is left
 * after the fixed-height pieces (title, medallions, CTA, answer buttons) are placed, so the hero
 * and the buddy always receive whatever the screen can spare.
 *
 * Presentation only. Nothing here knows about questions, answers, XP, coins or progress rules.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FormFactor = 'phone' | 'tablet' | 'desktop';
export type Composition = 'stack' | 'split';

export interface Frame {
  readonly w: number;
  readonly h: number;
  readonly form: FormFactor;
  readonly composition: Composition;
  /** Outer margin. */
  readonly pad: number;
  /** A soft type-size unit (1 = a 390 x 700 phone). Sizes also respect the real space left. */
  readonly u: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const bottomOf = (r: Rect): number => r.y + r.h;
export const rightOf = (r: Rect): number => r.x + r.w;
export const centerX = (r: Rect): number => r.x + r.w / 2;
export const centerY = (r: Rect): number => r.y + r.h / 2;

export function inset(r: Rect, dx: number, dy: number = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, w: Math.max(0, r.w - dx * 2), h: Math.max(0, r.h - dy * 2) };
}

export function frameFor(w: number, h: number): Frame {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const form: FormFactor = short < 600 ? 'phone' : short < 900 && long < 1400 ? 'tablet' : 'desktop';
  const composition: Composition = w >= h * 1.15 ? 'split' : 'stack';
  const pad = clampNumber(Math.round(short * 0.035), 12, 32);
  const u = clampNumber(Math.min(w / 390, h / 700), 0.8, 1.6);
  return { w, h, form, composition, pad, u };
}

/** The widest single column used in the stacked composition. */
function stackWidth(frame: Frame): number {
  const max = frame.form === 'phone' ? 520 : frame.form === 'tablet' ? 640 : 560;
  return Math.min(frame.w - frame.pad * 2, max);
}

/** The widest whole composition used in the split composition. */
function splitWidth(frame: Frame): number {
  return Math.min(frame.w - frame.pad * 2, 1240);
}

// ---------------------------------------------------------------------------
// Character select ("Choose Your Buddy")
// ---------------------------------------------------------------------------

export interface MedallionSlot {
  cx: number;
  cy: number;
  /** Diameter of the circle (the ring and the selection halo are drawn outside it). */
  d: number;
}

export interface SelectLayout {
  frame: Frame;
  title: Rect;
  titleSize: number;
  /** Click, the host, with the line "Pick a buddy to start your adventure!". */
  guide: Rect;
  guideAvatar: number;
  /** The tall rounded hero card. */
  stage: Rect;
  /** The parchment name plate inside the bottom of the stage: name, role and the three traits. */
  plaque: Rect;
  nameSize: number;
  roleSize: number;
  chipH: number;
  chipSize: number;
  /** Where the character may be drawn: the stage above the plaque (its flat crop hides behind the plaque). */
  charBox: Rect;
  medallionRow: Rect;
  medallions: MedallionSlot[];
  cta: Rect;
}

export function selectLayout(w: number, h: number): SelectLayout {
  const frame = frameFor(w, h);
  return frame.composition === 'stack' ? selectStack(frame) : selectSplit(frame);
}

function medallionSlots(row: Rect, count: number, gap: number, d: number): MedallionSlot[] {
  const total = count * d + (count - 1) * gap;
  const x0 = row.x + (row.w - total) / 2;
  return Array.from({ length: count }, (_, i) => ({ cx: x0 + d / 2 + i * (d + gap), cy: centerY(row), d }));
}

/** Name plate geometry shared by both compositions. */
function plaqueFor(stage: Rect): { plaque: Rect; nameSize: number; roleSize: number; chipH: number; chipSize: number } {
  const nameSize = clampNumber(Math.round(stage.w * 0.072), 20, 34);
  const roleSize = clampNumber(Math.round(nameSize * 0.46), 11, 16);
  const chipH = clampNumber(Math.round(stage.w * 0.072), 24, 34);
  const chipSize = clampNumber(Math.round(chipH * 0.48), 12, 17);
  const plaqueH = Math.round(nameSize * 1.1 + roleSize * 1.15 + chipH + 20);
  const margin = clampNumber(Math.round(stage.w * 0.03), 8, 14);
  const plaque: Rect = { x: stage.x + margin, y: bottomOf(stage) - margin - plaqueH, w: stage.w - margin * 2, h: plaqueH };
  return { plaque, nameSize, roleSize, chipH, chipSize };
}

function selectStack(frame: Frame): SelectLayout {
  const { w, h, pad } = frame;
  const cw = stackWidth(frame);
  const x0 = (w - cw) / 2;
  const gap = clampNumber(Math.round(h * 0.01), 5, 10);

  let titleSize = clampNumber(Math.round(cw * 0.084), 26, 48);
  let guideD = clampNumber(Math.round(cw * 0.118), 40, 72);
  const ctaH = clampNumber(Math.round(h * 0.074), 56, 76);
  // Breathing room: slightly smaller medallions with real gaps between them, a taller row so the
  // selected one's halo has space, and a clear gap before the button.
  const medGap = clampNumber(Math.round(cw * 0.04), 8, 22);
  const medD = clampNumber(Math.floor((cw - 4 * medGap) / 5), 52, 88);
  const medRowH = medD + 26;
  const ctaGap = clampNumber(Math.round(h * 0.014), 8, 16);

  const build = () => {
    const title: Rect = { x: x0, y: Math.round(pad * 0.7), w: cw, h: Math.round(titleSize * 1.1) };
    const guide: Rect = { x: x0, y: bottomOf(title) + 2, w: cw, h: guideD };
    const cta: Rect = { x: x0, y: h - pad - ctaH, w: cw, h: ctaH };
    let medallionRow: Rect = { x: x0, y: cta.y - ctaGap - medRowH, w: cw, h: medRowH };
    let stageTop = bottomOf(guide) + gap;
    let stageH = medallionRow.y - gap - stageTop;
    // Balanced, not stretched: the hero card never grows past a tall portrait card; spare height
    // becomes breathing room around it (above the card, and between the medallions and the button).
    const maxStageH = Math.round(cw * 1.3);
    if (stageH > maxStageH) {
      const excess = stageH - maxStageH;
      stageH = maxStageH;
      stageTop += Math.round(excess * 0.3);
      medallionRow = { ...medallionRow, y: medallionRow.y - Math.round(excess * 0.3) };
    }
    const stage: Rect = { x: x0, y: stageTop, w: cw, h: stageH };
    return { title, guide, cta, medallionRow, stage };
  };
  let parts = build();
  // A very short screen: tighten the header before the hero loses its space.
  if (parts.stage.h < 250) {
    titleSize = Math.max(26, Math.round(titleSize * 0.85));
    guideD = Math.max(44, Math.round(guideD * 0.8));
    parts = build();
  }
  const { plaque, nameSize, roleSize, chipH, chipSize } = plaqueFor(parts.stage);
  const charTop = parts.stage.y + 6;
  const charBox: Rect = { x: parts.stage.x, y: charTop, w: parts.stage.w, h: Math.max(60, plaque.y - charTop) };
  return {
    frame,
    title: parts.title,
    titleSize,
    guide: parts.guide,
    guideAvatar: guideD,
    stage: parts.stage,
    plaque,
    nameSize,
    roleSize,
    chipH,
    chipSize,
    charBox,
    medallionRow: parts.medallionRow,
    medallions: medallionSlots(parts.medallionRow, 5, medGap, medD),
    cta: parts.cta,
  };
}

function selectSplit(frame: Frame): SelectLayout {
  const { w, h, pad } = frame;
  const cw = splitWidth(frame);
  const x0 = (w - cw) / 2;
  const colGap = Math.round(pad * 1.6);
  const stageW = clampNumber(Math.round(cw * 0.46), 250, 600);
  const stage: Rect = { x: x0, y: pad, w: stageW, h: h - pad * 2 };
  const rx = rightOf(stage) + colGap;
  const rw = x0 + cw - rx;
  const gap = clampNumber(Math.round(h * 0.022), 6, 16);

  const roomy = frame.form !== 'phone'; // desktop and landscape tablets get a deliberate, centered column
  const titleSize = clampNumber(Math.round(Math.min(rw * 0.1, h * 0.1)), 26, roomy ? 60 : 56);
  const guideD = clampNumber(Math.round(Math.min(rw * 0.14, h * 0.16)), 44, 84);
  const ctaH = roomy ? clampNumber(Math.round(h * 0.09), 56, 68) : clampNumber(Math.round(h * 0.13), 56, 84);
  const medGap = clampNumber(Math.round(rw * 0.025), 6, 16);
  const medD = clampNumber(Math.floor((rw - 4 * medGap) / 5), 52, roomy ? 116 : 100);
  const medRowH = medD + (roomy ? 22 : 14);

  const title: Rect = { x: rx, y: pad, w: rw, h: Math.round(titleSize * 1.2) };
  let guide: Rect = { x: rx, y: bottomOf(title) + gap, w: rw, h: guideD };
  let cta: Rect = { x: rx, y: h - pad - ctaH, w: rw, h: ctaH };
  // The medallions sit in the free band between the guide and the CTA, centered vertically.
  const bandTop = bottomOf(guide) + gap;
  const bandBottom = cta.y - gap;
  let medallionRow: Rect = { x: rx, y: bandTop + Math.max(0, (bandBottom - bandTop - medRowH) / 2), w: rw, h: medRowH };
  if (roomy) {
    // One column with one rhythm: title, guide, medallions and CTA share the same gap and the whole
    // group is centered against the hero card, so the right side reads as a menu beside the card.
    const rhythm = clampNumber(Math.round(h * 0.04), 16, 36);
    const groupH = title.h + guide.h + medRowH + ctaH + rhythm * 3;
    const top = stage.y + Math.max(0, Math.round((stage.h - groupH) * 0.45));
    title.y = top;
    guide = { ...guide, y: bottomOf(title) + rhythm * 0.6 };
    medallionRow = { x: rx, y: bottomOf(guide) + rhythm * 1.4, w: rw, h: medRowH };
    cta = { x: rx, y: bottomOf(medallionRow) + rhythm, w: rw, h: ctaH };
  }

  const { plaque, nameSize, roleSize, chipH, chipSize } = plaqueFor(stage);
  const charTop = stage.y + 6;
  const charBox: Rect = { x: stage.x, y: charTop, w: stage.w, h: Math.max(60, plaque.y - charTop) };
  return {
    frame,
    title,
    titleSize,
    guide,
    guideAvatar: guideD,
    stage,
    plaque,
    nameSize,
    roleSize,
    chipH,
    chipSize,
    charBox,
    medallionRow,
    medallions: medallionSlots(medallionRow, 5, medGap, medD),
    cta,
  };
}

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

export interface RunLayout {
  frame: Frame;
  /** The HUD pill: buddy avatar, XP, coins. */
  hud: Rect;
  /** The route of map pins, one per question. */
  route: Rect;
  /** Where the buddy may be drawn; its flat crop hides behind the question card. */
  buddyBox: Rect;
  /** Stack: the sign that says which question this is. */
  sign: Rect;
  card: Rect;
  feedback: Rect;
  answers: Rect[];
  /** Split: the environment panel behind the buddy (the whole left column). Stack: the full screen. */
  scene: Rect;
}

export function runLayout(w: number, h: number): RunLayout {
  const frame = frameFor(w, h);
  return frame.composition === 'stack' ? runStack(frame) : runSplit(frame);
}

function answerGrid(area: Rect, gap: number): Rect[] {
  const bw = (area.w - gap) / 2;
  const bh = (area.h - gap) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: area.x + (i % 2) * (bw + gap), y: area.y + Math.floor(i / 2) * (bh + gap), w: bw, h: bh }));
}

function runStack(frame: Frame): RunLayout {
  const { w, h, pad } = frame;
  const cw = stackWidth(frame);
  const x0 = (w - cw) / 2;
  const hudH = clampNumber(Math.round(h * 0.058), 42, 56);
  const hud: Rect = { x: x0, y: Math.round(pad * 0.8), w: cw, h: hudH };
  const routeH = clampNumber(Math.round(h * 0.034), 22, 30);
  const route: Rect = { x: x0, y: bottomOf(hud) + 4, w: cw, h: routeH };

  const gap = clampNumber(Math.round(pad * 0.7), 8, 14);
  const btnH = clampNumber(Math.round(h * 0.095), 58, 104);
  const answersArea: Rect = { x: x0, y: h - pad - (btnH * 2 + gap), w: cw, h: btnH * 2 + gap };
  const fbH = clampNumber(Math.round(h * 0.05), 32, 46);
  const feedback: Rect = { x: x0, y: answersArea.y - 8 - fbH, w: cw, h: fbH };
  const qH = clampNumber(Math.round(h * 0.118), 80, 160);
  const card: Rect = { x: x0, y: feedback.y - 6 - qH, w: cw, h: qH };

  // The buddy gets the space between the route and the card, but is capped so it stays a companion
  // standing at the card, not a giant head; any extra room stays above it as open scenery.
  const buddyTop = bottomOf(route) + 4;
  const avail = Math.max(80, card.y - buddyTop);
  const buddyH = Math.min(avail, Math.round(cw * 1.0));
  const buddyBox: Rect = { x: x0, y: card.y - buddyH, w: cw, h: buddyH };
  const signW = clampNumber(Math.round(cw * 0.4), 124, 210);
  const signH = clampNumber(Math.round(signW * 0.26), 32, 46);
  // A tab straddling the card's top edge, so it labels the card instead of sitting on the buddy's face.
  const sign: Rect = { x: x0 + cw - signW - 14, y: card.y - Math.round(signH * 0.62), w: signW, h: signH };

  return { frame, hud, route, buddyBox, sign, card, feedback, answers: answerGrid(answersArea, gap), scene: { x: 0, y: 0, w, h } };
}

function runSplit(frame: Frame): RunLayout {
  const { w, h, pad } = frame;
  const cw = splitWidth(frame);
  const x0 = (w - cw) / 2;
  const colGap = Math.round(pad * 1.6);
  const leftW = clampNumber(Math.round(cw * 0.4), 240, 520);
  const scene: Rect = { x: x0, y: pad, w: leftW, h: h - pad * 2 };
  const rx = rightOf(scene) + colGap;
  const rw = x0 + cw - rx;

  const hudH = clampNumber(Math.round(h * 0.11), 44, 64);
  const hud: Rect = { x: rx, y: pad, w: rw, h: hudH };
  const routeH = clampNumber(Math.round(h * 0.06), 24, 34);
  const route: Rect = { x: rx, y: bottomOf(hud) + 6, w: rw, h: routeH };

  const gap = clampNumber(Math.round(pad * 0.8), 8, 18);
  const btnH = clampNumber(Math.round(h * 0.17), 56, 120);
  const answersArea: Rect = { x: rx, y: h - pad - (btnH * 2 + gap), w: rw, h: btnH * 2 + gap };
  const fbH = clampNumber(Math.round(h * 0.085), 30, 50);
  const feedback: Rect = { x: rx, y: answersArea.y - 6 - fbH, w: rw, h: fbH };
  const cardTop = bottomOf(route) + 8;
  const card: Rect = { x: rx, y: cardTop, w: rw, h: Math.max(70, feedback.y - 6 - cardTop) };

  // The buddy fills the left scene panel; the flat crop hides behind a ledge drawn at the panel bottom.
  const ledge = clampNumber(Math.round(scene.h * 0.16), 40, 90);
  const buddyBox: Rect = { x: scene.x, y: scene.y + 8, w: scene.w, h: scene.h - ledge - 8 };
  const signW = clampNumber(Math.round(scene.w * 0.56), 120, 210);
  const signH = clampNumber(Math.round(signW * 0.3), 36, 54);
  const sign: Rect = { x: scene.x + scene.w - signW - 12, y: scene.y + 12, w: signW, h: signH };

  return { frame, hud, route, buddyBox, sign, card, feedback, answers: answerGrid(answersArea, gap), scene };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ResultsLayout {
  frame: Frame;
  /** The "Run complete!" ribbon. */
  banner: Rect;
  bannerSize: number;
  /** The summit scene the buddy celebrates on. */
  scene: Rect;
  /** Where the buddy may be drawn; the flat crop hides behind the summit ledge. */
  buddyBox: Rect;
  /** The parchment panel with the run summary. */
  panel: Rect;
  cta: Rect;
}

export function resultsLayout(w: number, h: number): ResultsLayout {
  const frame = frameFor(w, h);
  return frame.composition === 'stack' ? resultsStack(frame) : resultsSplit(frame);
}

function resultsStack(frame: Frame): ResultsLayout {
  const { w, h, pad } = frame;
  const cw = stackWidth(frame);
  const x0 = (w - cw) / 2;
  const gap = clampNumber(Math.round(h * 0.012), 6, 14);
  const bannerSize = clampNumber(Math.round(cw * 0.1), 26, 50);
  const banner: Rect = { x: x0, y: pad, w: cw, h: Math.round(bannerSize * 1.5) };
  const ctaH = clampNumber(Math.round(h * 0.082), 56, 84);
  const cta: Rect = { x: x0, y: h - pad - ctaH, w: cw, h: ctaH };
  const bodyTop = bottomOf(banner) + gap;
  const bodyH = cta.y - gap - bodyTop;
  // The panel needs room for the summary; the buddy gets the rest of the column.
  const panelH = clampNumber(Math.round(bodyH * 0.44), 180, 300);
  const panel: Rect = { x: x0, y: cta.y - gap - panelH, w: cw, h: panelH };
  const scene: Rect = { x: x0, y: bodyTop, w: cw, h: Math.max(100, panel.y - gap - bodyTop) };
  const ledge = clampNumber(Math.round(scene.h * 0.12), 24, 56);
  const buddyBox: Rect = { x: scene.x, y: scene.y + 4, w: scene.w, h: Math.max(60, scene.h - ledge - 4) };
  return { frame, banner, bannerSize, scene, buddyBox, panel, cta };
}

function resultsSplit(frame: Frame): ResultsLayout {
  const { w, h, pad } = frame;
  const cw = splitWidth(frame);
  const x0 = (w - cw) / 2;
  const colGap = Math.round(pad * 1.6);
  const leftW = clampNumber(Math.round(cw * 0.47), 240, 620);
  const scene: Rect = { x: x0, y: pad, w: leftW, h: h - pad * 2 };
  const rx = rightOf(scene) + colGap;
  const rw = x0 + cw - rx;
  const gap = clampNumber(Math.round(h * 0.025), 8, 20);
  const bannerSize = clampNumber(Math.round(Math.min(rw * 0.09, h * 0.1)), 24, 50);
  const bannerH = Math.round(bannerSize * 1.5);
  const ctaH = clampNumber(Math.round(h * 0.09), 56, 72);
  // The summary panel is as tall as its content needs, not as tall as the screen; the banner, panel
  // and Play Again button form one group centered against the summit scene.
  const avail = h - pad * 2 - bannerH - ctaH - gap * 2;
  const panelH = Math.max(120, Math.min(avail, clampNumber(Math.round(h * 0.56), 200, 430)));
  const groupH = bannerH + gap + panelH + gap + ctaH;
  const top = pad + Math.max(0, Math.round((h - pad * 2 - groupH) * 0.5));
  const banner: Rect = { x: rx, y: top, w: rw, h: bannerH };
  const panel: Rect = { x: rx, y: bottomOf(banner) + gap, w: rw, h: panelH };
  const cta: Rect = { x: rx, y: bottomOf(panel) + gap, w: rw, h: ctaH };
  const ledge = clampNumber(Math.round(scene.h * 0.14), 30, 80);
  const buddyBox: Rect = { x: scene.x, y: scene.y + 8, w: scene.w, h: scene.h - ledge - 8 };
  return { frame, banner, bannerSize, scene, buddyBox, panel, cta };
}
