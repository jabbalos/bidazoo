import { expect } from 'vitest';

// Headers every API response must carry, whatever the status.
const REQUIRED: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function expectSecurityHeaders(headers: Record<string, unknown>, label: string): void {
  for (const [name, value] of Object.entries(REQUIRED)) expect(headers[name], `${label}: ${name}`).toBe(value);
  expect(String(headers['permissions-policy']), label).toContain('camera=()');
  expect(String(headers['permissions-policy']), label).toContain('microphone=()');
}

