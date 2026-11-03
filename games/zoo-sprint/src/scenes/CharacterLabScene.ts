import Phaser from 'phaser';
import { loadProductionCharacterArt, loadedProductionTextureCount } from '../character-art';
import { EYE_LINE_Y_FRACTION } from '../character-assets';
import { EXPRESSION_STATES, getCharacterDefinition, isCastId, type CastId, type ExpressionState } from '../character-definitions';
import { Character, type CharacterLook } from '../characters';
import { getContext } from '../context';
import { COLORS, CSS, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/**
 * DEVELOPER-ONLY. Shows any cast member (the five starters and Click) in each of the six production
 * expressions without playing a run. Showing a character here does not make it selectable.
 *
 * It exists only in a build made with `--mode character-lab` (npm run build:character-lab -w
 * @bidazoo/play); index.ts compiles it out of every normal build, so it is not part of the
 * player-facing game. It never talks to the platform: no guest, no questions, no attempts, no
 * XP or coins, and it reads and writes no saved state.
 *
 * Query options (all optional): `cast=<dino|koala|tarsier|eagle|bronco|click>` (default dino),
 * `state=<expression>`, `view=single|strip`, `guides=0|1`.
 * Keys: 1-6 pick an expression, N cycles, G toggles the guide lines.
 */
type View = 'single' | 'strip';

function readOptions(): { cast: CastId; state: ExpressionState; view: View; guides: boolean } {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('state');
  const state = EXPRESSION_STATES.find((s) => s === wanted) ?? 'idle';
  const wantedCast = params.get('cast');
  const cast: CastId = isCastId(wantedCast) ? wantedCast : 'dino';
  return { cast, state, view: params.get('view') === 'strip' ? 'strip' : 'single', guides: params.get('guides') !== '0' };
}

export class CharacterLabScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private cast: CastId = 'dino';
  private state: ExpressionState = 'idle';
  private view: View = 'single';
  private guides = true;
  private ready = false;
  private shown: Array<{ character: Character; size: number }> = [];
  private targets: HitTarget[] = [];
  private buttons = new Map<ExpressionState, TapButton>();

  constructor() {
    super('CharacterLabScene');
  }

  create(): void {
    const options = readOptions();
    this.cast = options.cast;
    this.state = options.state;
    this.view = options.view;
    this.guides = options.guides;
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
      keyboard?.off('keydown', this.onKey, this);
    });
    void loadProductionCharacterArt(this).then(() => {
      this.ready = true;
      this.render();
    });
  }

  private onKey(event: KeyboardEvent): void {
    const index = Number(event.key) - 1;
    const picked = EXPRESSION_STATES[index];
    if (picked) this.select(picked);
    else if (event.key === 'n' || event.key === 'N') this.select(EXPRESSION_STATES[(EXPRESSION_STATES.indexOf(this.state) + 1) % EXPRESSION_STATES.length] ?? 'idle');
    else if (event.key === 'g' || event.key === 'G') this.toggleGuides();
  }

  private select(state: ExpressionState): void {
    this.state = state;
    // Same Character objects, new picture: switching an expression must not rebuild anything else.
    const first = this.shown[0];
    if (this.view === 'single' && first) {
      first.character.setExpression(state);
      for (const [name, button] of this.buttons) button.setStyle(name === state ? BUTTON_STYLES.primary : BUTTON_STYLES.card);
      this.publish();
      this.announce();
    } else {
      this.render();
    }
  }

  private toggleGuides(): void {
    this.guides = !this.guides;
    this.render();
  }

  private render(): void {
    const { width: w, height: h } = this.scale;
    this.layer.removeAll(true);
    this.shown = [];
    this.buttons.clear();
    const backdrop = this.add.graphics();
    backdrop.fillStyle(COLORS.jungle, 1);
    backdrop.fillRect(0, 0, w, h);
    this.layer.add(backdrop);

    const unit = Math.min(w, h);
    const pad = clamp(unit * 0.04, 10, 28);
    const titleSize = clamp(unit * 0.045, 13, 22);
    const title = text(this, `${getCharacterDefinition(this.cast).displayName} expression lab (developer only)`, CSS.mist, { size: titleSize }).setOrigin(0.5, 0);
    title.setPosition(w / 2, pad);
    this.layer.add(title);

    const targets: HitTarget[] = [];
    let top = pad + titleSize * 1.6;
    let bottom = h - pad;

    if (this.view === 'single') {
      const cols = w >= 700 ? 6 : 3;
      const rows = Math.ceil(EXPRESSION_STATES.length / cols);
      const gap = pad * 0.6;
      const btnW = (Math.min(w, 900) - pad * 2 - gap * (cols - 1)) / cols;
      const btnH = clamp(unit * 0.1, 44, 72);
      const left = (w - (btnW * cols + gap * (cols - 1))) / 2;
      bottom = h - pad - rows * btnH - (rows - 1) * gap - pad;
      EXPRESSION_STATES.forEach((state, i) => {
        const x = left + (i % cols) * (btnW + gap) + btnW / 2;
        const y = h - pad - rows * btnH - (rows - 1) * gap + Math.floor(i / cols) * (btnH + gap) + btnH / 2;
        const style = state === this.state ? BUTTON_STYLES.primary : BUTTON_STYLES.card;
        const button = new TapButton(this, `lab-state-${state}`, x, y, btnW, btnH, state, style, () => this.select(state), 0.36);
        this.layer.add(button);
        this.buttons.set(state, button);
        targets.push(button.hitTarget());
      });
      const regionH = Math.max(80, bottom - top);
      const size = clamp(Math.min(w - pad * 2, regionH) * 0.96, 80, 520);
      this.addBust(w / 2, top + regionH / 2, size, this.state, null);
    } else {
      const cols = w >= 700 ? 6 : w >= 420 ? 3 : 2;
      const rows = Math.ceil(EXPRESSION_STATES.length / cols);
      const cellW = (w - pad * 2) / cols;
      const cellH = (bottom - top) / rows;
      const labelH = clamp(unit * 0.05, 14, 24);
      const size = clamp(Math.min(cellW, cellH - labelH) * 0.94, 60, 360);
      EXPRESSION_STATES.forEach((state, i) => {
        const cx = pad + (i % cols) * cellW + cellW / 2;
        const cy = top + Math.floor(i / cols) * cellH + (cellH - labelH) / 2;
        this.addBust(cx, cy, size, state, state);
      });
    }

    this.layer.sendToBack(backdrop);
    this.targets = targets;
    this.publish();
    this.announce();
  }

  private addBust(x: number, y: number, size: number, state: ExpressionState, label: ExpressionState | null): void {
    const character = new Character(this, x, y, this.cast, size);
    character.setExpression(state);
    this.shown.push({ character, size });
    if (this.guides) {
      const g = this.add.graphics();
      g.lineStyle(1, COLORS.sun, 0.9);
      g.strokeRect(x - size / 2, y - size / 2, size, size);
      g.lineStyle(1, COLORS.sky, 0.95);
      g.lineBetween(x - size / 2, y + EYE_LINE_Y_FRACTION * size, x + size / 2, y + EYE_LINE_Y_FRACTION * size);
      g.lineBetween(x, y - size / 2, x, y + size / 2);
      this.layer.add(g);
    }
    this.layer.add(character);
    if (label) {
      const caption = text(this, label, CSS.cream, { size: clamp(size * 0.09, 12, 20) }).setOrigin(0.5, 0);
      caption.setPosition(x, y + size / 2 + 2);
      this.layer.add(caption);
    }
  }

  /** What is on screen, measured from the scene graph, for the page's data attributes and Playwright. */
  private geometry(): Array<CharacterLook & { size: number; worldEyeY: number; worldX: number; bounds: { x: number; y: number; w: number; h: number } }> {
    return this.shown.map(({ character, size }) => {
      const look = character.inspect();
      const image = character.list[0] as Phaser.GameObjects.Image;
      const bounds = image.getBounds();
      return {
        ...look,
        size,
        worldEyeY: Math.round((character.y + look.anchorY) * 100) / 100,
        worldX: Math.round((character.x + look.anchorX) * 100) / 100,
        bounds: { x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.width), h: Math.round(bounds.height) },
      };
    });
  }

  private publish(): void {
    const ctx = getContext(this);
    publishSurface(ctx.parent, 'character-lab', this.targets, {
      'lab-ready': String(this.ready),
      'lab-cast': this.cast,
      'lab-state': this.state,
      'lab-view': this.view,
      'lab-count': String(this.shown.length),
      'lab-geometry': JSON.stringify(this.geometry()),
      'production-art': String(loadedProductionTextureCount(this)),
    });
  }

  private announce(): void {
    const ctx = getContext(this);
    ctx.a11y.set(`${getCharacterDefinition(this.cast).displayName} expression lab. Showing ${this.state}. Developer only.`, [
      ...EXPRESSION_STATES.map((state) => ({ id: `lab-state-${state}`, label: state, onClick: () => this.select(state) })),
      { id: 'lab-guides', label: this.guides ? 'Hide guides' : 'Show guides', onClick: () => this.toggleGuides() },
    ]);
  }
}
