/**
 * The one place the API reaches the level curve (item C4).
 *
 * learning-core's index does not export `progression` yet (a cross-lane change request). Until the
 * orchestrator adds that export line, this file imports it by path. After the export exists, replace
 * the line below with: `export { levelForXp, levelUpBetween } from '@bidazoo/learning-core';`
 */
export { levelForXp, levelUpBetween } from '../../../../../packages/learning-core/src/progression';
