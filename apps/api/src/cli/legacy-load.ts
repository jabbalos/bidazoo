/**
 * Operator tool: load an offline Hop Quest manifest. Run on the Studio PC, never as part of the API.
 *
 *   npm run legacy:load -w @bidazoo/api -- --file C:\path\to\manifest.json [--label "oct-export"]
 *
 * Needs DATABASE_URL and LEGACY_MATCH_PEPPER in the environment (.env is read if present).
 *
 * THE MANIFEST IS SENSITIVE TEMPORARY INPUT. It holds plaintext guardian emails. This tool reads it
 * once, stores only keyed match values, never copies the file into application storage and never
 * prints or logs an email, key or value from it (stdout is a counts-only JSON summary; notices and
 * warnings go to stderr). It does NOT delete the file: after a successful import and a verified
 * database backup, securely delete the manifest and any copies yourself.
 */
import { readFileSync } from 'node:fs';
import { systemClock } from '../context';
import { createDatabase } from '../db';
import { ManifestError, loadLegacyManifest } from '../modules/identity/legacy-manifest';
import { MANIFEST_DELETE_REMINDER, MANIFEST_SENSITIVE_NOTICE, broadReadWarning } from '../modules/identity/sensitive-input';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const file = arg('file');
  const databaseUrl = process.env['DATABASE_URL'];
  const pepper = process.env['LEGACY_MATCH_PEPPER'];
  if (!file || !databaseUrl) {
    console.error('usage: legacy:load --file <manifest.json> [--label <text>]  (DATABASE_URL is required)');
    return 2;
  }
  if (!pepper || pepper.length < 32) {
    console.error('LEGACY_MATCH_PEPPER must be set to at least 32 characters');
    return 2;
  }
  console.error(MANIFEST_SENSITIVE_NOTICE);
  const broad = broadReadWarning(file);
  if (broad) console.error(broad);
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error('the manifest file could not be read as JSON');
    return 2;
  }
  const database = createDatabase(databaseUrl);
  try {
    const label = arg('label');
    const summary = await loadLegacyManifest(database.db, systemClock, pepper, manifest, label === undefined ? {} : { loadedBy: label });
    console.log(JSON.stringify(summary));
    console.error(MANIFEST_DELETE_REMINDER);
    return 0;
  } catch (err) {
    // ManifestError messages name list positions only, never values.
    console.error(err instanceof ManifestError ? `rejected: ${err.message}` : 'the load failed and was rolled back');
    return 1;
  } finally {
    await database.close();
  }
}

process.exitCode = await main();
