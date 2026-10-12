import Phaser from 'phaser';
import { Character } from '../characters';
import { getContext } from '../context';
import { STARTERS, characterName, saveCharacter, type CharacterId } from '../roster';
import { COLORS, CSS, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/** The grid never shrinks a card below this just to avoid scrolling; it scrolls instead. */
const MIN_CARD_W = 148;
const MIN_CARD_H = 148;
/** A finger or mouse that moves farther than this is scrolling, not tapping. */
const DRAG_PX = 10;

interface Card {
  id: CharacterId;
  name: string;
  x: number;
  /** In scroll-content space: 0 is the top of the grid, before the scroll offset is applied. */
  y: number;
  w: number;
  h: number;
}

/**
 * Choose a starter -> Start Run. Which starter is chosen is presentation only.
 *
 * The starters sit in a responsive grid (2 columns on phones, more as the screen widens). The
 * title and the Start / Continue button stay pinned; if the cards do not fit between them, the
 * card area scrolls vertically (drag, swipe, or wheel). Nothing here touches the server.
 */
export class MenuScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.Container | null = null;
  private indicator: Phaser.GameObjects.Graphics | null = null;
  private cards: Card[] = [];
  private view = { y: 0, h: 0 };
  private scrollY = 0;
  private maxScroll = 0;
  private startTarget: HitTarget | null = null;
  private drag: { startY: number; startScroll: number; moved: boolean } | null = null;
  private justSelected: CharacterId | null = null;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.scrollY = 0;
    this.drag = null;
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.input.off('wheel', this.onWheel, this);
    });
  }

  private select(id: CharacterId): void {
    const ctx = getContext(this);
    ctx.character = id;
    saveCharacter(id);
    this.justSelected = id;
    this.render();
  }

  private start(): void {
    this.scene.start('RunScene');
  }

  // ---------------------------------------------------------------------------
  // Scrolling and tapping (one handler set for the whole card area)
  // ---------------------------------------------------------------------------

  private inView(y: number): boolean {
    return y >= this.view.y && y <= this.view.y + this.view.h;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.drag = this.inView(pointer.y) ? { startY: pointer.y, startScroll: this.scrollY, moved: false } : null;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || !pointer.isDown) return;
    const dy = pointer.y - drag.startY;
    if (!drag.moved && Math.abs(dy) > DRAG_PX) drag.moved = true;
    if (drag.moved) this.setScroll(drag.startScroll - dy);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.moved || !this.inView(pointer.y)) return;
    const localY = pointer.y - this.view.y + this.scrollY;
    const card = this.cards.find(
      (c) => pointer.x >= c.x && pointer.x <= c.x + c.w && localY >= c.y && localY <= c.y + c.h,
    );
    if (card) this.select(card.id);
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    this.setScroll(this.scrollY + dy);
  }

  private setScroll(value: number): void {
    const next = clamp(value, 0, this.maxScroll);
    if (next === this.scrollY) return;
    this.scrollY = next;
    this.applyScroll();
  }

  /** Moves the cards, redraws the scroll hints, and republishes where the targets now are. */
  private applyScroll(): void {
    if (this.content) this.content.y = this.view.y - this.scrollY;
    this.drawIndicator();
    this.publish();
  }

  private drawIndicator(): void {
    const g = this.indicator;
    if (!g) return;
    g.clear();
    if (this.maxScroll <= 0) return;
    const w = this.scale.width;
    const { y, h } = this.view;
    const track = h - 16;
    const thumb = Math.max(36, track * (h / (h + this.maxScroll)));
    const thumbY = y + 8 + (track - thumb) * (this.scrollY / this.maxScroll);
    g.fillStyle(COLORS.leafLight, 0.9);
    g.fillRoundedRect(w - 8, thumbY, 4, thumb, 2);
    if (this.scrollY < this.maxScroll - 2) {
      // a small "more below" arrow
      g.fillStyle(COLORS.sun, 0.95);
      g.fillTriangle(w / 2 - 12, y + h - 20, w / 2 + 12, y + h - 20, w / 2, y + h - 8);
    }
  }

  // ---------------------------------------------------------------------------
  // Layout and drawing (rebuilt from state on every change and every resize)
  // ---------------------------------------------------------------------------

  private render(): void {
    const ctx = getContext(this);
    this.layer.removeAll(true);
    const { width: w, height: h } = this.scale;
    const pad = Math.max(12, Math.round(Math.min(w, h) * 0.035));
    const gap = pad;

    // Columns: as many as keep cards at least MIN_CARD_W wide. 4 is skipped on purpose, because
    // five starters make a lopsided 4 + 1; the choices are 5 (one row), 3 (3 + 2), or 2 (2 + 2 + 1).
    const gridW = Math.min(w, 1200) - pad * 2;
    const cols = [5, 3, 2].find((c) => (gridW - gap * (c - 1)) / c >= MIN_CARD_W) ?? 2;
    const rows = Math.ceil(STARTERS.length / cols);
    const cardW = (gridW - gap * (cols - 1)) / cols;

    // Pinned header and footer; the grid scrolls between them.
    const titleSize = clamp(h * 0.062, 26, 56);
    const subSize = clamp(h * 0.03, 15, 24);
    const headerH = Math.round(pad + titleSize * 1.15 + subSize * 1.7);
    const totalsSize = clamp(h * 0.032, 15, 26);
    const btnH = clamp(h * 0.12, 60, 110);
    const footerH = Math.round(pad * 0.5 + totalsSize * 1.5 + btnH + pad * 1.5);
    const viewY = headerH;
    const viewH = Math.max(120, h - headerH - footerH);

    const padTop = Math.round(gap * 0.6);
    const padBottom = gap;
    const avail = viewH - padTop - padBottom - gap * (rows - 1);
    const cardH = clamp(avail / rows, MIN_CARD_H, Math.max(MIN_CARD_H, cardW * 1.3));
    const contentH = padTop + rows * cardH + (rows - 1) * gap + padBottom;
    this.maxScroll = Math.max(0, Math.ceil(contentH - viewH));
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll);
    this.view = { y: viewY, h: viewH };
    // When everything fits, center the grid in the space instead of leaving it all at the top.
    const extraTop = this.maxScroll === 0 ? Math.floor((viewH - contentH) / 2) : 0;

    this.cards = STARTERS.map((starter, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const inRow = Math.min(cols, STARTERS.length - row * cols);
      const rowW = inRow * cardW + (inRow - 1) * gap;
      const x0 = (w - rowW) / 2; // each row is centered, so a short last row sits in the middle
      return { id: starter.id, name: starter.name, x: x0 + col * (cardW + gap), y: extraTop + padTop + row * (cardH + gap), w: cardW, h: cardH };
    });

    const backdrop = this.add.graphics();
    backdrop.fillStyle(COLORS.jungle, 1);
    backdrop.fillRect(0, 0, w, h);
    this.layer.add(backdrop);

    // The cards live in one container that moves as a unit when scrolling.
    const content = this.add.container(0, viewY - this.scrollY);
    this.content = content;
    for (const card of this.cards) {
      const selected = card.id === ctx.character;
      const cx = card.x + card.w / 2;
      const bg = this.add.graphics();
      bg.fillStyle(selected ? COLORS.sun : COLORS.leafLight, 1);
      bg.fillRoundedRect(card.x - 4, card.y - 4, card.w + 8, card.h + 8, 24);
      bg.fillStyle(selected ? COLORS.card : COLORS.leaf, 1);
      bg.fillRoundedRect(card.x, card.y, card.w, card.h, 20);
      content.add(bg);

      const nameSize = clamp(card.w * 0.15, 15, 26);
      const labelH = Math.round(nameSize * 1.5);
      const inner = card.h * 0.05;
      const bust = Math.min(card.w * 0.84, card.h - labelH - inner * 2);
      const character = new Character(this, cx, card.y + inner + bust / 2, card.id, bust);
      content.add(character);

      const name = text(this, card.name, selected ? CSS.ink : CSS.cream, { bold: true, size: nameSize }).setOrigin(0.5);
      name.setPosition(cx, card.y + card.h - labelH / 2 - inner * 0.6);
      content.add(name);

      if (selected) this.addCheck(content, card.x + card.w - 22, card.y + 22);
      if (card.id === this.justSelected) character.celebrate();
    }
    this.justSelected = null;
    this.layer.add(content);

    // Pinned header and footer sit on top of the scrolling cards and hide what scrolls under them.
    const bands = this.add.graphics();
    bands.fillStyle(COLORS.jungle, 1);
    bands.fillRect(0, 0, w, headerH);
    bands.fillRect(0, h - footerH, w, footerH);
    bands.fillStyle(COLORS.leaf, 1);
    bands.fillRect(0, headerH - 3, w, 3);
    bands.fillRect(0, h - footerH, w, 3);
    this.layer.add(bands);

    const title = text(this, 'BidaZoo', CSS.cream, { bold: true, size: titleSize }).setOrigin(0.5);
    title.setPosition(w / 2, pad * 0.8 + titleSize * 0.58);
    const sub = text(this, 'Choose your starter', CSS.mist, { size: subSize }).setOrigin(0.5);
    sub.setPosition(w / 2, title.y + titleSize * 0.58 + subSize * 0.75);
    this.layer.add([title, sub]);

    // Saved progress, as reported by the server.
    const totals = text(this, `XP ${ctx.totals.xp}   ·   Coins ${ctx.totals.coins}`, CSS.sun, { bold: true, size: totalsSize }).setOrigin(0.5);
    totals.setPosition(w / 2, h - footerH + pad * 0.5 + totalsSize * 0.75 + 3);
    this.layer.add(totals);

    // Start / Continue
    const btnW = Math.min(w - pad * 2, 520);
    const label = ctx.activeSessionId ? 'Continue Run' : 'Start Run';
    const start = new TapButton(this, 'start-run', w / 2, h - pad - btnH / 2, btnW, btnH, label, BUTTON_STYLES.primary, () => this.start(), 0.4);
    this.layer.add(start);
    this.startTarget = start.hitTarget();

    const indicator = this.add.graphics();
    this.indicator = indicator;
    this.layer.add(indicator);
    this.drawIndicator();
    this.publish();

    ctx.a11y.set(
      `BidaZoo. Choose your starter. ${characterName(ctx.character)} selected. XP ${ctx.totals.xp}, coins ${ctx.totals.coins}.`,
      [
        ...STARTERS.map((starter) => ({ id: `character-${starter.id}`, label: starter.name, onClick: () => this.select(starter.id) })),
        { id: 'start-run', label, onClick: () => this.start() },
      ],
    );
  }

  /** A check mark badge, so the selected card is clear without relying on color alone. */
  private addCheck(parent: Phaser.GameObjects.Container, x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.good, 1);
    g.fillCircle(x, y, 14);
    g.lineStyle(5, COLORS.ink, 1);
    g.beginPath();
    g.moveTo(x - 7, y);
    g.lineTo(x - 2, y + 6);
    g.lineTo(x + 8, y - 6);
    g.strokePath();
    parent.add(g);
  }

  /** Where every tap target is right now, for tests, debugging, and the page's data attributes. */
  private publish(): void {
    const ctx = getContext(this);
    const { y: viewY, h: viewH } = this.view;
    const targets: HitTarget[] = this.cards.map((card) => {
      const top = viewY + card.y - this.scrollY;
      const middle = top + card.h / 2;
      return {
        id: `character-${card.id}`,
        label: card.name,
        x: card.x,
        y: top,
        w: card.w,
        h: card.h,
        visible: middle >= viewY && middle <= viewY + viewH,
      };
    });
    if (this.startTarget) targets.push(this.startTarget);
    publishSurface(ctx.parent, 'menu', targets, {
      character: ctx.character,
      scroll: `${Math.round(this.scrollY)}/${this.maxScroll}`,
    });
  }
}
