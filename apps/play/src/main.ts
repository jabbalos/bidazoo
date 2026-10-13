import './styles.css';
import { zooSprint } from '@bidazoo/zoo-sprint';
import { ACCOUNT_PAGE_PATH, ApiPaths } from '@bidazoo/contracts/paths';
import { createHttpPlatform } from './platform';

/**
 * The shell: finds the page element and hands the game a platform to talk to.
 * No game logic, no state, and no secrets live here.
 *
 * One extra thing: when family accounts exist on this server, a slim "Family" link to the
 * account page sits under the game. The probe is a plain GET of the device state, and only its
 * status is read: 404 means identity is switched off (no link, nothing changes for guests),
 * 401 or 200 means it is on. Any failure or timeout means no link; the game never waits long.
 */
async function identityIsAvailable(): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 1500);
  try {
    const response = await fetch(ApiPaths.device, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal });
    return response.status === 401 || response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const parent = document.getElementById('game');
  if (!parent) throw new Error('#game element is missing');
  if (await identityIsAvailable()) {
    const link = document.createElement('a');
    link.href = ACCOUNT_PAGE_PATH;
    link.id = 'family-link';
    link.textContent = 'Family & devices';
    document.body.append(link);
    document.body.classList.add('has-family');
  }
  zooSprint.mount({ parent, platform: createHttpPlatform() });
}

void main();
