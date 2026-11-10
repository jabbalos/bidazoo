import { describe, expect, it } from 'vitest';
import { expeditionMixEnabled } from '../../apps/api/src/modules/sessions/imported-bank';

/**
 * Owner decision (November 9, 2026): the expedition question mix stays OFF in any deploy until text-choice
 * tiles (A9) are merged and a Playwright test shows a child can see and answer a text question. Production
 * runs with NODE_ENV=production, so the mix is off there unless EXPEDITION_MIX turns it on explicitly.
 */
describe('expedition mix switch', () => {
  it('is off in production by default', () => {
    expect(expeditionMixEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is on in development and test by default (where the mix is built and tested)', () => {
    expect(expeditionMixEnabled({})).toBe(true);
    expect(expeditionMixEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(expeditionMixEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('EXPEDITION_MIX decides when it is set, in any environment', () => {
    expect(expeditionMixEnabled({ NODE_ENV: 'production', EXPEDITION_MIX: '1' })).toBe(true);
    expect(expeditionMixEnabled({ NODE_ENV: 'production', EXPEDITION_MIX: 'true' })).toBe(true);
    expect(expeditionMixEnabled({ NODE_ENV: 'development', EXPEDITION_MIX: '0' })).toBe(false);
    expect(expeditionMixEnabled({ NODE_ENV: 'test', EXPEDITION_MIX: 'FALSE' })).toBe(false);
  });

  it('an unrecognized EXPEDITION_MIX value falls back to the environment default', () => {
    expect(expeditionMixEnabled({ NODE_ENV: 'production', EXPEDITION_MIX: 'yes' })).toBe(false);
    expect(expeditionMixEnabled({ NODE_ENV: 'test', EXPEDITION_MIX: '' })).toBe(true);
  });
});
