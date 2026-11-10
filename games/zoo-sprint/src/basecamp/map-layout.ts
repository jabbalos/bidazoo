/**
 * Map board layout: where the panel and the seven tiles go for a view. Pure numbers. Every tile is
 * at least 48 px on both sides (the tap floor) on any view down to 320 x 480.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapBoardLayout {
  panel: Rect;
  title: Rect;
  tiles: Rect[];
  close: Rect;
  cols: number;
  rows: number;
}

export const TAP_FLOOR = 48;

export function mapBoardLayout(viewW: number, viewH: number, count: number): MapBoardLayout {
  const portrait = viewW < viewH;
  const margin = Math.round(Math.min(viewW, viewH) * 0.03);
  const panel: Rect = { x: margin, y: margin, w: viewW - margin * 2, h: viewH - margin * 2 };
  const pad = Math.round(Math.min(panel.w, panel.h) * 0.04);
  const titleH = Math.max(TAP_FLOOR, Math.round(Math.min(panel.w, panel.h) * 0.11));
  const close: Rect = { x: panel.x + panel.w - pad - TAP_FLOOR, y: panel.y + pad, w: TAP_FLOOR, h: TAP_FLOOR };
  const title: Rect = { x: panel.x + pad, y: panel.y + pad, w: panel.w - pad * 3 - TAP_FLOOR, h: titleH };
  const cols = portrait ? 2 : 4;
  const rows = Math.ceil(count / cols);
  const gap = Math.max(8, Math.round(pad * 0.6));
  const top = title.y + title.h + gap;
  const areaW = panel.w - pad * 2;
  const areaH = panel.y + panel.h - pad - top;
  const tw = Math.floor((areaW - gap * (cols - 1)) / cols);
  const th = Math.max(TAP_FLOOR, Math.floor((areaH - gap * (rows - 1)) / rows));
  const tiles: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // the last row is centered when it is not full
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const rowW = inRow * tw + (inRow - 1) * gap;
    const x0 = panel.x + pad + Math.round((areaW - rowW) / 2);
    tiles.push({ x: x0 + c * (tw + gap), y: top + r * (th + gap), w: tw, h: th });
  }
  return { panel, title, tiles, close, cols, rows };
}
