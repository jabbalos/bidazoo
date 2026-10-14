import Phaser from 'phaser';
import { computeExpressionPlacement, expressionTextureKey } from './character-assets';
import { hasProductionArt } from './character-art';
import type { ExpressionState } from './character-definitions';
import type { CharacterId } from './roster';

/**
 * Presentation layer for the five starters (docs/CHARACTER-BIBLE.md).
 *
 *   roster (ids, labels)  ->  art (this file)  ->  scenes
 *
 * TRANSITIONAL ART. These are polished, code-drawn busts, not final production artwork. Each
 * (character, mood) is drawn ONCE into a small texture and then shown as an ordinary image, so the
 * per-frame cost is one quad per character, not a pile of vector commands. Final art (portraits,
 * spritesheets, animated WebP) can replace `ensureCharacterTexture` without touching any scene,
 * the API, or the learning systems. Nothing here knows about questions, grading, XP, or coins.
 *
 * F3: a character with curated production art (Dino so far; see character-assets.ts) is drawn from
 * its six production expressions instead, placed by the M4 eye-line anchor. If any of its six
 * textures is missing, the code-drawn art below is used, so the fallback is always there. The
 * public API (constructor, setBustSize, celebrate, wobble) is unchanged.
 *
 * Locked anchors honored below (see the bible): Dino has exactly ONE backpack; Koala has glasses
 * and a book and NO backpack; Tarsier is small with huge eyes and goggles; Eagle has a white head,
 * brown wings, and a green varsity jacket with an original block letter A; Bronco is an athletic
 * horse in a maroon bandana. Every shape is original and nothing is traced from a real school,
 * team, or brand.
 */

/** idle = resting, happy = celebrate, tryAgain = the gentle response to a miss. */
export type Mood = 'idle' | 'happy' | 'tryAgain';

type G = Phaser.GameObjects.Graphics;

/** Texture edge in pixels. Art is centered, so (0, 0) is the middle of the head. */
const TEX = 320;
const INK = 0x1d2733;
const LINE = 5;

// ---------------------------------------------------------------------------
// Tiny drawing helpers
// ---------------------------------------------------------------------------

function disc(g: G, x: number, y: number, rad: number, fill: number, outline = true): void {
  g.fillStyle(fill, 1);
  g.fillCircle(x, y, rad);
  if (outline) {
    g.lineStyle(LINE, INK, 1);
    g.strokeCircle(x, y, rad);
  }
}

function oval(g: G, x: number, y: number, w: number, h: number, fill: number, outline = true): void {
  g.fillStyle(fill, 1);
  g.fillEllipse(x, y, w, h);
  if (outline) {
    g.lineStyle(LINE, INK, 1);
    g.strokeEllipse(x, y, w, h);
  }
}

/** x/y is the top-left corner. */
function rrect(g: G, x: number, y: number, w: number, h: number, rad: number, fill: number, outline = true): void {
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, rad);
  if (outline) {
    g.lineStyle(LINE, INK, 1);
    g.strokeRoundedRect(x, y, w, h, rad);
  }
}

function poly(g: G, flat: number[], fill: number, outline = true): void {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] as number, y: flat[i + 1] as number });
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  if (outline) {
    g.lineStyle(LINE, INK, 1);
    g.strokePoints(pts, true, true);
  }
}

function stroke(g: G, width: number, color: number, x1: number, y1: number, x2: number, y2: number): void {
  g.lineStyle(width, color, 1);
  g.lineBetween(x1, y1, x2, y2);
}

/** A triangular spike pointing away from the head center at `deg`. Drawn before the head so the base hides. */
function spike(g: G, deg: number, baseR: number, h: number, halfW: number, fill: number): void {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const bx = ux * (baseR - 10);
  const by = uy * (baseR - 10);
  poly(
    g,
    [bx - uy * halfW, by + ux * halfW, ux * (baseR + h), uy * (baseR + h), bx + uy * halfW, by - ux * halfW],
    fill,
  );
}

/** A friendly mouth. `y` is the mouth line, `w` its width. Mood changes the shape, never the size of the head. */
function mouth(g: G, x: number, y: number, w: number, mood: Mood): void {
  if (mood === 'happy') {
    g.fillStyle(0x4a1a24, 1);
    g.beginPath();
    g.arc(x, y - w * 0.12, w / 2, 0, Math.PI, false);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xf0707f, 1);
    g.fillEllipse(x, y + w * 0.2, w * 0.46, w * 0.18);
    g.lineStyle(LINE - 1, INK, 1);
    g.beginPath();
    g.arc(x, y - w * 0.12, w / 2, 0, Math.PI, false);
    g.closePath();
    g.strokePath();
    return;
  }
  g.lineStyle(LINE, INK, 1);
  g.beginPath();
  if (mood === 'tryAgain') {
    // A small, gentle "hmm". Deliberately mild: a miss is not a punishment.
    g.arc(x, y + w * 0.42, w * 0.3, 1.2 * Math.PI, 1.8 * Math.PI, false);
  } else {
    g.arc(x, y - w * 0.18, w * 0.5, 0.15 * Math.PI, 0.85 * Math.PI, false);
  }
  g.strokePath();
}

/** Round eye with a highlight. In tryAgain the gaze drops a little. */
function eye(g: G, x: number, y: number, w: number, h: number, mood: Mood, iris: number): void {
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(x, y, w, h);
  g.lineStyle(LINE - 1, INK, 1);
  g.strokeEllipse(x, y, w, h);
  const dy = mood === 'tryAgain' ? h * 0.1 : 0;
  g.fillStyle(iris, 1);
  g.fillCircle(x, y + dy, w * 0.31);
  g.fillStyle(0x0d0d14, 1);
  g.fillCircle(x, y + dy, w * 0.18);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x + w * 0.1, y + dy - h * 0.12, w * 0.085);
}

/** Mood brows: raised for happy, softly worried for tryAgain, none at rest. Mirrored left/right. */
function moodBrows(g: G, mood: Mood, inner: number, outer: number, y: number, color: number, width = 6): void {
  if (mood === 'idle') return;
  for (const s of [-1, 1]) {
    if (mood === 'happy') stroke(g, width, color, s * outer, y - 4, s * inner, y - 9);
    else stroke(g, width, color, s * outer, y + 3, s * inner, y - 8);
  }
}

// ---------------------------------------------------------------------------
// The five starters
// ---------------------------------------------------------------------------

/** Dino: teal explorer, orange dorsal spikes, exactly ONE explorer backpack. */
function drawDino(g: G, mood: Mood): void {
  const TEAL = 0x2fc4b2;
  const TEAL_D = 0x1d9e8e;
  const BELLY = 0xcdf3e4;
  const SNOUT = 0x8de8d8;
  const ORANGE = 0xff8a2b;
  const PACK = 0x8a5a2b;
  const PACK_D = 0x5e3a1a;
  const PACK_L = 0xc79a5b;

  // tail, curling up behind the right hip
  poly(g, [44, 112, 108, 118, 148, 96, 140, 132, 102, 152, 44, 148], TEAL);

  // the ONE backpack: behind the left shoulder, with a flap, a pocket, and a buckle
  rrect(g, -124, 54, 94, 98, 18, PACK);
  rrect(g, -124, 54, 94, 38, 16, PACK_D);
  rrect(g, -114, 100, 62, 40, 12, PACK_L);
  rrect(g, -88, 82, 18, 14, 4, 0xf3c94a);

  // dorsal spikes (behind the head)
  const spikes: Array<[number, number, number]> = [
    [-158, 30, 17],
    [-124, 40, 19],
    [-90, 48, 21],
    [-56, 40, 19],
    [-22, 30, 17],
  ];
  for (const [deg, h, hw] of spikes) spike(g, deg, 94, h, hw, ORANGE);

  // body
  oval(g, 0, 108, 150, 84, TEAL);
  oval(g, 0, 120, 90, 58, BELLY, false);
  oval(g, -80, 116, 30, 44, TEAL);
  oval(g, 80, 116, 30, 44, TEAL);
  // the straps of that same backpack
  stroke(g, 11, PACK_D, -46, 70, -40, 142);
  stroke(g, 11, PACK_D, 46, 70, 40, 142);

  // head
  oval(g, 0, 0, 196, 188, TEAL);
  oval(g, 0, 42, 126, 80, SNOUT, false);
  disc(g, -64, -54, 8, TEAL_D, false);
  disc(g, 60, -50, 9, TEAL_D, false);
  disc(g, 8, -74, 7, TEAL_D, false);
  disc(g, -17, 30, 4.5, INK, false);
  disc(g, 17, 30, 4.5, INK, false);
  g.fillStyle(0xff9aa2, 0.55);
  g.fillEllipse(-66, 36, 30, 18);
  g.fillEllipse(66, 36, 30, 18);

  eye(g, -38, -14, 46, 54, mood, 0x5b3a8c);
  eye(g, 38, -14, 46, 54, mood, 0x5b3a8c);
  moodBrows(g, mood, 20, 58, -48, TEAL_D);
  mouth(g, 0, 56, 80, mood);
}

/** Koala: gray-lavender scholar with glasses and a book. NO backpack. */
function drawKoala(g: G, mood: Mood): void {
  const FUR = 0xaaa0cc;
  const FUR_L = 0xd9d2ee;
  const EAR_IN = 0xf0d9e8;
  const CARDIGAN = 0x5a4a8c;
  const NOSE = 0x2a2533;

  // big round ears
  disc(g, -88, -58, 48, FUR);
  disc(g, 88, -58, 48, FUR);
  disc(g, -88, -58, 28, EAR_IN, false);
  disc(g, 88, -58, 28, EAR_IN, false);

  // cardigan over a cream collar
  oval(g, 0, 112, 156, 86, CARDIGAN);
  poly(g, [-28, 74, 0, 104, 28, 74], 0xf4efe0);

  // head
  oval(g, 0, 0, 196, 188, FUR);
  oval(g, 0, 46, 118, 74, FUR_L, false);

  // nose
  oval(g, 0, 24, 54, 58, NOSE);
  g.fillStyle(0x7a7390, 1);
  g.fillEllipse(-10, 8, 14, 16);

  // eyes behind the glasses
  disc(g, -42, -16, 8.5, 0x1d1a26, false);
  disc(g, 42, -16, 8.5, 0x1d1a26, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-39, -19, 3);
  g.fillCircle(45, -19, 3);

  // glasses: frames, faint lenses, a bridge, and temples
  g.fillStyle(0xeaf6ff, 0.45);
  g.fillCircle(-42, -16, 31);
  g.fillCircle(42, -16, 31);
  g.lineStyle(8, 0x2b2236, 1);
  g.strokeCircle(-42, -16, 31);
  g.strokeCircle(42, -16, 31);
  stroke(g, 7, 0x2b2236, -11, -18, 11, -18);
  stroke(g, 7, 0x2b2236, -72, -22, -92, -30);
  stroke(g, 7, 0x2b2236, 72, -22, 92, -30);
  moodBrows(g, mood, 22, 60, -58, 0x6c5f93);

  mouth(g, 0, 68, 40, mood);

  // the book, held in both paws
  rrect(g, -54, 98, 108, 54, 6, 0x8c3b3b);
  g.fillStyle(0x6a2a2a, 1);
  g.fillRect(-52, 100, 12, 50);
  stroke(g, 5, 0xf2c94c, -24, 116, 28, 116);
  stroke(g, 5, 0xf2c94c, -24, 130, 14, 130);
  disc(g, -54, 128, 15, FUR);
  disc(g, 54, 128, 15, FUR);
}

/** Tarsier: small, agile, huge eyes, goggles on the forehead. */
function drawTarsier(g: G, mood: Mood): void {
  const FUR = 0xb98650;
  const FUR_D = 0x8d6338;
  const EAR_IN = 0xe9a79b;
  const VEST = 0xf2c230;

  // a smaller silhouette than the others: scaled down and settled toward the bottom
  g.translateCanvas(0, 14);
  g.scaleCanvas(0.9, 0.9);

  // curling tail
  g.lineStyle(20, INK, 1);
  g.beginPath();
  g.arc(112, 112, 36, 0.55 * Math.PI, 1.85 * Math.PI, true);
  g.strokePath();
  g.lineStyle(11, FUR_D, 1);
  g.beginPath();
  g.arc(112, 112, 36, 0.55 * Math.PI, 1.85 * Math.PI, true);
  g.strokePath();

  // big thin ears
  oval(g, -92, -34, 60, 90, FUR);
  oval(g, 92, -34, 60, 90, FUR);
  oval(g, -92, -32, 34, 62, EAR_IN, false);
  oval(g, 92, -32, 34, 62, EAR_IN, false);

  // small body in a yellow scout vest
  oval(g, 0, 124, 110, 62, VEST);
  disc(g, -42, 138, 14, FUR);
  disc(g, 42, 138, 14, FUR);

  // head
  oval(g, 0, 0, 204, 186, FUR);

  // goggles pushed up on the forehead: strap, bridge, and two lenses
  rrect(g, -100, -58, 200, 22, 9, 0x2f3b4c);
  rrect(g, -12, -70, 24, 12, 4, 0x4b5c75);
  for (const s of [-1, 1]) {
    disc(g, s * 40, -64, 28, 0x4b5c75);
    disc(g, s * 40, -64, 20, 0x7fdcf2, false);
    g.fillStyle(0xffffff, 0.75);
    g.fillEllipse(s * 40 - 7, -72, 12, 7);
  }

  // huge eyes
  for (const s of [-1, 1]) {
    disc(g, s * 40, 10, 41, 0xf1b53d);
    const dy = mood === 'tryAgain' ? 5 : 0;
    disc(g, s * 40, 10 + dy, 27, 0x1b110a, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s * 40 + 11, 10 + dy - 12, 9);
    g.fillCircle(s * 40 - 9, 10 + dy + 12, 4.5);
  }
  moodBrows(g, mood, 20, 70, -22, FUR_D);

  // tiny nose and mouth
  oval(g, 0, 54, 18, 12, 0xe7918f, false);
  mouth(g, 0, 66, 28, mood);
}

/** Eagle: white head, brown wings, green varsity jacket with an original block letter A. */
function drawEagle(g: G, mood: Mood): void {
  const BROWN = 0x7b4a25;
  const BROWN_D = 0x4b2c14;
  const WHITE = 0xfbfaf4;
  const BEAK = 0xf7c52b;
  const GREEN = 0x1f7d49;
  const GREEN_D = 0x145a33;
  const CREAM = 0xf6ecc4;

  // brown wings, raised a little, with feather lines
  for (const s of [-1, 1]) {
    poly(g, [s * 50, 70, s * 106, 20, s * 148, -14, s * 154, 40, s * 144, 96, s * 122, 138, s * 70, 142], BROWN);
    stroke(g, 5, BROWN_D, s * 102, 46, s * 148, 56);
    stroke(g, 5, BROWN_D, s * 94, 82, s * 138, 106);
  }

  // green varsity jacket: body, sleeves with a cream stripe
  oval(g, 0, 108, 160, 92, GREEN);
  for (const s of [-1, 1]) {
    oval(g, s * 78, 104, 46, 74, GREEN);
    rrect(g, s * 78 - 20, 112, 40, 9, 3, CREAM, false);
  }

  // the prominent block letter A: drop shadow, cream letter, and its counter
  poly(g, [-22, 156, -4, 96, 10, 96, 28, 156, 14, 156, 10, 142, -8, 142, -12, 156], GREEN_D, false);
  poly(g, [-25, 152, -7, 92, 7, 92, 25, 152, 11, 152, 7, 138, -7, 138, -11, 152], CREAM);
  poly(g, [0, 106, -5, 128, 5, 128], GREEN, false);

  // head group, lifted so the letter has room
  g.save();
  g.translateCanvas(0, -14);
  disc(g, -64, 66, 20, WHITE);
  disc(g, 64, 66, 20, WHITE);
  disc(g, -36, 82, 18, WHITE);
  disc(g, 36, 82, 18, WHITE);
  disc(g, 0, 0, 86, WHITE);

  // hooked beak, nostrils, and a mood-dependent mouth line
  poly(g, [-30, -2, 30, -2, 22, 30, 8, 58, -4, 60, -10, 34, -22, 28], BEAK);
  disc(g, -9, 8, 3.5, INK, false);
  disc(g, 9, 8, 3.5, INK, false);
  if (mood === 'happy') {
    poly(g, [-18, 30, 18, 30, 0, 52], 0x6b1f2a, false);
    g.fillStyle(0xf0707f, 1);
    g.fillEllipse(0, 42, 14, 8);
  } else if (mood === 'tryAgain') {
    stroke(g, 4, INK, -14, 36, 12, 34);
  } else {
    stroke(g, 4, INK, -16, 34, 16, 34);
  }

  // yellow eyes under strong brows
  for (const s of [-1, 1]) {
    disc(g, s * 36, -2, 17, 0xffd23f);
    const dy = mood === 'tryAgain' ? 3 : 0;
    disc(g, s * 36, -2 + dy, 8, 0x14110c, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s * 36 + 4, -6 + dy, 3);
  }
  for (const s of [-1, 1]) {
    if (mood === 'happy') stroke(g, 9, BROWN_D, s * 60, -30, s * 14, -26);
    else if (mood === 'tryAgain') stroke(g, 9, BROWN_D, s * 60, -14, s * 14, -32);
    else stroke(g, 9, BROWN_D, s * 60, -26, s * 14, -12);
  }
  g.restore();
}

/** Bronco: athletic horse with a maroon bandana. */
function drawBronco(g: G, mood: Mood): void {
  const COAT = 0xb9672a;
  const COAT_D = 0x8f4a1c;
  const MANE = 0x3a2314;
  const MUZZLE = 0xe9b790;
  const BLAZE = 0xf7f1e6;
  const BAND = 0x8e1b30;
  const BAND_L = 0xd6566d;
  const INNER = 0xe59a8f;

  // windswept mane behind the head: swept, pointed locks (not round shapes, which read as ears)
  for (const s of [-1, 1]) {
    poly(g, [s * 52, -90, s * 100, -78, s * 124, -16, s * 114, 44, s * 134, 108, s * 84, 90, s * 66, 24], MANE);
  }

  // tall, pointed ears
  for (const s of [-1, 1]) {
    poly(g, [s * 72, -68, s * 56, -146, s * 20, -84], COAT);
    poly(g, [s * 60, -80, s * 54, -124, s * 36, -88], INNER, false);
  }

  // strong shoulders
  oval(g, 0, 122, 166, 72, COAT);
  oval(g, -62, 130, 54, 46, COAT_D, false);
  oval(g, 62, 130, 54, 46, COAT_D, false);

  // long face, white blaze, and muzzle
  oval(g, 0, 2, 152, 198, COAT);
  oval(g, 0, -26, 26, 112, BLAZE, false);
  oval(g, 0, 62, 114, 76, MUZZLE);

  // forelock
  poly(g, [-30, -84, -6, -92, -18, -42], MANE, false);
  poly(g, [-8, -92, 20, -86, 8, -38], MANE, false);
  poly(g, [14, -88, 36, -78, 26, -44], MANE, false);

  // glossy eyes, nostrils, and a friendly mouth
  for (const s of [-1, 1]) {
    oval(g, s * 46, -14, 30, 38, 0x2a160c);
    const dy = mood === 'tryAgain' ? 4 : 0;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s * 46 + 5, -22 + dy, 5.5);
    g.fillCircle(s * 46 - 5, -6 + dy, 2.5);
    oval(g, s * 22, 64, 13, 19, INK, false);
  }
  moodBrows(g, mood, 28, 62, -50, MANE);
  mouth(g, 0, 92, 46, mood);

  // the maroon bandana: neck band, hanging triangle, trim, and dots
  rrect(g, -82, 94, 164, 22, 10, BAND);
  poly(g, [-54, 108, 54, 108, 0, 158], BAND);
  g.lineStyle(3, BAND_L, 1);
  g.strokeTriangle(-40, 114, 40, 114, 0, 147);
  disc(g, -18, 122, 4, 0xf7e9d0, false);
  disc(g, 18, 122, 4, 0xf7e9d0, false);
  disc(g, 0, 136, 4, 0xf7e9d0, false);
}

const ART: Record<CharacterId, (g: G, mood: Mood) => void> = {
  dino: drawDino,
  koala: drawKoala,
  tarsier: drawTarsier,
  eagle: drawEagle,
  bronco: drawBronco,
};

// ---------------------------------------------------------------------------
// Texture cache and the display object
// ---------------------------------------------------------------------------

export function characterTextureKey(id: CharacterId, mood: Mood): string {
  return `bz-character-${id}-${mood}`;
}

/** Draws (character, mood) into a texture the first time it is needed and returns its key. */
export function ensureCharacterTexture(scene: Phaser.Scene, id: CharacterId, mood: Mood): string {
  const key = characterTextureKey(id, mood);
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.translateCanvas(TEX / 2, TEX / 2);
    ART[id](g, mood);
    g.generateTexture(key, TEX, TEX);
    g.destroy();
  }
  return key;
}

/** The code-drawn art only has three moods; richer states borrow the closest one. */
function fallbackMood(state: ExpressionState): Mood {
  if (state === 'tryAgain') return 'tryAgain';
  if (state === 'happy' || state === 'cheer' || state === 'discover') return 'happy';
  return 'idle';
}

/** What a character is showing right now. Read-only, for tests and the developer lab. */
export interface CharacterLook {
  readonly id: CharacterId;
  readonly expression: ExpressionState;
  readonly production: boolean;
  readonly textureKey: string;
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** The eye anchor, in the character's own coordinates. */
  readonly anchorX: number;
  readonly anchorY: number;
}

/**
 * A starter on screen. `size` is the width and height of the whole bust in pixels.
 * idle is the resting pose; celebrate() and wobble() are brief reactions that return to idle.
 * setExpression() shows any of the six canonical expressions; it changes the picture and nothing else.
 */
export class Character extends Phaser.GameObjects.Container {
  private readonly image: Phaser.GameObjects.Image;
  private readonly production: boolean;
  private expression: ExpressionState = 'idle';
  private size = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly id: CharacterId, size: number) {
    super(scene, x, y);
    this.production = hasProductionArt(scene, id);
    this.image = scene.add.image(0, 0, this.textureFor('idle'));
    this.add(this.image);
    scene.add.existing(this);
    this.setBustSize(size);
  }

  /** Whether this instance is drawn from production art (false means the code-drawn fallback). */
  get usesProductionArt(): boolean {
    return this.production;
  }

  setBustSize(size: number): this {
    this.size = size;
    this.applyLook();
    return this;
  }

  /** Shows one of the six canonical expressions. Pure presentation: no scene, score or state changes. */
  setExpression(state: ExpressionState): this {
    if (!this.active) return this;
    this.expression = state;
    this.applyLook();
    return this;
  }

  /** A read-only snapshot of what is on screen. */
  inspect(): CharacterLook {
    return {
      id: this.id,
      expression: this.expression,
      production: this.production,
      textureKey: this.image.texture.key,
      displayWidth: this.image.displayWidth,
      displayHeight: this.image.displayHeight,
      anchorX: this.image.x,
      anchorY: this.image.y,
    };
  }

  private textureFor(state: ExpressionState): string {
    return this.production ? expressionTextureKey(this.id, state) : ensureCharacterTexture(this.scene, this.id, fallbackMood(state));
  }

  private applyLook(): void {
    const image = this.image;
    image.setTexture(this.textureFor(this.expression));
    const placement = this.production ? computeExpressionPlacement(this.id, this.expression, this.size) : undefined;
    if (placement) {
      image.setDisplaySize(placement.displayWidth, placement.displayHeight);
      image.setOrigin(placement.originX, placement.originY);
      image.setPosition(placement.x, placement.y);
    } else {
      image.setDisplaySize(this.size, this.size);
      image.setOrigin(0.5, 0.5);
      image.setPosition(0, 0);
    }
  }

  private setMood(mood: Mood): void {
    this.setExpression(mood);
  }

  /** A happy hop. */
  celebrate(): void {
    this.setMood('happy');
    this.scene.tweens.add({
      targets: this,
      y: this.y - this.size * 0.28,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.setMood('idle'),
    });
  }

  /** A gentle head shake. Deliberately mild: a miss is not a punishment. */
  wobble(): void {
    this.setMood('tryAgain');
    this.scene.tweens.add({
      targets: this,
      angle: { from: -9, to: 9 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (!this.active) return;
        this.setAngle(0);
        this.setMood('idle');
      },
    });
  }
}
