import type { RateWindow } from './http/rate-limit';

/**
 * Environment parsing helpers shared by every configuration section.
 *
 * Error messages name the variable but never echo its value (a value may be a secret).
 */

export function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

export function parseInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  return parsed;
}

export const MAX_WINDOW_SECONDS = 7 * 86_400;

/**
 * Reads <prefix><NAME>_MAX and <prefix><NAME>_WINDOW_SECONDS (for example RATE_ANSWER_MAX).
 * `allowZero` lets MAX=0 disable a rule.
 */
export function parseWindow(
  source: Record<string, string | undefined>,
  prefix: string,
  name: string,
  fallback: RateWindow,
  allowZero = false,
): RateWindow {
  return {
    max: parseInteger(`${prefix}${name}_MAX`, source[`${prefix}${name}_MAX`], fallback.max, allowZero ? 0 : 1, 1_000_000),
    windowSeconds: parseInteger(
      `${prefix}${name}_WINDOW_SECONDS`,
      source[`${prefix}${name}_WINDOW_SECONDS`],
      fallback.windowSeconds,
      1,
      MAX_WINDOW_SECONDS,
    ),
  };
}
