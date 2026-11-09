import type Phaser from 'phaser';

/**
 * Parallax bookkeeping shared by BasecampScene and ExpeditionScene (extracted from BasecampScene):
 * each tiling layer scrolls at `factor` x the camera's scroll. PRESENTATION ONLY.
 */
export class ParallaxLayers {
  private tiles: Array<{ sprite: Phaser.GameObjects.TileSprite; factor: number }> = [];

  add(sprite: Phaser.GameObjects.TileSprite, factor: number): void {
    this.tiles.push({ sprite, factor });
  }

  clear(): void {
    this.tiles = [];
  }

  get count(): number {
    return this.tiles.length;
  }

  update(scrollX: number): void {
    for (const t of this.tiles) t.sprite.tilePositionX = scrollX * t.factor;
  }
}
