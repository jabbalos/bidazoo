import { expect, test, type Page } from '@playwright/test';
import { sceneOf } from './basecamp-helpers';

/**
 * Shared driving code for the World Expedition browser tests (QA blockers and the whole loop).
 *
 * Everything read here is presentation state the game publishes on #game and in the accessibility
 * mirror; nothing is decided or computed from server data. Taps are REAL input: a touch on the
 * phone and tablet projects (`hasTouch`), a mouse click on the desktop project, at the centre of a
 * rectangle the game itself published (`data-hit-targets`, `data-outfitter-targets`, `data-map-tiles`).
 * The test knows a multiplication answer because it can multiply; a text (imported) question is
 * answered with the first choice, so the loop never depends on an answer key.
 */

export { sceneOf };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Target extends Rect {
  id: string;
  label: string;
  visible?: boolean;
}
export interface MapTile extends Rect {
  id: string;
  unlocked: boolean;
}

export const game = (page: Page) => page.locator('#game');
export const attr = async (page: Page, name: string): Promise<string> => (await game(page).getAttribute(`data-${name}`)) ?? '';
export const num = async (page: Page, name: string): Promise<number> => Number((await attr(page, name)) || 'NaN');
export const rectOf = async (page: Page, name: string): Promise<Rect | null> => JSON.parse((await attr(page, name)) || 'null') as Rect | null;
export const targets = async (page: Page, attrName = 'hit-targets'): Promise<Target[]> => JSON.parse((await attr(page, attrName)) || '[]') as Target[];
export const mapTiles = async (page: Page): Promise<MapTile[]> => JSON.parse((await attr(page, 'map-tiles')) || '[]') as MapTile[];
export const action = (page: Page, id: string) => page.locator(`#bz-a11y button[data-action="${id}"]`);
export const statusText = async (page: Page): Promise<string> => (await page.locator('#bz-a11y [role="status"]').textContent()) ?? '';
export const viewport = (page: Page) => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

/**
 * The project's portrait and landscape sizes, from the Playwright project itself (never read from a
 * page before it has loaded: on a mobile context about:blank reports Chromium's 980 px fallback).
 */
export function orientations(): { portrait: { w: number; h: number }; landscape: { w: number; h: number } } {
  const v = test.info().project.use.viewport;
  if (!v) throw new Error('the project has no viewport');
  const portrait = v.height >= v.width ? { w: v.width, h: v.height } : { w: v.height, h: v.width };
  return { portrait, landscape: { w: portrait.h, h: portrait.w } };
}

/** Touch on the touch projects, mouse on the desktop one; decided by the project only (see play.spec.ts). */
function tapMode(): 'touch' | 'mouse' {
  return test.info().project.use.hasTouch === true ? 'touch' : 'mouse';
}

export async function tapAt(page: Page, x: number, y: number): Promise<void> {
  if (tapMode() === 'touch') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** A real tap at the centre of a rectangle given in canvas CSS pixels (top-left x/y). */
export async function tapRect(page: Page, r: Rect): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  expect(box, 'the game canvas').toBeTruthy();
  await tapAt(page, box!.x + r.x + r.w / 2, box!.y + r.y + r.h / 2);
}

/**
 * A real tap just inside the TOP-LEFT corner of a rectangle. For the "continue" area of a timed
 * moment: its centre can sit over an answer tile of the question that follows (the layout changes
 * with the question), while the corner is the card or the frame in every layout.
 */
export async function tapCorner(page: Page, r: Rect): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  expect(box, 'the game canvas').toBeTruthy();
  await tapAt(page, box!.x + r.x + Math.min(24, r.w / 2), box!.y + r.y + Math.min(24, r.h / 2));
}

/** A real tap on a published target (`data-hit-targets` by default, or another published list). */
export async function tap(page: Page, id: string, attrName = 'hit-targets'): Promise<void> {
  const all = await targets(page, attrName);
  const t = all.find((x) => x.id === id);
  expect(t, `target ${id} in ${attrName} (have: ${all.map((x) => x.id).join(', ')})`).toBeTruthy();
  await tapRect(page, t!);
}

/**
 * Diagnostics installed before the page loads: a count of every requestAnimationFrame callback the
 * page runs (Phaser asks for one per frame, so a count that stops rising means its loop stopped)
 * and a log of the page-visibility and focus events the game reacts to.
 */
async function installLoopProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __rafCount: number; __pageEvents: string[] };
    w.__rafCount = 0;
    w.__pageEvents = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
      raf((t) => {
        w.__rafCount += 1;
        cb(t);
      });
    for (const name of ['visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume']) {
      document.addEventListener(name, () => w.__pageEvents.push(`${Math.round(performance.now())} ${name} ${document.visibilityState}`));
    }
    for (const name of ['blur', 'focus', 'resize', 'orientationchange']) {
      window.addEventListener(name, () => w.__pageEvents.push(`${Math.round(performance.now())} ${name}`));
    }
    document.addEventListener('webglcontextlost', () => w.__pageEvents.push(`${Math.round(performance.now())} webglcontextlost`), true);
    for (const name of ['keydown', 'keyup'] as const) {
      window.addEventListener(name, (e) => w.__pageEvents.push(`${Math.round(performance.now())} ${name} ${(e as KeyboardEvent).key}${(e as KeyboardEvent).repeat ? ' repeat' : ''}`), true);
    }
    document.addEventListener('webglcontextrestored', () => w.__pageEvents.push(`${Math.round(performance.now())} webglcontextrestored`), true);
  });
}

/** Menu: choose a starter, then "Choose" opens Expedition Basecamp. */
export async function bootToBasecamp(page: Page, starter = 'dino'): Promise<void> {
  await installLoopProbe(page);
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();
  await expect.poll(() => sceneOf(page)).toBe('menu');
  await tap(page, `character-${starter}`);
  await expect(game(page)).toHaveAttribute('data-character', starter);
  await tap(page, 'start-run');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
  await expect(game(page)).toHaveAttribute('data-buddy-rect', /\{/);
}

/** One short key press: a small step, so a stop lands close to where a band began. */
export async function pulse(page: Page, key: 'ArrowLeft' | 'ArrowRight', ms = 60): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * The same short press, timed INSIDE the page. A press sent from the test crosses the automation
 * channel twice, and under load the release has been seen to reach the page two seconds after the
 * press (the game walked a whole screen on a "20 ms" pulse). A press whose release is a page timer
 * is processed by the game within a frame of the press, so one step is bounded whatever the load.
 * Used for travel only; the interactions under test stay real taps.
 */
export async function pulseInPage(page: Page, key: 'ArrowLeft' | 'ArrowRight', ms = 40): Promise<void> {
  await page.evaluate(
    ([k, hold]) =>
      new Promise<void>((resolve) => {
        const keyCode = k === 'ArrowRight' ? 39 : 37;
        const make = (type: string): KeyboardEvent => new KeyboardEvent(type, { key: k, code: k, keyCode, which: keyCode, bubbles: true, cancelable: true } as KeyboardEventInit);
        window.dispatchEvent(make('keydown'));
        window.setTimeout(() => {
          window.dispatchEvent(make('keyup'));
          resolve();
        }, hold);
      }),
    [key, ms] as const,
  );
}

/**
 * Walks until `data-near` names the landmark or hotspot. For a hotspot the scene publishes its
 * position (`data-hotspots`), so the walk heads for a point a little BEFORE it, in pulses that get
 * shorter as it closes in, and waits for the buddy to stand still before deciding the next step. A
 * key pulse is not a fixed distance: under load the key-up reaches the page late and one pulse can
 * carry the buddy hundreds of pixels, and on a wide view the map board's band ends a few pixels
 * before the gate opening, where standing still starts a run. Aiming short and correcting back keeps
 * an overshoot inside the band or in the gate's outer ring, never in its opening. Fails if Basecamp
 * is left on the way.
 */
export async function walkUntilNear(page: Page, id: string, key: 'ArrowLeft' | 'ArrowRight' = 'ArrowRight', maxPulses = 400): Promise<void> {
  const places = JSON.parse((await attr(page, 'hotspots')) || '[]') as Array<{ id: string; x: number }>;
  const radius = Number((await attr(page, 'hotspot-radius')) || '0');
  const centre = places.find((p) => p.id === id)?.x ?? null;
  // the approach point: short of the centre on the side we come from, so an overshoot lands near the centre
  const x0 = await num(page, 'player-x');
  const target = centre === null ? null : centre + (x0 <= centre ? -1 : 1) * radius * 0.45;
  for (let i = 0; i < maxPulses; i++) {
    const near = await attr(page, 'near');
    if (near === id) return;
    const scene = await sceneOf(page);
    if (scene !== 'basecamp') {
      const events = await page.evaluate(() => ((window as unknown as { __pageEvents?: string[] }).__pageEvents ?? []).filter((e) => /key/.test(e)).slice(-16));
      throw new Error(`left Basecamp (${scene}) before reaching ${id}; last key events seen by the page: ${events.join(' | ')}`);
    }
    if (near === 'gate' && id !== 'gate') {
      // between the band and the gate opening: step back out at once, before the portal can fill
      await pulseInPage(page, 'ArrowLeft', 40);
      await waitUntilStill(page, 200);
      continue;
    }
    if (target === null) {
      await pulseInPage(page, key, 60);
      continue;
    }
    const x = await num(page, 'player-x');
    const gap = Math.abs(target - x);
    const toward: 'ArrowLeft' | 'ArrowRight' = x < target ? 'ArrowRight' : 'ArrowLeft';
    const ms = gap > 400 ? 120 : gap > 160 ? 60 : 30;
    if (i % 5 === 0 || gap <= 160) console.log(`[walk] to ${id}@${centre} (aim ${Math.round(target ?? 0)}): x=${x} near=${near} pulse ${toward} ${ms}ms`);
    await pulseInPage(page, toward, ms);
    await waitUntilStill(page, gap > 400 ? 120 : 250);
  }
  throw new Error(`never got near ${id}`);
}

/** Resolves once `data-player-x` has stopped changing (two readings `everyMs` apart agree). */
export async function waitUntilStill(page: Page, everyMs = 500): Promise<number> {
  let last = await num(page, 'player-x');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(everyMs);
    const now = await num(page, 'player-x');
    if (now === last) return now;
    last = now;
  }
  throw new Error('the buddy never came to a stop');
}

// ---------------------------------------------------------------------------
// Layout checks (the same on every screen)
// ---------------------------------------------------------------------------

/**
 * The canvas is exactly the viewport (the `expected` size when given) and the page does not scroll.
 * The first thing a broken layout loses. Window and canvas are read in the same evaluation, so a
 * viewport that is still changing cannot be compared against a canvas that already followed it.
 */
export async function expectCanvasFillsViewport(page: Page, expected?: { w: number; h: number }): Promise<void> {
  const read = () =>
    page.evaluate(() => {
      const c = document.querySelector('#game canvas');
      const r = c?.getBoundingClientRect();
      return { win: `${window.innerWidth}x${window.innerHeight}`, canvas: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'none' };
    });
  await expect
    .poll(
      async () => {
        const m = await read();
        return m.win === m.canvas && (!expected || m.win === `${expected.w}x${expected.h}`) ? 'ok' : `window ${m.win}, canvas ${m.canvas}`;
      },
      { timeout: 10_000, message: `the canvas takes the size of the viewport${expected ? ` (${expected.w}x${expected.h})` : ''}` },
    )
    .toBe('ok');
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(m.sh, 'no vertical page scroll').toBeLessThanOrEqual(m.ih);
  expect(m.sw, 'no horizontal page scroll').toBeLessThanOrEqual(m.iw);
}

export function expectRectOnScreen(r: Rect | null, vp: { w: number; h: number }, what: string, slack = 2): void {
  expect(r, what).toBeTruthy();
  expect(r!.w, `${what} width`).toBeGreaterThan(0);
  expect(r!.h, `${what} height`).toBeGreaterThan(0);
  expect(r!.x, `${what} left edge`).toBeGreaterThanOrEqual(-slack);
  expect(r!.x + r!.w, `${what} right edge`).toBeLessThanOrEqual(vp.w + slack);
  expect(r!.y, `${what} top edge`).toBeGreaterThanOrEqual(-slack);
  expect(r!.y + r!.h, `${what} bottom edge`).toBeLessThanOrEqual(vp.h + slack);
}

/** Every published target that passes `pick` is on screen and at least 44 px tall and wide. */
export async function expectTargetsOnScreen(page: Page, pick: (id: string) => boolean, attrName = 'hit-targets'): Promise<void> {
  const vp = await viewport(page);
  const all = (await targets(page, attrName)).filter((t) => pick(t.id) && t.visible !== false);
  expect(all.length, `targets in ${attrName}`).toBeGreaterThan(0);
  for (const t of all) {
    expectRectOnScreen(t, vp, t.id);
    expect(t.w, `${t.id} tap width`).toBeGreaterThanOrEqual(44);
    expect(t.h, `${t.id} tap height`).toBeGreaterThanOrEqual(44);
  }
}

/** Turns the device: the viewport becomes `w` x `h`, and the game must follow before this resolves. */
export async function rotateTo(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  try {
    await expectCanvasFillsViewport(page, { w, h });
  } catch (error) {
    // Phaser resizes its canvas from its own frame loop, so a canvas that never follows the window
    // means either the browser stopped painting frames or the game's loop stopped. Say which.
    const diag = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const t0 = performance.now();
          const probe = window as unknown as { __rafCount?: number; __pageEvents?: string[] };
          const rafBefore = probe.__rafCount ?? -1;
          let fired = false;
          requestAnimationFrame(() => {
            fired = true;
          });
          setTimeout(() => {
            const g = document.getElementById('game');
            const c = document.querySelector('#game canvas') as HTMLCanvasElement | null;
            const phaser = (g as (HTMLElement & { __phaser?: { loop: { frame: number; running: boolean }; scale: { parentSize: { width: number; height: number }; dirty: boolean; width: number; height: number; getParentBounds(): boolean }; renderer: { width: number; height: number; contextLost?: boolean } } }) | null)?.__phaser;
            resolve(
              JSON.stringify({
                phaser: phaser
                  ? {
                      frame: phaser.loop.frame,
                      running: phaser.loop.running,
                      parentSize: `${phaser.scale.parentSize.width}x${phaser.scale.parentSize.height}`,
                      dirty: phaser.scale.dirty,
                      scaleSize: `${phaser.scale.width}x${phaser.scale.height}`,
                      renderer: `${phaser.renderer.width}x${phaser.renderer.height}`,
                      contextLost: phaser.renderer.contextLost ?? null,
                      parentBoundsChangedNow: phaser.scale.getParentBounds(),
                    }
                  : null,
                watchdog: { scaleRefreshes: g?.dataset['scaleRefreshes'] ?? '', loopRestarts: g?.dataset['loopRestarts'] ?? '' },
                visibility: document.visibilityState,
                hasFocus: document.hasFocus(),
                rafFiredWithin1500ms: fired,
                pageRafCallbacksIn1500ms: (probe.__rafCount ?? -1) - rafBefore,
                pageEvents: (probe.__pageEvents ?? []).slice(-12),
                sinceProbe: Math.round(performance.now() - t0),
                window: `${window.innerWidth}x${window.innerHeight}`,
                game: g ? `${g.clientWidth}x${g.clientHeight}` : 'none',
                canvasAttr: c ? `${c.width}x${c.height}` : 'none',
                canvasCss: c ? `${c.style.width}|${c.style.height}` : 'none',
              }),
            );
          }, 1500);
        }),
    );
    throw new Error(`${(error as Error).message}
[rotation diagnostic] ${diag}`);
  }
  await page.waitForTimeout(400); // the scenes rebuild on the resize event
  const healed = await page.evaluate(() => {
    const d = (document.getElementById('game') as HTMLElement).dataset;
    return { scaleRefreshes: d['scaleRefreshes'] ?? '', loopRestarts: d['loopRestarts'] ?? '', last: d['scaleRefreshLast'] ?? '' };
  });
  if (healed.scaleRefreshes || healed.loopRestarts) console.log(`[rotation] the game's watchdog acted: ${JSON.stringify(healed)} (${w}x${h})`);
}

// ---------------------------------------------------------------------------
// Questions: the Zoo Sprint run (RunScene) and the expedition encounter (EncounterOverlay)
// ---------------------------------------------------------------------------

export interface Answered {
  questionId: string;
  prompt: string;
  /** True when the test knew the answer (a multiplication prompt). */
  known: boolean;
}

/**
 * Answers the question on screen with a real tap on an answer tile. A multiplication prompt gets its
 * product; anything else (an imported text item) gets the first choice. Waits until the game has
 * left this question (phase or question id changed) so the same tile is never tapped twice.
 */
export async function answerQuestion(page: Page, where: 'run' | 'encounter'): Promise<Answered> {
  const phaseAttr = where === 'run' ? 'phase' : 'encounter';
  await expect.poll(() => attr(page, phaseAttr), { timeout: 90_000 }).toBe('question');
  const questionId = await attr(page, 'question-id');
  const prompt = await statusText(page);
  const choices = await page.locator('#bz-a11y button[data-action^="answer-"]').allTextContents();
  expect(choices.length, `answer choices for "${prompt}"`).toBeGreaterThanOrEqual(3);
  const m = /(\d+)\s*[×x]\s*(\d+)/.exec(prompt);
  let index = 0;
  let known = false;
  if (m) {
    const product = String(Number(m[1]) * Number(m[2]));
    const at = choices.indexOf(product);
    if (at >= 0) {
      index = at;
      known = true;
    }
  }
  await tap(page, `answer-${index}`);
  await expect
    .poll(async () => (await attr(page, phaseAttr)) !== 'question' || (await attr(page, 'question-id')) !== questionId, { timeout: 30_000 })
    .toBe(true);
  return { questionId, prompt, known };
}

/** Plays the gate run (RunScene) to its results screen. Returns how many answers the test knew. */
export async function playRunToResults(page: Page): Promise<{ answered: number; known: number }> {
  let answered = 0;
  let known = 0;
  for (let i = 0; i < 12 && (await sceneOf(page)) !== 'results'; i++) {
    await expect.poll(async () => (await sceneOf(page)) === 'results' || (await attr(page, 'phase')) === 'question', { timeout: 90_000 }).toBe(true);
    if ((await sceneOf(page)) === 'results') break;
    const a = await answerQuestion(page, 'run');
    answered += 1;
    if (a.known) known += 1;
  }
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('results');
  return { answered, known };
}

/**
 * Drives one encounter overlay from its first moment to its close. Timed moments (the intro, a
 * grade, the last stand, the end) are skipped with a real tap on the published "continue" area
 * when they are still on screen; otherwise they time out by themselves.
 */
export async function finishEncounter(page: Page): Promise<{ asked: number; known: number; result: string }> {
  let asked = 0;
  let known = 0;
  const started = Date.now();
  // the previous encounter leaves "closed" behind; wait for this one to publish a moment of its own
  await expect.poll(() => attr(page, 'encounter'), { timeout: 60_000 }).toMatch(/^(intro|loading|question|submitting|feedback|lastStand|won|lost|error)$/);
  for (;;) {
    if (Date.now() - started > 300_000) throw new Error('the encounter did not end within five minutes');
    const phase = await attr(page, 'encounter');
    if (phase === 'closed' || phase === '') break;
    if (phase === 'question') {
      const a = await answerQuestion(page, 'encounter');
      asked += 1;
      if (a.known) known += 1;
      continue;
    }
    if (phase === 'error') {
      await tap(page, 'retry');
      await page.waitForTimeout(300);
      continue;
    }
    if (phase === 'intro' || phase === 'lastStand' || phase === 'won' || phase === 'lost') {
      // a whole-screen moment: a real tap at the top-left corner skips it. Should the moment end
      // between the read and the tap, that corner is the status bar of the next question, never a tile.
      const t = (await targets(page)).find((x) => x.id === 'continue');
      if (t && (await attr(page, 'encounter')) === phase) await tapAt(page, 8, 8);
      await page.waitForTimeout(150);
      continue;
    }
    if (phase === 'feedback') {
      // a grade is shown for one to two seconds and moves on by itself. It is NOT tapped away: its
      // tap area sits where the next question's tiles may be laid out, and a late tap would answer
      // that question for the child (seen on the 360 x 640 phone).
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(150); // loading, submitting
  }
  return { asked, known, result: await attr(page, 'encounter-result') };
}

interface PathNode {
  id: string;
  type: string;
  x: number;
}

/**
 * From the first step on a destination path to the end of the boss encounter: the screen-reader
 * "Go to the next stop" action travels (the published nodes say what comes next); artifacts and
 * the rest bench happen on arrival, every encounter and the boss are played with real taps.
 * Returns when the boss encounter has closed (the scene decides what comes next).
 */
export async function walkThePath(page: Page): Promise<{ encounters: number; asked: number; known: number }> {
  await expect.poll(() => attr(page, 'session'), { timeout: 60_000 }).toBe('ready');
  const nodes = JSON.parse(await attr(page, 'nodes')) as PathNode[];
  expect(nodes.length).toBeGreaterThan(0);
  let encounters = 0;
  let asked = 0;
  let known = 0;
  for (const node of nodes) {
    const marks = JSON.parse((await attr(page, 'marks')) || '{}') as Record<string, string>;
    if (marks[node.id]) continue;
    const next = action(page, 'next-stop');
    await expect(next, `the next-stop action before ${node.id}`).toBeAttached({ timeout: 30_000 });
    await next.dispatchEvent('click');
    if (node.type === 'encounter' || node.type === 'boss') {
      const r = await finishEncounter(page);
      encounters += 1;
      asked += r.asked;
      known += r.known;
      if (node.type === 'boss') return { encounters, asked, known };
      await expect.poll(async () => (JSON.parse((await attr(page, 'marks')) || '{}') as Record<string, string>)[node.id] ?? '', { timeout: 30_000 }).toMatch(/^(won|lost)$/);
    } else {
      await expect.poll(async () => (JSON.parse((await attr(page, 'marks')) || '{}') as Record<string, string>)[node.id] ?? '', { timeout: 30_000 }).toMatch(/^(collected|rested)$/);
    }
  }
  return { encounters, asked, known };
}

/** From Basecamp: the map board (screen-reader action), a real tap on the Great Wall tile, Start. */
export async function startGreatWall(page: Page): Promise<void> {
  await action(page, 'open-map').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', 'map');
  await expect.poll(async () => (await mapTiles(page)).length).toBe(7);
  const tile = (await mapTiles(page)).find((t) => t.id === 'great-wall');
  expect(tile?.unlocked, 'Great Wall is open').toBe(true);
  await tapRect(page, tile!);
  await expect(action(page, 'trailhead-start')).toBeAttached();
  await action(page, 'trailhead-start').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('expedition');
  await expect(game(page)).toHaveAttribute('data-destination', 'great-wall');
}

/** Opens the outfitter from the lodge (screen-reader action) and waits for the server's catalog. */
export async function openOutfitter(page: Page): Promise<void> {
  await action(page, 'open-outfitter').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', 'outfitter');
  await expect.poll(() => attr(page, 'outfitter'), { timeout: 30_000 }).toBe('open');
}

/**
 * Records every change of the encounter's published state inside the page (phase, question id,
 * asked count, scene), so a driver mismatch can be read back without depending on poll timing.
 */
export async function installPhaseLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = document.querySelector('#game') as HTMLElement;
    const w = window as unknown as { __phaseLog: string[] };
    w.__phaseLog = [];
    let last = '';
    new MutationObserver(() => {
      const d = game.dataset;
      const line = `scene=${d['scene']} enc=${d['encounter'] ?? ''} q=${d['questionId'] ?? ''} asked=${d['asked'] ?? ''} stand=${d['lastStand'] ?? ''} result=${d['encounterResult'] ?? ''}`;
      if (line === last) return;
      last = line;
      if (w.__phaseLog.length < 4000) w.__phaseLog.push(`${Math.round(performance.now())} ${line}`);
    }).observe(game, { attributes: true });
  });
}

export async function readPhaseLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __phaseLog?: string[] }).__phaseLog ?? []);
}

/** The coin balance the outfitter shows (the server's number, read from the status line). */
export async function outfitterCoins(page: Page): Promise<number> {
  const m = /You have (\d+) coins/.exec(await statusText(page));
  return m ? Number(m[1]) : NaN;
}
