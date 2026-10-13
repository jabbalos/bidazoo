import './account.css';
import { ACCOUNT_PAGE_PATH, LINK_FRAGMENT_KEY } from '@bidazoo/contracts/paths';
import type { ChildProfile, DeviceCodeResponse, DeviceStateResponse, DeviceSummary, FamilyResponse, LegacyKid, LegacyOfferResponse } from '@bidazoo/contracts';
import { api, type Reply } from './api';
import { button, confirmDialog, field, formOf, h, openDialog, shortDate, shortTime, submitButton, type Child } from './dom';

/**
 * The family / account page: the UI for the identity features the API already has.
 *
 * Rules this file keeps (and the Playwright suite checks):
 *  - Authentication is the HttpOnly cookie the browser attaches. Nothing here reads or stores a
 *    token. The emailed link's token arrives in the URL fragment, is held in a local variable only
 *    for the one POST that spends it, and is removed from the address bar and history FIRST.
 *  - Nothing sensitive is written to localStorage, sessionStorage, cookies, or the URL: not the
 *    link token, a PIN, a device code, a claim code, or an email address. (This file never touches
 *    web storage at all.)
 *  - Failure messages are generic on purpose. A wrong, missing or locked PIN is one message; a
 *    dead sign-in link, device code or claim code is one message each; the sign-in request answers
 *    the same for every address.
 *  - Guardian-only sections are shown only while the server says the device has guardian
 *    authority, and the server remains the authority for every action.
 *  - The server decides everything: this page never creates a player and never names one.
 */

type NoticeKind = 'info' | 'success' | 'error';
interface Notice { kind: NoticeKind; text: string }

interface State {
  phase: 'loading' | 'offline' | 'disabled' | 'signedOut' | 'ready';
  loadingText: string;
  device: DeviceStateResponse | null;
  family: FamilyResponse | null;
  devices: DeviceSummary[] | null;
  offer: LegacyOfferResponse['offer'];
  /** True when this browser has a guest player that a guardian could keep (see refresh()). */
  guestAvailable: boolean;
  linkSent: boolean;
  issuedCode: DeviceCodeResponse | null;
  /** Kids returned by a legacy claim made in this visit, so linking can continue. */
  legacyKids: LegacyKid[] | null;
}

const state: State = {
  phase: 'loading', loadingText: 'Loading…', device: null, family: null, devices: null, offer: null,
  guestAvailable: false, linkSent: false, issuedCode: null, legacyKids: null,
};

const TEXT = {
  generic: 'Something went wrong. Please try again.',
  wait: 'Too many tries right now. Please wait a few minutes and try again.',
  offline: "We can't reach BidaZoo. Check your connection and try again.",
  linkBad: "That sign-in link didn't work. It may have expired or already been used. Request a new one below.",
  codeBad: "That code didn't work. Codes work once and expire quickly. Ask for a new one.",
  claimBad: "That code didn't work. Check it and try again, or ask for a new one.",
  pinBad: "That PIN didn't work. Try again.",
  signedOut: 'This device is not signed in any more. Sign in again or enter a device code.',
  authority: "Confirm it's you with an email link to change players, PINs or devices.",
  gone: "That player isn't available any more.",
} as const;

const rootEl = document.getElementById('app') as HTMLElement;
const noticeStatus = h('div', { id: 'notice-status', class: 'notice', role: 'status', 'aria-live': 'polite' });
const noticeAlert = h('div', { id: 'notice-alert', class: 'notice error-box', role: 'alert' });
rootEl.before(h('div', { class: 'notices' }, noticeStatus, noticeAlert));

function notify(notice: Notice | null): void {
  noticeStatus.textContent = '';
  noticeAlert.textContent = '';
  noticeStatus.className = 'notice';
  if (notice === null) return;
  if (notice.kind === 'error') noticeAlert.textContent = `Error: ${notice.text}`;
  else {
    noticeStatus.textContent = `${notice.kind === 'success' ? 'Done: ' : ''}${notice.text}`;
    noticeStatus.className = `notice ${notice.kind}`;
  }
}

const failText = (status: number): string => (status === 0 ? TEXT.offline : status === 429 || status === 503 ? TEXT.wait : TEXT.generic);

// ---------------------------------------------------------------------------------------------
// Loading state from the server
// ---------------------------------------------------------------------------------------------

function toSignedOut(notice: Notice | null): void {
  Object.assign(state, { phase: 'signedOut', device: null, family: null, devices: null, offer: null, guestAvailable: false, issuedCode: null, legacyKids: null });
  notify(notice);
  render();
}

/** Re-reads everything the page shows. 404 = identity off here; 401 = this device is not trusted. */
async function refresh(options: { notice?: Notice; signedOutNotice?: Notice } = {}): Promise<void> {
  const device = await api.device();
  if (device.status === 404) {
    state.phase = 'disabled';
    notify(null);
    return render();
  }
  if (device.status === 0) {
    state.phase = 'offline';
    notify(null);
    return render();
  }
  if (device.status === 401 || !device.body) {
    return toSignedOut(options.signedOutNotice ?? options.notice ?? null);
  }
  state.device = device.body;
  state.phase = 'ready';
  state.linkSent = false;
  if (device.body.guardianAuthority) {
    const [family, devices, offer, me] = await Promise.all([api.family(), api.devices(), api.legacyOffer(), device.body.activeChildId === null ? api.me() : Promise.resolve(null)]);
    if (family.status === 401 || devices.status === 401) return toSignedOut(options.signedOutNotice ?? { kind: 'info', text: TEXT.signedOut });
    state.family = family.body ?? null;
    state.devices = devices.body?.devices ?? null;
    state.offer = offer.body?.offer ?? null;
    // A guest player is "available to keep" when the browser resolves to a player while no child
    // profile is selected on this device (with a profile selected, the server answers as the child).
    state.guestAvailable = me !== null && me.ok;
  } else {
    Object.assign(state, { family: null, devices: null, offer: null, guestAvailable: false });
  }
  notify(options.notice ?? null);
  render();
}

/** Common handling for an action's reply. Returns true when the caller should stop. */
function authFailure(reply: Reply<unknown>): boolean {
  if (reply.status === 401) {
    toSignedOut({ kind: 'info', text: TEXT.signedOut });
    return true;
  }
  if (reply.status === 403 && reply.code === 'forbidden') {
    void refresh({ notice: { kind: 'info', text: TEXT.authority } });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function render(): void {
  const focusKey = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute('data-focus') : null;
  rootEl.replaceChildren(
    h('main', { class: 'page' }, ...screen()),
  );
  const again = focusKey ? rootEl.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`) : null;
  (again ?? rootEl.querySelector<HTMLElement>('[data-focus="title"]'))?.focus();
}

const title = (text: string) => h('h1', { tabindex: '-1', 'data-focus': 'title' }, text);
const playLink = (label = 'Play BidaZoo') => h('a', { class: 'btn primary', href: '/' }, label);
const section = (heading: string, ...kids: Child[]) => h('section', { class: 'card', 'aria-label': heading }, h('h2', {}, heading), ...kids);

function screen(): Child[] {
  switch (state.phase) {
    case 'loading':
      return [title('BidaZoo family'), h('p', { class: 'loading' }, state.loadingText)];
    case 'offline':
      return [title('BidaZoo family'), h('p', {}, TEXT.offline), button('Try again', () => refresh(), { kind: 'primary' })];
    case 'disabled':
      return [
        title("Family accounts aren't available here"),
        h('p', {}, 'You can still play as a guest. Your progress stays in this browser.'),
        playLink(),
      ];
    case 'signedOut':
      return signedOutScreen();
    case 'ready':
      return readyScreen();
  }
}

// --- Signed out: guardian email link, or a device code ----------------------------------------

/** Email-link request form. Same text and result whether or not the address is known. */
function emailForm(options: { submit: string }): HTMLFormElement {
  const email = field({ label: 'Your email', type: 'email', autocomplete: 'email', inputmode: 'email', focusKey: 'email', hint: "We'll email you a one-time link. There is no password." });
  return formOf(
    async () => {
      const value = email.input.value.trim();
      if (value.length < 3 || !value.includes('@')) return email.setError('Enter a valid email address.');
      email.setError(null);
      const reply = await api.requestLink(value);
      email.input.value = '';
      if (reply.status === 202) {
        state.linkSent = true;
        notify(null);
        return render();
      }
      if (reply.status === 400) return email.setError('Enter a valid email address.');
      email.setError(failText(reply.status));
    },
    email.root,
    submitButton(options.submit),
  );
}

function signedOutScreen(): Child[] {
  if (state.linkSent) {
    return [
      title('Check your email'),
      h('div', { class: 'card' },
        h('p', {}, 'If that address can receive email, a sign-in link is on its way.'),
        h('p', {}, 'Open the link on the device you want to use. It works once and expires soon. You can close this page.'),
        button('Use a different email', () => {
          state.linkSent = false;
          render();
        }, { focusKey: 'again' }),
      ),
      h('p', {}, playLink('Back to the game')),
    ];
  }
  const code = field({ label: 'Device code', autocapitalize: 'characters', maxlength: 48, focusKey: 'device-code', hint: 'A parent can make one for this device.' });
  const codeForm = formOf(
    async () => {
      const value = code.input.value.trim();
      code.input.value = ''; // never kept, whatever happens next
      if (!/^[0-9A-Za-z-]{8,48}$/.test(value)) return code.setError(TEXT.codeBad);
      code.setError(null);
      const reply = await api.redeemDeviceCode(value);
      if (reply.ok) return refresh({ notice: { kind: 'success', text: 'This device is ready.' } });
      code.setError(reply.status === 400 ? TEXT.codeBad : failText(reply.status));
    },
    code.root,
    submitButton('Use device code', 'secondary'),
  );
  return [
    title('BidaZoo family'),
    h('p', { class: 'lead' }, "Sign in to add players, set PINs and manage this family's devices."),
    section('Parent sign-in', emailForm({ submit: 'Email me a sign-in link' })),
    section('This is a child’s device', h('p', {}, 'Have a device code from a parent?'), codeForm),
    h('p', {}, playLink('Play without signing in')),
  ];
}

// --- Signed in ------------------------------------------------------------------------------

function readyScreen(): Child[] {
  const device = state.device as DeviceStateResponse;
  const guardian = device.guardianAuthority;
  const parts: Child[] = [title('Your family')];
  if (guardian && state.family) parts.push(h('p', { class: 'lead' }, `Signed in as ${state.family.guardianEmail}`));
  else parts.push(h('p', { class: 'lead' }, 'This device is trusted by your family.'));

  parts.push(playersSection(device, guardian));
  if (!guardian) {
    parts.push(section('Parent tools', h('p', {}, TEXT.authority), emailForm({ submit: 'Email me a sign-in link' })));
    parts.push(h('p', {}, playLink()));
    return parts;
  }
  parts.push(archivedSection());
  parts.push(addChildSection());
  if (state.guestAvailable) parts.push(guestClaimSection());
  parts.push(devicesSection());
  parts.push(legacySection());
  parts.push(h('p', {}, playLink()));
  return parts;
}

function visibleChildren(device: DeviceStateResponse, guardian: boolean): ChildProfile[] {
  return guardian && state.family ? state.family.children.filter((c) => !c.archived) : device.children;
}

function playersSection(device: DeviceStateResponse, guardian: boolean): HTMLElement {
  const children = visibleChildren(device, guardian);
  const list = children.length === 0
    ? h('p', {}, guardian ? 'No players yet. Add one below.' : 'No players yet. Ask a parent to add one.')
    : h('ul', { class: 'list' }, ...children.map((child) => playerRow(child, child.id === device.activeChildId, guardian)));
  return section('Players on this device', list);
}

function playerRow(child: ChildProfile, active: boolean, guardian: boolean): HTMLElement {
  const name = child.nickname;
  const main = h('div', { class: 'row-main' },
    h('span', { class: 'name' }, name),
    active ? h('span', { class: 'badge ok' }, '✓ Playing now') : null,
    child.hasPin ? h('span', { class: 'badge' }, 'PIN lock') : null,
  );
  const actions: Child[] = [];
  if (active) actions.push(h('a', { class: 'btn primary', href: '/', 'aria-label': `Play as ${name}` }, 'Play'));
  else actions.push(button('Switch', () => switchTo(child), { kind: 'primary', ariaLabel: `Switch to ${name}`, focusKey: `switch-${child.id}` }));
  if (guardian) {
    actions.push(button(child.hasPin ? 'Change PIN' : 'Set PIN', () => pinDialog(child), { ariaLabel: `${child.hasPin ? 'Change' : 'Set'} PIN for ${name}`, focusKey: `pin-${child.id}` }));
    if (child.hasPin) actions.push(button('Remove PIN', () => removePin(child), { ariaLabel: `Remove PIN for ${name}`, focusKey: `unpin-${child.id}` }));
    actions.push(button('Archive', () => setArchived(child, true), { ariaLabel: `Archive ${name}`, focusKey: `archive-${child.id}` }));
  }
  return h('li', { class: 'row' }, main, h('div', { class: 'actions' }, ...actions));
}

function archivedSection(): Child {
  const archived = state.family?.children.filter((c) => c.archived) ?? [];
  if (archived.length === 0) return null;
  return h('details', { class: 'card' },
    h('summary', {}, `Archived players (${archived.length})`),
    h('p', { class: 'hint' }, 'Archived players are hidden and cannot be played. Restoring one brings it back with its progress.'),
    h('ul', { class: 'list' }, ...archived.map((c) =>
      h('li', { class: 'row' }, h('div', { class: 'row-main' }, h('span', { class: 'name' }, c.nickname)),
        h('div', { class: 'actions' }, button('Restore', () => setArchived(c, false), { ariaLabel: `Restore ${c.nickname}`, focusKey: `restore-${c.id}` }))))),
  );
}

const nicknameError = 'Enter a nickname (1 to 32 characters).';
function cleanNickname(raw: string): string | null {
  const value = raw.replace(/\s+/g, ' ').trim();
  return value.length >= 1 && value.length <= 32 ? value : null;
}

function addChildSection(): HTMLElement {
  const nick = field({ label: 'Player nickname', maxlength: 32, focusKey: 'add-nick', hint: 'A nickname is enough. No email or real name needed.' });
  return section('Add a player', formOf(
    async () => {
      const nickname = cleanNickname(nick.input.value);
      if (nickname === null) return nick.setError(nicknameError);
      nick.setError(null);
      const reply = await api.createChild(nickname);
      if (reply.ok) return refresh({ notice: { kind: 'success', text: `Added ${nickname}.` } });
      if (authFailure(reply)) return;
      nick.setError(reply.status === 400 ? "That nickname can't be used. Try a different one." : failText(reply.status));
    },
    nick.root,
    submitButton('Add player'),
  ));
}

function guestClaimSection(): HTMLElement {
  const nick = field({ label: 'Nickname for this player', maxlength: 32, focusKey: 'claim-nick' });
  return section("Keep this player's progress", h('p', {}, 'This browser already has a BidaZoo player. Add it to your family and keep all of its progress.'), formOf(
    async () => {
      const nickname = cleanNickname(nick.input.value);
      if (nickname === null) return nick.setError(nicknameError);
      nick.setError(null);
      const reply = await api.claimGuest(nickname);
      if (reply.ok) return refresh({ notice: { kind: 'success', text: `${nickname} is now one of your players, with all progress kept.` } });
      if (authFailure(reply)) return;
      if (reply.status === 409) return nick.setError("That player can't be added from here.");
      if (reply.status === 401) return nick.setError("We couldn't find a player to keep on this browser.");
      nick.setError(failText(reply.status));
    },
    nick.root,
    submitButton('Keep progress and add player'),
  ));
}

// --- Switching, PINs, archiving ---------------------------------------------------------------

async function switchTo(child: ChildProfile): Promise<void> {
  if (child.hasPin) return pinPrompt(child);
  const reply = await api.switchProfile(child.id);
  if (reply.ok) return refresh({ notice: { kind: 'success', text: `Now playing as ${child.nickname}.` } });
  if (reply.status === 401) return toSignedOut({ kind: 'info', text: TEXT.signedOut });
  if (reply.status === 404) return refresh({ notice: { kind: 'error', text: TEXT.gone } });
  notify({ kind: 'error', text: failText(reply.status) });
}

function pinField(label: string, hint: string) {
  const pin = field({ label, type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', hint, extra: { pattern: '[0-9]*' } });
  // Digits only, as typed or pasted.
  pin.input.addEventListener('input', () => {
    pin.input.value = pin.input.value.replace(/\D/g, '').slice(0, 4);
  });
  return pin;
}

/** Enter the PIN for a PIN-locked player. One generic message for wrong, missing and locked. */
async function pinPrompt(child: ChildProfile): Promise<void> {
  let outcome: 'ok' | 'gone' | 'auth' | null = null;
  await openDialog((close) => {
    const pin = pinField('PIN', 'Four digits.');
    const form = formOf(
      async () => {
        const value = pin.input.value;
        pin.input.value = '';
        if (!/^[0-9]{4}$/.test(value)) {
          pin.setError('Enter exactly four digits.');
          return pin.input.focus();
        }
        const reply = await api.switchProfile(child.id, value);
        if (reply.ok) {
          outcome = 'ok';
          return close();
        }
        if (reply.status === 401) { outcome = 'auth'; return close(); }
        if (reply.status === 404) { outcome = 'gone'; return close(); }
        pin.setError(reply.status === 403 ? TEXT.pinBad : failText(reply.status));
        pin.input.focus();
      },
      pin.root,
      h('div', { class: 'actions' }, button('Cancel', close), submitButton('Unlock')),
    );
    return [h('p', {}, `${child.nickname} has a PIN. It only unlocks this player on this device.`), form];
  }, { title: `Unlock ${child.nickname}` });
  if (outcome === 'ok') return refresh({ notice: { kind: 'success', text: `Now playing as ${child.nickname}.` } });
  if (outcome === 'auth') return toSignedOut({ kind: 'info', text: TEXT.signedOut });
  if (outcome === 'gone') return refresh({ notice: { kind: 'error', text: TEXT.gone } });
}

/** Guardian sets or changes a PIN. Says plainly what a PIN is for and what it is not. */
async function pinDialog(child: ChildProfile): Promise<void> {
  let outcome: 'ok' | 'gone' | 'auth' | 'authority' | null = null;
  await openDialog((close) => {
    const pin = pinField('New PIN', 'Exactly four digits.');
    const form = formOf(
      async () => {
        const value = pin.input.value;
        pin.input.value = '';
        if (!/^[0-9]{4}$/.test(value)) {
          pin.setError('Use exactly four digits.');
          return pin.input.focus();
        }
        const reply = await api.setPin(child.id, value);
        if (reply.ok) { outcome = 'ok'; return close(); }
        if (reply.status === 401) { outcome = 'auth'; return close(); }
        if (reply.status === 403) { outcome = 'authority'; return close(); }
        if (reply.status === 404) { outcome = 'gone'; return close(); }
        pin.setError(reply.status === 400 ? 'Use exactly four digits.' : failText(reply.status));
        pin.input.focus();
      },
      pin.root,
      h('div', { class: 'actions' }, button('Cancel', close), submitButton('Save PIN')),
    );
    return [
      h('p', {}, `A PIN keeps other players from switching to ${child.nickname} on trusted devices.`),
      h('p', { class: 'hint' }, 'It is not a password and cannot recover your account. You can change or remove it any time.'),
      form,
    ];
  }, { title: `${child.hasPin ? 'Change' : 'Set'} PIN for ${child.nickname}` });
  if (outcome === 'ok') return refresh({ notice: { kind: 'success', text: `PIN saved for ${child.nickname}.` } });
  if (outcome === 'auth') return toSignedOut({ kind: 'info', text: TEXT.signedOut });
  if (outcome === 'authority') return refresh({ notice: { kind: 'info', text: TEXT.authority } });
  if (outcome === 'gone') return refresh({ notice: { kind: 'error', text: TEXT.gone } });
}

async function removePin(child: ChildProfile): Promise<void> {
  const yes = await confirmDialog({ title: `Remove PIN for ${child.nickname}?`, body: `Anyone on a trusted device will be able to switch to ${child.nickname} without a PIN.`, confirm: 'Remove PIN', danger: true });
  if (!yes) return;
  const reply = await api.clearPin(child.id);
  if (reply.ok) return refresh({ notice: { kind: 'success', text: `PIN removed for ${child.nickname}.` } });
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: reply.status === 404 ? TEXT.gone : failText(reply.status) });
}

async function setArchived(child: ChildProfile, archived: boolean): Promise<void> {
  const reply = await (archived ? api.archive(child.id) : api.restore(child.id));
  if (reply.ok) return refresh({ notice: { kind: 'success', text: `${child.nickname} ${archived ? 'archived' : 'restored'}.` } });
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: reply.status === 404 ? TEXT.gone : failText(reply.status) });
}

// --- Devices -----------------------------------------------------------------------------------

function devicesSection(): HTMLElement {
  const devices = state.devices ?? [];
  const list = h('ul', { class: 'list' }, ...devices.map((d) => deviceRow(d)));
  const code = state.issuedCode;
  const issued = code === null ? null : h('div', { class: 'code-box', role: 'group', 'aria-label': 'New device code' },
    h('p', {}, 'Enter this code on the new device (it works once):'),
    h('code', { class: 'code', 'data-focus': 'issued-code', tabindex: '-1' }, code.code),
    h('p', { class: 'hint' }, `Open ${location.origin}${ACCOUNT_PAGE_PATH} there. The code expires at ${shortTime(code.expiresAt)}.`),
    button('Hide code', () => {
      state.issuedCode = null;
      render();
    }, { focusKey: 'hide-code' }),
  );
  return section('Trusted devices',
    h('p', { class: 'hint' }, 'These browsers can play as your family. Revoke any you no longer use.'),
    list,
    issued,
    h('div', { class: 'actions wrap' },
      button('Create a device code', makeCode, { kind: 'primary', focusKey: 'make-code' }),
      button('Revoke all other devices', () => revokeAll(false), { focusKey: 'revoke-others' }),
      button('Sign out everywhere', () => revokeAll(true), { kind: 'danger', focusKey: 'revoke-everywhere' }),
    ),
  );
}

function deviceRow(device: DeviceSummary): HTMLElement {
  const name = device.label ?? 'Unnamed device';
  return h('li', { class: 'row' },
    h('div', { class: 'row-main' },
      h('span', { class: 'name' }, name),
      device.current ? h('span', { class: 'badge ok' }, '✓ This device') : null,
      h('span', { class: 'meta' }, `Added ${shortDate(device.createdAt)} · Last used ${shortDate(device.lastSeenAt)} · Expires ${shortDate(device.expiresAt)}`),
      device.activeChildNickname ? h('span', { class: 'meta' }, `Playing as ${device.activeChildNickname}`) : null,
    ),
    h('div', { class: 'actions' },
      button(device.current ? 'Sign out this device' : 'Revoke', () => revokeOne(device), { kind: 'danger', ariaLabel: `${device.current ? 'Sign out this device' : 'Revoke'}: ${name}`, focusKey: `revoke-${device.id}` })),
  );
}

async function makeCode(): Promise<void> {
  const reply = await api.issueDeviceCode();
  if (reply.ok && reply.body) {
    state.issuedCode = reply.body;
    notify({ kind: 'success', text: 'Device code created.' });
    render();
    return void document.querySelector<HTMLElement>('[data-focus="issued-code"]')?.focus();
  }
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: reply.status === 429 ? 'Too many open codes. Use or wait out an existing one.' : failText(reply.status) });
}

async function revokeOne(device: DeviceSummary): Promise<void> {
  if (device.current) {
    const yes = await confirmDialog({ title: 'Sign out this device?', body: 'This device will need a new email link or device code to be used for your family again.', confirm: 'Sign out', danger: true });
    if (!yes) return;
  }
  const reply = await api.revokeDevice(device.id);
  if (reply.ok) {
    if (device.current) return toSignedOut({ kind: 'info', text: 'This device was signed out.' });
    return refresh({ notice: { kind: 'success', text: 'Device revoked.' } });
  }
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: reply.status === 404 ? 'That device is already gone.' : failText(reply.status) });
}

async function revokeAll(includeCurrent: boolean): Promise<void> {
  const yes = await confirmDialog(includeCurrent
    ? { title: 'Sign out everywhere?', body: 'Every trusted device, including this one, will be signed out. Each needs a new email link or device code.', confirm: 'Sign out everywhere', danger: true }
    : { title: 'Revoke all other devices?', body: 'Every trusted device except this one will be signed out.', confirm: 'Revoke other devices', danger: true });
  if (!yes) return;
  const reply = await api.revokeAll(includeCurrent);
  if (reply.ok) {
    if (includeCurrent) return toSignedOut({ kind: 'info', text: 'All devices were signed out.' });
    return refresh({ notice: { kind: 'success', text: 'Other devices were revoked.' } });
  }
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: failText(reply.status) });
}

// --- Legacy Hop Quest ----------------------------------------------------------------------------

const LEGACY_NOTE = 'This only connects your old Hop Quest family to your BidaZoo family. Old Hop Quest progress, rewards, PINs and passwords are not brought over.';

function legacySection(): HTMLElement {
  const kids = state.legacyKids ?? state.offer?.kids ?? null;
  const parts: Child[] = [];
  if (kids !== null) {
    const open = kids.filter((k) => k.childProfileId === null);
    parts.push(h('p', {}, `We found a Hop Quest family linked to your email (${kids.length} ${kids.length === 1 ? 'player' : 'players'}).`), h('p', { class: 'hint' }, LEGACY_NOTE));
    if (open.length === 0) parts.push(h('p', {}, '✓ All set. Your Hop Quest players have BidaZoo profiles.'));
    else if (state.legacyKids === null) parts.push(button('Claim my Hop Quest family', claimByEmail, { kind: 'primary', focusKey: 'legacy-claim' }));
    if (state.legacyKids !== null) parts.push(h('ul', { class: 'list' }, ...state.legacyKids.map((k) => legacyKidRow(k))));
  }
  parts.push(claimCodeBox());
  return section('Moving from Hop Quest', ...parts);
}

async function claimByEmail(): Promise<void> {
  const reply = await api.legacyClaim();
  if (reply.ok && reply.body) {
    state.legacyKids = reply.body.kids;
    notify({ kind: 'success', text: 'Your Hop Quest family is connected. Now choose which players to create.' });
    return render();
  }
  if (authFailure(reply)) return;
  notify({ kind: 'error', text: "We couldn't connect that family. Try a claim code instead." });
}

function legacyKidRow(kid: LegacyKid): HTMLElement {
  const label = kid.username ?? 'Hop Quest player';
  const meta = kid.gradeBand ? `Grade ${kid.gradeBand}` : null;
  if (kid.childProfileId !== null) {
    return h('li', { class: 'row' }, h('div', { class: 'row-main' }, h('span', { class: 'name' }, label), h('span', { class: 'badge ok' }, '✓ Added')));
  }
  const nick = field({ label: `BidaZoo nickname for ${label}`, maxlength: 32, focusKey: `legacy-nick-${kid.id}` });
  return h('li', { class: 'row column' },
    h('div', { class: 'row-main' }, h('span', { class: 'name' }, label), meta ? h('span', { class: 'meta' }, meta) : null),
    formOf(
      async () => {
        const nickname = cleanNickname(nick.input.value);
        if (nickname === null) return nick.setError(nicknameError);
        nick.setError(null);
        const reply = await api.legacyLink(kid.id, nickname);
        if (reply.ok) {
          if (state.legacyKids) state.legacyKids = state.legacyKids.map((k) => (k.id === kid.id && reply.body ? { ...k, childProfileId: reply.body.child.id } : k));
          return refresh({ notice: { kind: 'success', text: `Created ${nickname}. It starts fresh: no Hop Quest progress is copied.` } });
        }
        if (authFailure(reply)) return;
        nick.setError(reply.status === 404 ? "That player can't be added." : failText(reply.status));
      },
      nick.root,
      submitButton('Create BidaZoo player'),
    ),
  );
}

function claimCodeBox(): HTMLElement {
  const code = field({ label: 'Claim code', autocapitalize: 'characters', maxlength: 48, focusKey: 'claim-code', hint: 'From the person helping with your move. It works once.' });
  return h('details', {},
    h('summary', {}, 'I have a claim code'),
    h('p', { class: 'hint' }, LEGACY_NOTE),
    formOf(
      async () => {
        const value = code.input.value.trim();
        code.input.value = ''; // never kept, whatever happens next
        if (!/^[0-9A-Za-z-]{8,48}$/.test(value)) return code.setError(TEXT.claimBad);
        code.setError(null);
        const reply = await api.legacyClaimCode(value);
        if (reply.ok && reply.body) {
          state.legacyKids = reply.body.kids;
          return refresh({ notice: { kind: 'success', text: 'Your Hop Quest family is connected. Now choose which players to create.' } });
        }
        if (authFailure(reply)) return;
        code.setError(reply.status === 429 || reply.status === 503 || reply.status === 0 ? failText(reply.status) : TEXT.claimBad);
      },
      code.root,
      submitButton('Use claim code', 'secondary'),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Boot: spend an emailed link first (removing it from the URL), then load the page
// ---------------------------------------------------------------------------------------------

async function boot(): Promise<void> {
  // Take the token out of the address bar and history BEFORE anything else happens to it.
  const params = new URLSearchParams(location.hash.slice(1));
  let token = params.get(LINK_FRAGMENT_KEY);
  if (location.hash !== '' || location.search !== '') history.replaceState(null, '', location.pathname);
  state.phase = 'loading';
  state.linkSent = false;
  if (token !== null) {
    state.loadingText = 'Signing you in…';
    render();
    const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
    const reply = valid ? await api.consumeLink(token) : null;
    token = null; // the only copy is gone
    if (reply?.ok) return refresh({ notice: { kind: 'success', text: "You're signed in." } });
    const text = reply && (reply.status === 429 || reply.status === 503 || reply.status === 0) ? failText(reply.status) : TEXT.linkBad;
    return refresh({ signedOutNotice: { kind: 'error', text }, notice: { kind: 'error', text } });
  }
  render();
  await refresh();
}

void boot();
// Opening an emailed link in a tab that already shows this page only changes the fragment (no
// reload). Handle that the same way as a fresh load. Clearing the fragment does not fire this.
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).has(LINK_FRAGMENT_KEY)) void boot();
});
