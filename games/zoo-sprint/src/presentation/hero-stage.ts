import Phaser from 'phaser';
import { Character } from '../characters';
import { castPresence, type CastId } from '../character-definitions';
import type { CharacterId } from '../roster';
import { EXP, EXP_CSS } from '../theme';
import { text } from '../ui';
import { bakeEnvironment, type EnvVariant } from './environment';
import { drawGlyph } from './icons';
import { prefersReducedMotion } from './motion';
import { BUDDY_PROFILES } from './traits';
import { parchmentPanel, pill, softShadow, type Box } from './surfaces';

/**
 * Reusable presentation components for the premium hero treatment. Scenes compose these; none of
 * them knows about questions, answers, XP, coins or the server.
 */

/** Applies a rounded-rectangle mask to a container and cleans the mask up with it. */
export function maskRounded(scene: Phaser.Scene, target: Phaser.GameObjects.Container, b: Box, radius: number): void {
  const shape = scene.make.graphics({ x: 0, y: 0 }, false);
  shape.fillStyle(0xffffff, 1);
  shape.fillRoundedRect(b.x, b.y, b.w, b.h, radius);
  target.setMask(shape.createGeometryMask());
  target.once(Phaser.GameObjects.Events.DESTROY, () => shape.destroy());
}

/** Applies a circular mask to a container and cleans the mask up with it. */
export function maskCircle(scene: Phaser.Scene, target: Phaser.GameObjects.Container, cx: number, cy: number, r: number): void {
  const shape = scene.make.graphics({ x: 0, y: 0 }, false);
  shape.fillStyle(0xffffff, 1);
  shape.fillCircle(cx, cy, r);
  target.setMask(shape.createGeometryMask());
  target.once(Phaser.GameObjects.Events.DESTROY, () => shape.destroy());
}

/**
 * Clips a character at a horizontal line (and keeps it inside the given left/right edges). The six
 * expressions are cropped at different heights, so only the earliest crop is guaranteed to sit
 * behind a foreground piece; this makes sure no later (lower) crop can show beneath it.
 */
export function clipBelow(scene: Phaser.Scene, target: Phaser.GameObjects.Container, x: number, width: number, bottomY: number): void {
  const shape = scene.make.graphics({ x: 0, y: 0 }, false);
  shape.fillStyle(0xffffff, 1);
  shape.fillRect(x, -4000, width, bottomY + 4000);
  target.setMask(shape.createGeometryMask());
  target.once(Phaser.GameObjects.Events.DESTROY, () => shape.destroy());
}

/** Soft warm light behind a character, so every color (teal Dino, lavender Koala...) reads against the scene. */
export function spotlight(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, strength = 1): void {
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0xfff4d6, (0.05 + i * 0.022) * strength);
    g.fillEllipse(cx, cy, radius * 2 * (1 - i * 0.12), radius * 1.9 * (1 - i * 0.12));
  }
}

export interface HeroStageResult {
  container: Phaser.GameObjects.Container;
  hero: Character;
  /** The pixel box the character was given, and what the fit decided (for the QA hooks). */
  fit: ReturnType<Character['placeInBox']>;
}

export interface HeroStageOptions {
  stage: Box;
  charBox: Box;
  plaque: Box;
  nameSize: number;
  roleSize: number;
  chipH: number;
  chipSize: number;
  id: CharacterId;
  variant?: EnvVariant;
  /** Starting expression (idle by default). */
  expression?: Parameters<Character['setExpression']>[0];
}

/**
 * The tall rounded hero card: baked backdrop clipped to the card, a spotlight, the character sized
 * to its box (its flat crop hides behind the name plate), and the name plate with role and traits.
 */
export function buildHeroStage(scene: Phaser.Scene, o: HeroStageOptions): HeroStageResult {
  const root = scene.add.container(0, 0);
  const { stage } = o;
  const radius = Math.min(34, stage.w * 0.08);
  const border = Math.max(4, Math.min(7, stage.w * 0.014));

  // frame (outside the clipped scene)
  const frame = scene.add.graphics();
  softShadow(frame, stage, radius, 14, 0.3);
  frame.fillStyle(EXP.brassDeep, 1);
  frame.fillRoundedRect(stage.x, stage.y, stage.w, stage.h, radius);
  frame.fillStyle(EXP.brass, 1);
  frame.fillRoundedRect(stage.x, stage.y, stage.w, stage.h - border * 0.5, radius);
  root.add(frame);

  // the scene inside the card
  const inner: Box = { x: stage.x + border, y: stage.y + border, w: stage.w - border * 2, h: stage.h - border * 2 - border * 0.5 };
  const clipped = scene.add.container(0, 0);
  const envKey = bakeEnvironment(scene, 'select-stage', o.variant ?? 'basecamp', inner.w, inner.h);
  clipped.add(scene.add.image(inner.x, inner.y, envKey).setOrigin(0, 0));
  const light = scene.add.graphics();
  spotlight(light, stage.x + stage.w / 2, o.charBox.y + o.charBox.h * 0.45, Math.min(stage.w * 0.52, o.charBox.h * 0.75));
  clipped.add(light);

  const hero = new Character(scene, 0, 0, o.id, 100);
  const fit = hero.placeInBox(o.charBox.x, o.charBox.y, o.charBox.w, o.charBox.h, {
    presence: castPresence(o.id as CastId),
    fillWidth: 0.9,
    maxScale: 3.0,
    overlap: 8,
  });
  hero.setExpression(o.expression ?? 'idle');
  hero.startIdleLoop(prefersReducedMotion());
  clipped.add(hero);
  maskRounded(scene, clipped, inner, Math.max(4, radius - border));
  root.add(clipped);

  // the name plate (unclipped, on top: it hides the character's flat crop)
  root.add(buildPlaque(scene, o));
  return { container: root, hero, fit };
}

function fitText(t: Phaser.GameObjects.Text, maxWidth: number, minSize: number): void {
  let size = Number.parseFloat(String(t.style.fontSize));
  while (t.width > maxWidth && size > minSize) {
    size -= 1;
    t.setFontSize(size);
  }
}

function buildPlaque(scene: Phaser.Scene, o: HeroStageOptions): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const p = o.plaque;
  const g = scene.add.graphics();
  parchmentPanel(g, p, { radius: Math.min(22, p.h * 0.24) });
  c.add(g);

  const profile = BUDDY_PROFILES[o.id];
  const cx = p.x + p.w / 2;
  const name = text(scene, o.id.charAt(0).toUpperCase() + o.id.slice(1), EXP_CSS.navy, { weight: 800, size: o.nameSize }).setOrigin(0.5, 0);
  name.setPosition(cx, p.y + p.h * 0.075);
  const role = text(scene, profile.role.toUpperCase(), EXP_CSS.brassDeep, { weight: 800, size: o.roleSize }).setOrigin(0.5, 0);
  role.setLetterSpacing?.(2);
  role.setPosition(cx, name.y + name.height * 0.92);
  c.add([name, role]);

  // exactly three trait chips, icon + word
  const padX = Math.max(10, p.w * 0.04);
  const gap = Math.max(5, p.w * 0.018);
  const chipW = (p.w - padX * 2 - gap * 2) / 3;
  const chipY = p.y + p.h - o.chipH - Math.max(9, p.h * 0.1);
  profile.traits.forEach((trait, i) => {
    const x = p.x + padX + i * (chipW + gap);
    const chipGfx = scene.add.graphics();
    pill(chipGfx, { x, y: chipY, w: chipW, h: o.chipH }, 0xe3f5f3, EXP.teal);
    const glyph = Math.round(o.chipH * 0.5);
    drawGlyph(chipGfx, trait.glyph, x + o.chipH * 0.5, chipY + o.chipH / 2, glyph, EXP.tealDeep);
    const label = text(scene, trait.word, EXP_CSS.tealDeep, { weight: 800, size: o.chipSize }).setOrigin(0, 0.5);
    fitText(label, chipW - o.chipH * 0.5 - glyph * 0.5 - 8, 9);
    label.setPosition(x + o.chipH * 0.5 + glyph * 0.62, chipY + o.chipH / 2 + 0.5);
    c.add([chipGfx, label]);
  });
  return c;
}

// ---------------------------------------------------------------------------
// Medallions and the guide chip
// ---------------------------------------------------------------------------

export interface MedallionOptions {
  id: CastId;
  cx: number;
  cy: number;
  d: number;
  selected: boolean;
  /** Ring and halo color for the selected state. */
  accent?: number;
}

/** A circular portrait: soft backdrop, the character's head clipped to the circle, a ring and (if selected) a halo. */
export function buildMedallion(scene: Phaser.Scene, o: MedallionOptions): { container: Phaser.GameObjects.Container; head: Character } {
  const c = scene.add.container(0, 0);
  const r = o.d / 2;
  const ring = Math.max(3, o.d * 0.07);
  const g = scene.add.graphics();
  if (o.selected) {
    g.fillStyle(o.accent ?? EXP.orange, 0.28);
    g.fillCircle(o.cx, o.cy, r + ring * 2.4);
    g.fillStyle(o.accent ?? EXP.orange, 1);
    g.fillCircle(o.cx, o.cy, r + ring * 1.35);
  } else {
    softShadow(g, { x: o.cx - r, y: o.cy - r, w: o.d, h: o.d }, r, 6, 0.24);
  }
  g.fillStyle(o.selected ? 0xffffff : EXP.parchmentEdge, 1);
  g.fillCircle(o.cx, o.cy, r + ring * (o.selected ? 0.5 : 0.8));
  g.fillStyle(0xcdeaf5, 1);
  g.fillCircle(o.cx, o.cy, r);
  g.fillStyle(0xfff0cf, 1);
  g.fillEllipse(o.cx, o.cy + r * 0.55, o.d * 1.2, r * 1.1);
  c.add(g);

  const inner = scene.add.container(0, 0);
  const head = new Character(scene, 0, 0, o.id, 100);
  head.placeInBox(o.cx - r, o.cy - r, o.d, o.d, { presence: Math.min(1, castPresence(o.id) + 0.12), fillWidth: 1.45, fillHeight: 0.8, overlap: r * 0.25, maxScale: 4.5 });
  inner.add(head);
  maskCircle(scene, inner, o.cx, o.cy, r);
  c.add(inner);
  return { container: c, head };
}

/**
 * Click, the host and guide, with a speech bubble. Click is NOT selectable: this chip has no hit
 * target and is never part of the roster; it only speaks the line it is given.
 */
export function buildGuideChip(scene: Phaser.Scene, host: CastId, area: Box, avatar: number, line: string): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const r = avatar / 2;
  const cx = area.x + r + 2;
  const cy = area.y + area.h / 2;
  const g = scene.add.graphics();
  softShadow(g, { x: cx - r, y: cy - r, w: avatar, h: avatar }, r, 6, 0.22);
  g.fillStyle(EXP.brassDeep, 1);
  g.fillCircle(cx, cy, r + 3);
  g.fillStyle(EXP.brass, 1);
  g.fillCircle(cx, cy, r + 2);
  g.fillStyle(0xfff0cf, 1);
  g.fillCircle(cx, cy, r);
  c.add(g);
  const inner = scene.add.container(0, 0);
  const head = new Character(scene, 0, 0, host, 100);
  head.placeInBox(cx - r, cy - r, avatar, avatar, { fillWidth: 0.98, overlap: r * 0.1, maxScale: 3 });
  head.setExpression('happy');
  inner.add(head);
  maskCircle(scene, inner, cx, cy, r);
  c.add(inner);

  // bubble
  const bx = cx + r + 12;
  const bubble: Box = { x: bx, y: area.y + area.h * 0.06, w: area.x + area.w - bx, h: area.h * 0.88 };
  const bg = scene.add.graphics();
  softShadow(bg, bubble, 16, 6, 0.2);
  bg.fillStyle(EXP.parchmentEdge, 1);
  bg.fillRoundedRect(bubble.x - 2, bubble.y - 2, bubble.w + 4, bubble.h + 4, 18);
  bg.fillStyle(0xffffff, 1);
  bg.fillRoundedRect(bubble.x, bubble.y, bubble.w, bubble.h, 16);
  // the tail points at Click
  bg.fillStyle(EXP.parchmentEdge, 1);
  bg.fillTriangle(bubble.x - 11, cy, bubble.x + 3, cy - 10, bubble.x + 3, cy + 10);
  bg.fillStyle(0xffffff, 1);
  bg.fillTriangle(bubble.x - 8, cy, bubble.x + 5, cy - 8, bubble.x + 5, cy + 8);
  c.add(bg);
  const size = Math.max(13, Math.min(21, Math.round(bubble.h * 0.3)));
  const words = text(scene, line, EXP_CSS.navy, { weight: 700, size, wrapWidth: bubble.w - 22, align: 'left' }).setOrigin(0, 0.5);
  words.setPosition(bubble.x + 12, bubble.y + bubble.h / 2);
  while (words.height > bubble.h - 8 && Number.parseFloat(String(words.style.fontSize)) > 11) words.setFontSize(Number.parseFloat(String(words.style.fontSize)) - 1);
  c.add(words);
  return c;
}
