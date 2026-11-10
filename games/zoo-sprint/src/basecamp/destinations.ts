import { parseDestinationManifest, type DestinationManifest } from '../presentation/destination-model';

/**
 * Destination manifests, shipped as data: one folder per destination under
 * `assets/world-expedition/destinations/<id>/manifest.json`. Vite emits exactly the manifests that
 * exist; a manifest that fails validation is left out (the map board never shows a broken tile).
 * Presentation only.
 */
const RAW = import.meta.glob<unknown>('../../assets/world-expedition/destinations/*/manifest.json', { eager: true, import: 'default' });

let cache: DestinationManifest[] | undefined;

/** Every valid manifest, in map-board order. */
export function allDestinations(): DestinationManifest[] {
  cache ??= Object.values(RAW)
    .map((raw) => parseDestinationManifest(raw))
    .filter((m): m is DestinationManifest => m !== null)
    .sort((a, b) => a.order - b.order);
  return cache;
}

export function destinationById(id: string): DestinationManifest | null {
  return allDestinations().find((m) => m.id === id) ?? null;
}
