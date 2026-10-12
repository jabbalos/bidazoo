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

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
