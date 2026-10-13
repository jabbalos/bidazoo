/**
 * A tiny DOM builder. Everything is created with createElement and textContent, never innerHTML,
 * so a nickname or label from the server can only ever be text. No inline styles: the page is
 * served under style-src 'self', so all presentation is classes in account.css.
 */
export type Child = Node | string | null | undefined | false;
export type Props = Record<string, string | number | boolean | undefined | ((event: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key === 'class' ? 'class' : key, value === true ? '' : String(value));
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

let counter = 0;
/** A unique id for associating labels, hints and errors. */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** A labeled text field with an optional hint and an error slot wired up with aria-describedby. */
export interface Field {
  root: HTMLDivElement;
  input: HTMLInputElement;
  setError(message: string | null): void;
}

export function field(options: {
  label: string;
  hint?: string;
  type?: string;
  autocomplete?: string;
  inputmode?: string;
  maxlength?: number;
  autocapitalize?: string;
  focusKey?: string;
  extra?: Props;
}): Field {
  const id = uid('f');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const input = h('input', {
    id,
    type: options.type ?? 'text',
    autocomplete: options.autocomplete ?? 'off',
    inputmode: options.inputmode,
    maxlength: options.maxlength,
    autocapitalize: options.autocapitalize ?? 'off',
    spellcheck: 'false',
    'data-focus': options.focusKey,
    'aria-describedby': options.hint ? `${hintId} ${errorId}` : errorId,
    ...options.extra,
  });
  const error = h('p', { id: errorId, class: 'error', role: 'alert', hidden: true });
  const root = h('div', { class: 'field' }, h('label', { for: id }, options.label), input, options.hint ? h('p', { id: hintId, class: 'hint' }, options.hint) : null, error);
  return {
    root,
    input,
    setError(message) {
      error.hidden = message === null;
      error.textContent = message === null ? '' : `Error: ${message}`;
      if (message === null) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    },
  };
}

/** A button that shows a busy state while its action runs, and cannot be double-submitted. */
export function button(label: string, onClick: () => void | Promise<void>, options: { kind?: 'primary' | 'secondary' | 'danger'; ariaLabel?: string; focusKey?: string } = {}): HTMLButtonElement {
  const el = h('button', { type: 'button', class: `btn ${options.kind ?? 'secondary'}`, 'aria-label': options.ariaLabel, 'data-focus': options.focusKey }, label);
  // A flag, not `disabled`: a disabled button drops keyboard focus, and the dialogs it opens need
  // to hand focus back to it.
  let busy = false;
  el.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    el.setAttribute('aria-busy', 'true');
    void Promise.resolve(onClick()).finally(() => {
      busy = false;
      el.removeAttribute('aria-busy');
    });
  });
  return el;
}

export function formOf(onSubmit: () => void | Promise<void>, ...kids: Child[]): HTMLFormElement {
  const form = h('form', { novalidate: true, class: 'stack' }, ...kids);
  let busy = false;
  form.addEventListener('submit', (event) => {
    // Never a real submission: the page's CSP forbids form navigation, and the data goes by fetch.
    event.preventDefault();
    if (busy) return;
    busy = true;
    for (const b of form.querySelectorAll('button[type="submit"]')) b.setAttribute('aria-busy', 'true');
    void Promise.resolve(onSubmit()).finally(() => {
      busy = false;
      for (const b of form.querySelectorAll('button[type="submit"]')) b.removeAttribute('aria-busy');
    });
  });
  return form;
}

export const submitButton = (label: string, kind: 'primary' | 'secondary' | 'danger' = 'primary'): HTMLButtonElement =>
  h('button', { type: 'submit', class: `btn ${kind}` }, label);

/**
 * A modal built on the native <dialog>: the browser traps focus inside, Escape closes it, and
 * focus returns to the control that opened it. Content is built by the caller and must fit a
 * 360x640 screen (the CSS scrolls the dialog itself, never the page behind it).
 */
export function openDialog(build: (close: () => void) => Child[], options: { title: string; labelledBy?: string }): Promise<void> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = uid('dlg');
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId });
  return new Promise((resolve) => {
    const close = () => dialog.close();
    dialog.append(h('h2', { id: titleId }, options.title), ...build(close).filter((k): k is Node | string => k !== null && k !== undefined && k !== false).map((k) => (typeof k === 'string' ? document.createTextNode(k) : k)));
    dialog.addEventListener('close', () => {
      dialog.remove();
      // The opener may still be mid-action (busy buttons ignore focus) or may be re-rendered by the
      // time the caller reacts, so restore focus a tick later and find it again by its key.
      const key = opener?.getAttribute('data-focus') ?? null;
      setTimeout(() => {
        const target = opener?.isConnected ? opener : key ? document.querySelector<HTMLElement>(`[data-focus="${key}"]`) : null;
        target?.focus();
      }, 0);
      resolve();
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector<HTMLElement>('input, button.primary, button.danger, button')?.focus();
  });
}

/** Yes/no confirmation. Resolves true only on the explicit confirm button. */
export async function confirmDialog(options: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  let answer = false;
  await openDialog(
    (close) => [
      h('p', {}, options.body),
      h(
        'div',
        { class: 'actions' },
        button('Cancel', close, { kind: 'secondary' }),
        button(options.confirm, () => {
          answer = true;
          close();
        }, { kind: options.danger ? 'danger' : 'primary' }),
      ),
    ],
    { title: options.title },
  );
  return answer;
}

/** US-style date, no time zone surprises: "Oct 12, 2026". */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
