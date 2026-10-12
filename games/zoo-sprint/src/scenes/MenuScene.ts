import Phaser from 'phaser';
import { ANIMALS, Animal, type AnimalKind } from '../animals';
import { getContext, saveAnimal } from '../context';
import { COLORS, CSS, FONT, clamp } from '../theme';
import { BUTTON_STYLES, TapButton, publishSurface, text, type HitTarget } from '../ui';

/** Choose Animal -> Start Run. Which animal is chosen is presentation only. */
export class MenuScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this));
  }

  private select(kind: AnimalKind): void {
    const ctx = getContext(this);
    ctx.animal = kind;
    saveAnimal(kind);
    this.render();
  }

  private start(): void {
    this.scene.start('RunScene');
  }

  private render(): void {
    const ctx = getContext(this);
    this.layer.removeAll(true);
    const { width: w, height: h } = this.scale;
    const colW = Math.min(w, 760);
    const colX = (w - colW) / 2;
    const pad = Math.max(12, Math.round(Math.min(w, h) * 0.035));
    const targets: HitTarget[] = [];

    const backdrop = this.add.graphics();
    backdrop.fillStyle(COLORS.jungle, 1);
    backdrop.fillRect(0, 0, w, h);
    backdrop.fillStyle(COLORS.leaf, 1);
    backdrop.fillCircle(w / 2, h * 0.04, Math.min(w, h) * 0.5);
    this.layer.add(backdrop);

    const title = text(this, 'BidaZoo', CSS.cream, { bold: true, size: clamp(h * 0.075, 30, 64) }).setOrigin(0.5);
    title.setPosition(w / 2, pad + h * 0.05);
    const sub = text(this, 'Choose your animal', CSS.mist, { size: clamp(h * 0.032, 16, 26) }).setOrigin(0.5);
    sub.setPosition(w / 2, title.y + h * 0.06);
    this.layer.add([title, sub]);

    // Three animal cards in a row.
    const gap = pad;
    const cardW = (colW - pad * 2 - gap * 2) / 3;
    const cardH = clamp(h * 0.3, 120, 260);
    const cardsTop = sub.y + h * 0.05;
    ANIMALS.forEach((animal, index) => {
      const cx = colX + pad + cardW / 2 + index * (cardW + gap);
      const cy = cardsTop + cardH / 2;
      const selected = ctx.animal === animal.kind;
      const card = this.add.graphics();
      card.fillStyle(selected ? COLORS.sun : COLORS.leafLight, 1);
      card.fillRoundedRect(cx - cardW / 2 - 4, cy - cardH / 2 - 4, cardW + 8, cardH + 8, 24);
      card.fillStyle(selected ? COLORS.card : COLORS.leaf, 1);
      card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 20);
      this.layer.add(card);
      const face = new Animal(this, cx, cy - cardH * 0.1, animal.kind, Math.min(cardW * 0.3, cardH * 0.28));
      this.layer.add(face);
      const name = text(this, animal.name, selected ? CSS.ink : CSS.cream, { bold: true, size: clamp(cardW * 0.17, 14, 24) }).setOrigin(0.5);
      name.setPosition(cx, cy + cardH * 0.32);
      this.layer.add(name);
      const hit = this.add.zone(cx, cy, cardW, cardH).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.select(animal.kind));
      this.layer.add(hit);
      targets.push({ id: `animal-${animal.kind}`, label: animal.name, x: cx - cardW / 2, y: cy - cardH / 2, w: cardW, h: cardH });
    });

    // Saved progress, as reported by the server.
    const totals = text(this, `XP ${ctx.totals.xp}   ·   Coins ${ctx.totals.coins}`, CSS.sun, {
      bold: true,
      size: clamp(h * 0.034, 16, 28),
    }).setOrigin(0.5);
    totals.setPosition(w / 2, cardsTop + cardH + h * 0.06);
    this.layer.add(totals);

    // Start / Continue
    const btnH = clamp(h * 0.13, 64, 120);
    const btnW = Math.min(colW - pad * 2, 520);
    const label = ctx.activeSessionId ? 'Continue Run' : 'Start Run';
    const start = new TapButton(this, 'start-run', w / 2, h - pad - btnH / 2, btnW, btnH, label, BUTTON_STYLES.primary, () => this.start(), 0.4);
    this.layer.add(start);
    targets.push(start.hitTarget());

    publishSurface(ctx.parent, 'menu', targets, { animal: ctx.animal });
    ctx.a11y.set(
      `BidaZoo. Choose your animal. ${ctx.animal} selected. XP ${ctx.totals.xp}, coins ${ctx.totals.coins}.`,
      [
        ...ANIMALS.map((animal) => ({ id: `animal-${animal.kind}`, label: animal.name, onClick: () => this.select(animal.kind) })),
        { id: 'start-run', label, onClick: () => this.start() },
      ],
    );
  }
}

export { FONT };
