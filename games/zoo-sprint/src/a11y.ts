/**
 * A visually hidden, real-DOM mirror of the current screen: a status line plus real buttons for
 * the available actions. Screen readers and keyboard users get a usable game, and browser tests
 * can read state and trigger actions without hit-testing a canvas. It carries NO answer
 * information beyond what the screen already shows.
 */
export interface A11yAction {
  id: string;
  label: string;
  onClick: () => void;
}

const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

export class A11yMirror {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly actions: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'bz-a11y';
    this.root.setAttribute('style', HIDDEN);
    this.status = document.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.dataset['testid'] = 'status';
    this.actions = document.createElement('div');
    this.actions.setAttribute('role', 'group');
    this.actions.setAttribute('aria-label', 'Game actions');
    this.root.append(this.status, this.actions);
    parent.append(this.root);
  }

  set(statusText: string, actions: A11yAction[]): void {
    this.status.textContent = statusText;
    this.actions.replaceChildren(
      ...actions.map((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.label;
        button.dataset['action'] = action.id;
        button.addEventListener('click', action.onClick);
        return button;
      }),
    );
  }

  destroy(): void {
    this.root.remove();
  }
}
