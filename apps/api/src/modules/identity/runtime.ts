import type { IdentityConfig } from './config';
import { deriveIdentityKeys, type IdentityKeys } from './crypto';
import { MailDispatcher, createMailer, type Mailer } from './mail';

/**
 * Everything the identity module needs at runtime, built once at startup and carried on the
 * AppContext. When `ctx.identity` is undefined, identity is OFF: no identity route is registered
 * and only the guest cookie authenticates.
 */
export interface IdentityRuntime {
  config: IdentityConfig;
  keys: IdentityKeys;
  mailer: Mailer;
  mail: MailDispatcher;
  /** Last opportunistic cleanup of expired identity rows, by the app clock (see throttle.ts). */
  lastSweepAtMs: number;
}

export function createIdentityRuntime(
  config: IdentityConfig,
  options: { mailer?: Mailer; onMailFailure?: (errorName: string) => void } = {},
): IdentityRuntime {
  const mailer = options.mailer ?? createMailer(config);
  return {
    config,
    keys: deriveIdentityKeys(config.secret),
    mailer,
    mail: new MailDispatcher(mailer, options.onMailFailure ?? (() => {})),
    lastSweepAtMs: 0,
  };
}
