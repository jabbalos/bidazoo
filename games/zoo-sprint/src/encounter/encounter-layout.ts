import { bottomOf, clampNumber, frameFor, rightOf, type Frame, type Rect } from '../presentation/layout';

/**
 * Layout rules for the encounter overlay (item A2; the tile rules also serve A9). Pure numbers in,
 * rectangles out: no Phaser, so the rules are unit-tested over real viewports
 * (tests/integration/encounter-layout.test.ts).
 *
 *   - 'stack' (portrait): status bar, timer, the face-off (buddy left, challenger right, charge meter
 *     under the buddy), the question card, the feedback line, the answer tiles at the bottom.
 *   - 'split' (landscape): the face-off fills the left column; the status bar, timer, card,
 *     feedback and tiles stack on the right.
 *
 * Tiles: 4 choices are a 2 x 2 grid; 3 number choices are one row; text choices (A9) are one tile per
 * row, full width, so a longer word is never squeezed. Every tile is at least 44 px each way.
 */

export interface EncounterLayout {
  frame: Frame;
  /** The status bar: hearts on the left, the challenger's strike pips on the right. */
  bar: Rect;
  hearts: Rect;
  pips: Rect;
  /** The question timer bar (display only). */
  timer: Rect;
  /** The face-off area. */
  stage: Rect;
  buddyBox: Rect;
  challengerBox: Rect;
  /** The charge meter, under the buddy. */
  meter: Rect;
  card: Rect;
  feedback: Rect;
  tiles: Rect[];
  /** Where the special-move and end banners are drawn (over the face-off). */
  banner: Rect;
}

export interface TileSpec {
  /** 3 or 4. */
  count: number;
  /** Text choices (PublicQuestion.kind 'text'); absent or 'number' means numbers. */
  kind?: 'number' | 'text';
}

export const MIN_TILE = 44;

/** Space the tiles take for `spec` in a column of width `w` (height only). */
function tilesHeight(spec: TileSpec, w: number, rowH: number, gap: number): number {
  const rows = tileRows(spec, w, gap);
  return rows * rowH + (rows - 1) * gap;
}

function tileRows(spec: TileSpec, w: number, gap: number): number {
  const count = clampNumber(Math.round(spec.count), 1, 4);
  if (spec.kind === 'text') return count;
  if (count === 4) return 2;
  // three numbers side by side when each still gets a comfortable tile, otherwise one per row
  return (w - gap * (count - 1)) / count >= 88 ? 1 : count;
}

/** The tile rectangles for `spec` inside `area` (top-left anchored, rows of equal height). */
export function layoutTiles(spec: TileSpec, area: Rect, gap: number): Rect[] {
  const count = clampNumber(Math.round(spec.count), 1, 4);
  const rows = tileRows(spec, area.w, gap);
  const cols = Math.ceil(count / rows);
  const tw = (area.w - gap * (cols - 1)) / cols;
  const th = (area.h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: area.x + (i % cols) * (tw + gap),
    y: area.y + Math.floor(i / cols) * (th + gap),
    w: tw,
    h: th,
  }));
}

export function encounterLayout(w: number, h: number, spec: TileSpec, kind: 'node' | 'boss' = 'node'): EncounterLayout {
  const frame = frameFor(w, h);
  return frame.composition === 'stack' ? stack(frame, spec, kind) : split(frame, spec, kind);
}

/** The status bar and the timer under it, across `x0 .. x0 + cw` from `top`. */
function statusBar(x0: number, cw: number, top: number, barH: number, timerH: number): { bar: Rect; hearts: Rect; pips: Rect; timer: Rect } {
  const bar: Rect = { x: x0, y: top, w: cw, h: barH };
  const hearts: Rect = { x: x0 + 8, y: top + 4, w: Math.min(cw * 0.42, barH * 3.4), h: barH - 8 };
  const pipsW = Math.min(cw * 0.46, barH * 4.6);
  const pips: Rect = { x: rightOf(bar) - 8 - pipsW, y: top + 4, w: pipsW, h: barH - 8 };
  const timer: Rect = { x: x0 + 4, y: bottomOf(bar) + 6, w: cw - 8, h: timerH };
  return { bar, hearts, pips, timer };
}

/** Buddy, challenger and meter inside the face-off area. The boss gets the wider share. */
function faceOff(stage: Rect, kind: 'node' | 'boss', meterH: number): { buddyBox: Rect; challengerBox: Rect; meter: Rect; banner: Rect } {
  const challengerShare = kind === 'boss' ? 0.56 : 0.5;
  const buddyW = stage.w * 0.46;
  const meter: Rect = { x: stage.x + buddyW * 0.1, y: bottomOf(stage) - meterH, w: buddyW * 0.8, h: meterH };
  const buddyBox: Rect = { x: stage.x, y: stage.y, w: buddyW, h: Math.max(40, meter.y - 6 - stage.y) };
  const cw = stage.w * challengerShare;
  const challengerBox: Rect = { x: rightOf(stage) - cw, y: stage.y, w: cw, h: stage.h };
  const bannerH = clampNumber(Math.round(stage.h * 0.22), 44, 90);
  const banner: Rect = { x: stage.x + stage.w * 0.06, y: stage.y + stage.h * 0.36 - bannerH / 2, w: stage.w * 0.88, h: bannerH };
  return { buddyBox, challengerBox, meter, banner };
}

function stack(frame: Frame, spec: TileSpec, kind: 'node' | 'boss'): EncounterLayout {
  const { w, h, pad } = frame;
  const cw = Math.min(w - pad * 2, frame.form === 'phone' ? 520 : 640);
  const x0 = (w - cw) / 2;
  const barH = clampNumber(Math.round(h * 0.06), 40, 56);
  const timerH = clampNumber(Math.round(h * 0.014), 8, 12);
  const status = statusBar(x0, cw, Math.round(pad * 0.8), barH, timerH);

  const gap = clampNumber(Math.round(pad * 0.7), 8, 14);
  const rowH = spec.kind === 'text' ? clampNumber(Math.round(h * 0.068), 48, 72) : clampNumber(Math.round(h * 0.09), 56, 100);
  const tilesH = tilesHeight(spec, cw, rowH, gap);
  const tilesArea: Rect = { x: x0, y: h - pad - tilesH, w: cw, h: tilesH };
  const fbH = clampNumber(Math.round(h * 0.048), 30, 44);
  const feedback: Rect = { x: x0, y: tilesArea.y - 6 - fbH, w: cw, h: fbH };
  const qH = clampNumber(Math.round(h * 0.1), 60, 140);
  const card: Rect = { x: x0, y: feedback.y - 6 - qH, w: cw, h: qH };

  const stageTop = bottomOf(status.timer) + 8;
  const stage: Rect = { x: x0, y: stageTop, w: cw, h: Math.max(90, card.y - 8 - stageTop) };
  const meterH = clampNumber(Math.round(stage.h * 0.08), 16, 26);
  return { frame, ...status, stage, ...faceOff(stage, kind, meterH), card, feedback, tiles: layoutTiles(spec, tilesArea, gap) };
}

function split(frame: Frame, spec: TileSpec, kind: 'node' | 'boss'): EncounterLayout {
  const { w, h, pad } = frame;
  const cw = Math.min(w - pad * 2, 1240);
  const x0 = (w - cw) / 2;
  const colGap = Math.round(pad * 1.4);
  const leftW = clampNumber(Math.round(cw * 0.5), 260, 640);
  const stage: Rect = { x: x0, y: pad, w: leftW, h: h - pad * 2 };
  const rx = rightOf(stage) + colGap;
  const rw = x0 + cw - rx;

  const barH = clampNumber(Math.round(h * 0.1), 40, 60);
  const timerH = clampNumber(Math.round(h * 0.022), 8, 14);
  const status = statusBar(rx, rw, pad, barH, timerH);

  const gap = clampNumber(Math.round(pad * 0.8), 8, 18);
  const rowH = spec.kind === 'text' ? clampNumber(Math.round(h * 0.1), 46, 76) : clampNumber(Math.round(h * 0.15), 52, 116);
  let tilesH = tilesHeight(spec, rw, rowH, gap);
  // a short landscape phone: text rows shrink toward the 44 px floor before anything overflows
  const fbH = clampNumber(Math.round(h * 0.08), 28, 48);
  const minCard = 56;
  const room = h - pad - (bottomOf(status.timer) + 8) - minCard - 12 - fbH;
  if (tilesH > room) {
    const rows = tileRows(spec, rw, gap);
    const fitted = Math.max(MIN_TILE, Math.floor((room - gap * (rows - 1)) / rows));
    tilesH = rows * fitted + (rows - 1) * gap;
  }
  const tilesArea: Rect = { x: rx, y: h - pad - tilesH, w: rw, h: tilesH };
  const feedback: Rect = { x: rx, y: tilesArea.y - 6 - fbH, w: rw, h: fbH };
  const cardTop = bottomOf(status.timer) + 8;
  const card: Rect = { x: rx, y: cardTop, w: rw, h: Math.max(minCard, feedback.y - 6 - cardTop) };

  const meterH = clampNumber(Math.round(stage.h * 0.06), 16, 28);
  return { frame, ...status, stage, ...faceOff(stage, kind, meterH), card, feedback, tiles: layoutTiles(spec, tilesArea, gap) };
}
