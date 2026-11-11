/**
 * Outfitter layout: where the panel, the header, the coin pill, Close, the message line and every
 * item card go for a view. Pure numbers, so the tap floor can be proven for every viewport.
 *
 * Portrait (and any view with room): one row per slot, the slot's cards side by side. A short
 * landscape phone (640 x 360) cannot fit three such rows above the tap floor, so the slots stand
 * side by side as columns instead, each a two-by-two block of cards. Whichever arrangement keeps
 * every card at least TAP_FLOOR px on both sides wins; rows are preferred when both do.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotBlock {
  /** Top-left corner and height of the slot label. */
  label: { x: number; y: number; h: number };
  cards: Rect[];
}

export type OutfitterArrangement = 'rows' | 'columns';

export interface OutfitterLayout {
  panel: Rect;
  pad: number;
  headerH: number;
  title: { x: number; y: number; size: number };
  coinPill: Rect;
  close: Rect;
  /** The message line under the grid (its centre is the text position). */
  message: Rect;
  /** The area the cards share; the loading text is centred in it. */
  grid: Rect;
  blocks: SlotBlock[];
  arrangement: OutfitterArrangement;
}

export const TAP_FLOOR = 48;

function arrange(grid: Rect, pad: number, gap: number, counts: number[], arrangement: OutfitterArrangement): SlotBlock[] {
  const n = Math.max(1, counts.length);
  if (arrangement === 'rows') {
    const rowH = grid.h / n;
    const labelH = Math.min(26, rowH * 0.2);
    return counts.map((count, ri) => {
      const top = grid.y + ri * rowH;
      const cols = Math.max(1, count);
      const cardW = (grid.w - gap * (cols - 1)) / cols;
      const cardH = rowH - labelH - gap;
      const cards: Rect[] = [];
      for (let ci = 0; ci < count; ci++) cards.push({ x: grid.x + ci * (cardW + gap), y: top + labelH + gap * 0.5, w: cardW, h: cardH });
      return { label: { x: grid.x, y: top, h: labelH }, cards };
    });
  }
  const colW = (grid.w - gap * (n - 1)) / n;
  const labelH = Math.min(26, grid.h * 0.12);
  return counts.map((count, bi) => {
    const left = grid.x + bi * (colW + gap);
    const perRow = 2;
    const rows = Math.max(1, Math.ceil(count / perRow));
    const cardW = (colW - gap * (perRow - 1)) / perRow;
    const top = grid.y + labelH + gap * 0.5;
    const cardH = (grid.y + grid.h - top - gap * (rows - 1)) / rows;
    const cards: Rect[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      cards.push({ x: left + c * (cardW + gap), y: top + r * (cardH + gap), w: cardW, h: cardH });
    }
    return { label: { x: left, y: grid.y, h: labelH }, cards };
  });
}

function smallestSide(blocks: SlotBlock[]): number {
  let m = Infinity;
  for (const b of blocks) for (const c of b.cards) m = Math.min(m, c.w, c.h);
  return m;
}

/** `counts` is the number of items per slot, in slot order (empty slots are left out by the caller). */
export function outfitterLayout(viewW: number, viewH: number, counts: number[]): OutfitterLayout {
  const pw = Math.min(viewW - 32, 760);
  const ph = Math.min(viewH - 32, 660);
  const px = (viewW - pw) / 2;
  const py = (viewH - ph) / 2;
  const panel: Rect = { x: px, y: py, w: pw, h: ph };
  const pad = Math.max(12, pw * 0.035);
  const headerH = Math.max(44, ph * 0.11);
  const title = { x: px + pad, y: py + pad + headerH / 2, size: Math.round(headerH * 0.55) };
  const pillW = Math.max(90, headerH * 2.3);
  const coinPill: Rect = { x: px + pw - pad - pillW, y: py + pad + headerH * 0.15, w: pillW, h: headerH * 0.7 };
  const closeH = Math.max(44, ph * 0.09);
  const closeW = Math.min(220, pw * 0.4);
  const close: Rect = { x: px + (pw - closeW) / 2, y: py + ph - pad - closeH, w: closeW, h: closeH };
  const messageH = Math.max(22, ph * 0.05);
  const gridTop = py + pad + headerH + pad * 0.5;
  const gridBottom = py + ph - pad - closeH - messageH - pad * 0.5;
  const grid: Rect = { x: px + pad, y: gridTop, w: pw - pad * 2, h: Math.max(0, gridBottom - gridTop) };
  const message: Rect = { x: px + pad, y: gridBottom + pad * 0.25, w: pw - pad * 2, h: messageH };
  const gap = Math.max(6, pw * 0.015);

  const rows = arrange(grid, pad, gap, counts, 'rows');
  const rowsOk = smallestSide(rows) >= TAP_FLOOR;
  let arrangement: OutfitterArrangement = 'rows';
  let blocks = rows;
  if (!rowsOk) {
    const columns = arrange(grid, pad, gap, counts, 'columns');
    if (smallestSide(columns) > smallestSide(rows)) {
      arrangement = 'columns';
      blocks = columns;
    }
  }
  return { panel, pad, headerH, title, coinPill, close, message, grid, blocks, arrangement };
}
