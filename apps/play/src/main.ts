import './styles.css';
import { zooSprint } from '@bidazoo/zoo-sprint';
import { createHttpPlatform } from './platform';

/**
 * The shell: finds the page element and hands the game a platform to talk to.
 * No game logic, no state, and no secrets live here.
 */
const parent = document.getElementById('game');
if (!parent) throw new Error('#game element is missing');

zooSprint.mount({ parent, platform: createHttpPlatform() });
