import Phaser from 'phaser';
import type { Gear, GearItem } from '@bidazoo/contracts';
import { getContext } from '../../context';
import { coinIcon, parchmentPanel, pill } from '../../presentation/surfaces';
import { EXP, EXP_CSS } from '../../theme';
import { BUTTON_STYLES, TapButton, text, type HitTarget } from '../../ui';
import type { BasecampScene } from '../../scenes/BasecampScene';
import { gearPlatform, requestForTap, setCurrentGear } from './gear-client';
import { GEAR_LOOKS } from './gear-model';
import { drawGearIcon } from './gear-sprites';
import { outfitterLayout } from './outfitter-layout';

/**
 * The outfitter (Lane C item C3): opened from the lodge door through the Basecamp overlay registry.
 * Three rows (one per slot) of four item cards. A tap on a card buys the item (the SERVER's price,
 * debited by the server from its own coin totals), wears it, or takes it off. Every number shown
 * is the server's answer; nothing here decides a price, a balance or ownership.
 *
 * MINIMAL code-drawn version from the owner-confirmed art references (field-kit panels of
 * docs/visual/10-ui-component-style.md). Every string a child reads is PENDING owner approval
 * (REPORT.md "Copy (PENDING)").
 *
 * The returned container emits 'close' just before it destroys itself (the scene can then restore
 * its own accessibility actions). Page hooks for tests: `data-outfitter` ("loading", "open",
 * "closed", "unavailable") and `data-outfitter-targets` (the card and close rectangles).
 */

export const OUTFITTER_COPY = {
  title: 'Outfitter',
  slots: { hat: 'Hats', scarf: 'Scarves', stick: 'Trail Sticks' } as Record<string, string>,
  owned: 'Owned',
  wearing: 'Wearing',
  close: 'Close',
  loading: 'Opening the outfitter...',
  unavailable: 'The outfitter is closed right now. Come back soon!',
  notEnough: 'Not enough coins yet. Play a run to earn more!',
  failed: 'That did not work. Please try again.',
  status: (coins: number) => `Outfitter. You have ${coins} coins. Tap an item to buy it, wear it, or take it off.`,
  buyLabel: (name: string, price: number) => `Buy ${name} for ${price} coins`,
  wearLabel: (name: string) => `Wear ${name}`,
  takeOffLabel: (name: string) => `Take off ${name}`,
  closeLabel: 'Close the outfitter',
} as const;

const SLOT_ORDER = ['hat', 'scarf', 'stick'];

export function openOutfitter(scene: BasecampScene): Phaser.GameObjects.Container {
  return new OutfitterOverlay(scene);
}

class OutfitterOverlay extends Phaser.GameObjects.Container {
  private gear: Gear | null = null;
  private busy = false;
  private message = '';
  private readonly content: Phaser.GameObjects.Container;
  private targets: HitTarget[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setDepth(1000).setScrollFactor(0);
    // With a scrolling world camera and a HUD camera, draw the overlay on the HUD camera only.
    const cams = scene.cameras.cameras;
    if (cams.length > 1) scene.cameras.main.ignore(this);
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    scene.add.existing(this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.scale.off(Phaser.Scale.Events.RESIZE, this.render, this));
    this.render();
    void this.load();
  }

  private get ctx() {
    return getContext(this.scene);
  }

  private async load(): Promise<void> {
    const api = gearPlatform(this.ctx.platform);
    if (!api) {
      this.message = OUTFITTER_COPY.unavailable;
      this.render();
      return;
    }
    try {
      this.accept(await api.getGear());
    } catch {
      this.message = OUTFITTER_COPY.unavailable;
    }
    if (this.active) this.render();
  }

  private accept(gear: Gear): void {
    this.gear = gear;
    setCurrentGear(gear);
    // a copy of the server's balance for the HUD (the server already debited it)
    this.ctx.totals = { ...this.ctx.totals, coins: gear.coins };
  }

  private async tap(itemId: string): Promise<void> {
    const api = gearPlatform(this.ctx.platform);
    if (!api || !this.gear || this.busy) return;
    const request = requestForTap(this.gear, itemId);
    if (!request) return;
    this.busy = true;
    this.message = '';
    try {
      this.accept(await api.updateGear(request));
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      this.message = status === 409 ? OUTFITTER_COPY.notEnough : OUTFITTER_COPY.failed;
    }
    this.busy = false;
    if (this.active) this.render();
  }

  close(): void {
    if (!this.active) return;
    this.ctx.parent.setAttribute('data-outfitter', 'closed');
    this.ctx.parent.setAttribute('data-outfitter-targets', '[]');
    this.emit('close');
    this.destroy();
  }

  private render(): void {
    if (!this.active) return;
    const scene = this.scene;
    this.content.removeAll(true);
    this.targets = [];
    const w = scene.scale.width;
    const h = scene.scale.height;

    // dim the world and swallow taps so the buddy does not walk behind the overlay
    const dim = scene.add.rectangle(0, 0, w, h, 0x0b2233, 0.55).setOrigin(0, 0).setInteractive();
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) =>
      event.stopPropagation(),
    );
    this.content.add(dim);

    // one pure layout for every view (owner bug 4, November 10, 2026: a phone on its side squeezed the
    // cards under the tap floor); the overlay only draws what it says
    const rows = SLOT_ORDER.map((slot) => ({ slot, items: this.gear?.catalog.filter((i) => i.slot === slot) ?? [] })).filter((r) => r.items.length > 0);
    const L = outfitterLayout(w, h, rows.length > 0 ? rows.map((r) => r.items.length) : [4, 4, 4]);
    const { panel: P, pad } = L;
    const g = scene.add.graphics();
    parchmentPanel(g, P);
    this.content.add(g);

    this.content.add(text(scene, OUTFITTER_COPY.title, EXP_CSS.navy, { weight: 800, size: L.title.size }).setOrigin(0, 0.5).setPosition(L.title.x, L.title.y));

    // the coin balance (the server's number)
    const coins = this.gear?.coins ?? this.ctx.totals.coins;
    const pillBox = L.coinPill;
    const pg = scene.add.graphics();
    pill(pg, pillBox, EXP.timber, EXP.timberDeep);
    coinIcon(pg, pillBox.x + pillBox.h * 0.55, pillBox.y + pillBox.h / 2, pillBox.h * 0.3);
    this.content.add(pg);
    this.content.add(
      text(scene, String(coins), EXP_CSS.white, { weight: 800, size: Math.round(pillBox.h * 0.55) })
        .setOrigin(0.5)
        .setPosition(pillBox.x + pillBox.w * 0.6, pillBox.y + pillBox.h / 2),
    );

    const close = new TapButton(scene, 'outfitter-close', L.close.x + L.close.w / 2, L.close.y + L.close.h / 2, L.close.w, L.close.h, OUTFITTER_COPY.close, BUTTON_STYLES.primary, () => this.close());
    this.content.add(close);
    this.targets.push({ ...close.hitTarget(), label: OUTFITTER_COPY.closeLabel });

    const status = this.gear ? '' : this.message || OUTFITTER_COPY.loading;
    this.content.add(
      text(scene, this.gear ? this.message : '', EXP_CSS.navy, { weight: 700, size: Math.round(L.message.h * 0.7), align: 'center', wrapWidth: L.message.w })
        .setOrigin(0.5)
        .setPosition(L.message.x + L.message.w / 2, L.message.y + L.message.h / 2),
    );

    if (!this.gear) {
      this.content.add(
        text(scene, status, EXP_CSS.navy, { weight: 700, size: Math.round(Math.max(16, P.h * 0.04)), align: 'center', wrapWidth: P.w - pad * 2 })
          .setOrigin(0.5)
          .setPosition(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h / 2),
      );
      this.content.setScrollFactor(0, 0, true);
      this.publish(this.message ? 'unavailable' : 'loading', status);
      return;
    }

    rows.forEach((row, ri) => {
      const block = L.blocks[ri]!;
      this.content.add(
        text(scene, OUTFITTER_COPY.slots[row.slot] ?? row.slot, EXP_CSS.navy, { weight: 800, size: Math.round(block.label.h * 0.85) })
          .setOrigin(0, 0)
          .setPosition(block.label.x, block.label.y),
      );
      row.items.forEach((item, ci) => {
        const r = block.cards[ci]!;
        this.card(item, r.x, r.y, r.w, r.h);
      });
    });
    this.content.setScrollFactor(0, 0, true);
    this.publish('open', OUTFITTER_COPY.status(this.gear.coins) + (this.message ? ` ${this.message}` : ''));
  }

  private card(item: GearItem, x: number, y: number, w: number, h: number): void {
    const scene = this.scene;
    const gear = this.gear!;
    const owned = gear.owned.includes(item.id);
    const wearing = gear.equipped.includes(item.id);
    const affordable = owned || gear.coins >= item.price;
    const g = scene.add.graphics();
    const radius = Math.min(14, h * 0.12);
    g.fillStyle(wearing ? EXP.greenDeep : EXP.parchmentEdge, 1);
    g.fillRoundedRect(x, y, w, h, radius);
    g.fillStyle(affordable ? EXP.canvas : EXP.dim, 1);
    g.fillRoundedRect(x + 3, y + 3, w - 6, h - 6, Math.max(3, radius - 3));
    const look = GEAR_LOOKS[item.id];
    const iconBox = { x: x + w * 0.15, y: y + h * 0.06, w: w * 0.7, h: h * 0.5 };
    if (look) drawGearIcon(g, look, iconBox);
    this.content.add(g);

    const nameSize = Math.round(Math.max(11, Math.min(18, h * 0.12, (w * 1.6) / Math.max(6, item.name.length))));
    this.content.add(
      text(scene, item.name, EXP_CSS.navy, { weight: 700, size: nameSize, align: 'center', wrapWidth: w - 8 })
        .setOrigin(0.5, 0)
        .setPosition(x + w / 2, y + h * 0.58),
    );
    const footY = y + h * 0.86;
    if (owned) {
      this.content.add(
        text(scene, wearing ? OUTFITTER_COPY.wearing : OUTFITTER_COPY.owned, wearing ? EXP_CSS.greenDeep : EXP_CSS.navy, { weight: 800, size: nameSize })
          .setOrigin(0.5)
          .setPosition(x + w / 2, footY),
      );
    } else {
      const cg = scene.add.graphics();
      coinIcon(cg, x + w / 2 - nameSize * 1.1, footY, nameSize * 0.45);
      this.content.add(cg);
      this.content.add(
        text(scene, String(item.price), EXP_CSS.navy, { weight: 800, size: nameSize }).setOrigin(0, 0.5).setPosition(x + w / 2 - nameSize * 0.45, footY),
      );
    }

    const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    zone.on('pointerup', () => void this.tap(item.id));
    this.content.add(zone);
    const label = wearing
      ? OUTFITTER_COPY.takeOffLabel(item.name)
      : owned
        ? OUTFITTER_COPY.wearLabel(item.name)
        : OUTFITTER_COPY.buyLabel(item.name, item.price);
    this.targets.push({ id: `outfitter-${item.id}`, label, x, y, w, h });
  }

  private publish(state: string, status: string): void {
    const ctx = this.ctx;
    ctx.parent.setAttribute('data-outfitter', state);
    ctx.parent.setAttribute(
      'data-outfitter-targets',
      JSON.stringify(this.targets.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) }))),
    );
    ctx.a11y.set(
      status,
      this.targets.map((t) => ({
        id: t.id,
        label: t.label,
        onClick: () => (t.id === 'outfitter-close' ? this.close() : void this.tap(t.id.slice('outfitter-'.length))),
      })),
    );
  }
}
