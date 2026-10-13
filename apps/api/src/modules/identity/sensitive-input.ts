import { statSync } from 'node:fs';

/**
 * Handling notes for the operator's legacy manifest, shared by the CLI and its tests.
 *
 * The manifest is SENSITIVE TEMPORARY INPUT: before import it holds plaintext guardian email
 * addresses. BidaZoo reads it once, derives keyed match values, and never copies, caches or logs
 * the file or any email in it. Deleting it afterwards is the operator's job (the tool will not
 * delete anything).
 */
export const MANIFEST_SENSITIVE_NOTICE =
  'SENSITIVE INPUT: this manifest contains plaintext guardian email addresses. It is temporary input. ' +
  'The tool reads it once, stores only keyed match values (never the addresses), and does not copy or log it.';

export const MANIFEST_DELETE_REMINDER =
  'Next step for you: once the import succeeded and a database backup is verified, securely delete the manifest file ' +
  'and any copies. This tool never deletes it.';

/**
 * A warning when the file looks readable by other users, or null. Deliberately simple: POSIX mode
 * bits only (group or other can read). On Windows, or when the file cannot be inspected, there is
 * no warning rather than a guess, because ACLs do not map onto mode bits.
 */
export function broadReadWarning(
  path: string,
  platform: string = process.platform,
  stat: (p: string) => { mode: number } = statSync,
): string | null {
  if (platform === 'win32') return null;
  try {
    if ((stat(path).mode & 0o044) === 0) return null;
  } catch {
    return null;
  }
  return 'WARNING: the manifest file is readable by other users on this machine. Restrict it (for example chmod 600) or move it somewhere private.';
}
