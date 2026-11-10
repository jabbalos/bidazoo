import { registerOverlay } from '../overlays';
import { openOutfitter } from './OutfitterOverlay';

/**
 * Lane C item C3: registers the outfitter at the lodge door. Importing this module once at startup
 * is the whole wiring (a cross-lane change request: one `import './basecamp/outfitter';` line).
 */
registerOverlay('outfitter', { hotspot: 'lodge-door', open: openOutfitter });

export { OUTFITTER_COPY, openOutfitter } from './OutfitterOverlay';
export { currentGear, equippedGear, gearPlatform, loadGear, onGearChange, requestForTap, setCurrentGear } from './gear-client';
export type { GearPlatform } from './gear-client';
export { GEAR_ANCHORS, GEAR_LOOKS, SKIPPED, gearPlacements, overlaps } from './gear-model';
export type { FracRect, GearLook, GearPlacement, GearSlotId, GearView, LockedFeature, ViewAnchors } from './gear-model';
export { buildGearLayer, drawGearIcon, drawPlacement, syncGearLayer } from './gear-sprites';
export type { PictureBox } from './gear-sprites';
