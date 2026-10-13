import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A second, identity-ENABLED stack for the account-page tests. The default stack (API 3001, play
 * 4173) keeps identity OFF, which is also what proves the guest-only fallback.
 *
 * Every value here is a throwaway test value: it protects nothing and is only ever used against
 * the disposable e2e database. Real secrets never appear in the repository.
 */
export const ID_API_PORT = 3002;
export const ID_PLAY_PORT = 4174;
export const ID_BASE_URL = `http://127.0.0.1:${ID_PLAY_PORT}`;
export const OUTBOX_DIR = join(tmpdir(), 'bidazoo-e2e-outbox');
export const OUTBOX_FILE = join(OUTBOX_DIR, 'outbox.jsonl');
export const E2E_IDENTITY_SECRET = 'e2e-only-identity-secret-0123456789abcdef-not-real';
export const E2E_LEGACY_PEPPER = 'e2e-only-legacy-pepper-0123456789abcdef-not-real';

/** Generous durable limits: the suite makes many sign-ins from one address in a short time. */
export function identityEnv(databaseUrl: string): Record<string, string> {
  const generous: Record<string, string> = {};
  for (const name of ['LOGIN_EMAIL', 'LOGIN_IP', 'LOGIN_GLOBAL', 'LINK_CONSUME_IP', 'DEVICE_CODE_IP', 'DEVICE_CODE_GLOBAL', 'CLAIM_CODE_IP', 'PIN_DEVICE']) {
    generous[`IDENTITY_RATE_${name}_MAX`] = '100000';
    generous[`IDENTITY_RATE_${name}_WINDOW_SECONDS`] = '60';
  }
  return {
    API_PORT: String(ID_API_PORT),
    DATABASE_URL: databaseUrl,
    IDENTITY_SECRET: E2E_IDENTITY_SECRET,
    LEGACY_MATCH_PEPPER: E2E_LEGACY_PEPPER,
    PUBLIC_BASE_URL: ID_BASE_URL,
    MAIL_TRANSPORT: 'file',
    MAIL_OUTBOX_DIR: OUTBOX_DIR,
    ...generous,
  };
}
