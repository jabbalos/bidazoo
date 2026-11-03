export const COLORS = {
  jungle: 0x0f3d2e,
  jungleDeep: 0x0a2c20,
  leaf: 0x1f6f4a,
  leafLight: 0x2f9566,
  sun: 0xffc83d,
  sunDeep: 0xe0a21a,
  sky: 0x2c8fb8,
  good: 0x2fbf71,
  goodDeep: 0x1d8f52,
  bad: 0xf08a3c,
  badDeep: 0xc4631c,
  card: 0xfff7e0,
  cardShade: 0xe9dcb4,
  ink: 0x14342a,
} as const;

export const CSS = {
  cream: '#fff7e0',
  mist: '#b8e0c8',
  ink: '#14342a',
  sun: '#ffc83d',
  good: '#7dffb0',
  bad: '#ffb36b',
  white: '#ffffff',
} as const;

/**
 * World Expedition tokens (docs/visual/09-palette.md section 2 plus the approved sheet-08 look).
 * Orange is the primary accent, blue and teal are secondary. Every hex here is PROVISIONAL, like the
 * rest of the palette doc, until the owner locks production values. Presentation only.
 */
export const EXP = {
  // sky and distance (soft focus, warm morning light)
  skyTop: 0x7cc8ee,
  skyMid: 0xbfe7f7,
  skyLow: 0xfff0cf,
  sun: 0xfff2b8,
  mountainFar: 0xa7cfe0,
  mountainNear: 0x84b9c2,
  // rice terraces
  terraceDark: 0x4f9f57,
  terraceMid: 0x6dbb62,
  terraceLight: 0x93d075,
  paddy: 0xa9dfe3,
  paddyDeep: 0x7fc6d2,
  // framing foliage, timber, brass
  foliage: 0x1d6a48,
  foliageDeep: 0x134c37,
  timber: 0x8a5a2b,
  timberDeep: 0x5e3a1a,
  timberLight: 0xb27b3f,
  brass: 0xe0a936,
  brassDeep: 0xa8741f,
  lantern: 0xffa63a,
  lanternGlow: 0xffd27a,
  // surfaces
  parchment: 0xfdf3d6,
  parchmentShade: 0xeedcae,
  parchmentEdge: 0xcfae6a,
  navy: 0x1e3a5f,
  navyDeep: 0x142a47,
  ink: 0x1a2b3d,
  // accents
  orange: 0xdc5a08,
  orangeTop: 0xf57a1c,
  orangeDeep: 0xa94204,
  blue: 0x2478c8,
  blueTop: 0x4b9ae6,
  blueDeep: 0x174f93,
  teal: 0x16b3a6,
  tealTop: 0x4fd6c8,
  tealDeep: 0x0d7c73,
  green: 0x1f9a52,
  greenTop: 0x3fbb73,
  greenDeep: 0x136d3a,
  amber: 0xf59a2c,
  amberTop: 0xffbf5e,
  amberDeep: 0xc4660f,
  dim: 0xd7d0b9,
  dimDeep: 0xb5ad92,
} as const;

export const EXP_CSS = {
  navy: '#1e3a5f',
  ink: '#1a2b3d',
  white: '#ffffff',
  parchment: '#fdf3d6',
  brass: '#e0a936',
  brassDeep: '#7a4f12',
  orangeDeep: '#8a3a05',
  tealDeep: '#0d5c56',
  greenDeep: '#14653a',
  amberDeep: '#8a4708',
  muted: '#4a5d73',
} as const;

/**
 * Nunito Sans (locked World Expedition family) is supplied by the page (apps/play/src/styles.css).
 * If it has not loaded, the system stack keeps the game readable.
 */
export const FONT = '"Nunito Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear blend of two 0xRRGGBB colors. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
