/**
 * Operator tool: issue or revoke a one-time legacy claim code, after confirming the person out of band.
 *
 *   npm run legacy:claim-code -w @bidazoo/api -- issue --legacy-family <id> [--days 7] [--by "jabba"]
 *   npm run legacy:claim-code -w @bidazoo/api -- revoke --legacy-family <id>
 *
 * Needs DATABASE_URL and IDENTITY_SECRET. `issue` prints the code ONCE; only its keyed hash is
 * stored. A code authorizes that one legacy family's claim by a signed-in guardian, nothing else.
 */
import { systemClock } from '../context';
import { createDatabase } from '../db';
import { deriveIdentityKeys } from '../modules/identity/crypto';
import { ManifestError, issueLegacyClaimCode, revokeLegacyClaimCodes } from '../modules/identity/legacy-manifest';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  const legacyFamilyId = arg('legacy-family');
  const databaseUrl = process.env['DATABASE_URL'];
  const secret = process.env['IDENTITY_SECRET'];
  if ((command !== 'issue' && command !== 'revoke') || !legacyFamilyId || !databaseUrl) {
    console.error('usage: legacy:claim-code issue|revoke --legacy-family <id> [--days 7] [--by <text>]  (DATABASE_URL required)');
    return 2;
  }
  if (!secret || secret.length < 32) {
    console.error('IDENTITY_SECRET must be set to at least 32 characters');
    return 2;
  }
  const database = createDatabase(databaseUrl);
  try {
    if (command === 'issue') {
      const by = arg('by');
      const { code, expiresAt } = await issueLegacyClaimCode(database.db, systemClock, deriveIdentityKeys(secret), {
        legacyFamilyId,
        days: Number(arg('days') ?? '7'),
        ...(by === undefined ? {} : { issuedBy: by }),
      });
      console.log(`claim code: ${code}\nexpires:    ${expiresAt.toISOString()}\nThis is shown once. Give it to the parent in person or by a channel you trust.`);
    } else {
      console.log(`revoked: ${await revokeLegacyClaimCodes(database.db, systemClock, legacyFamilyId)}`);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof ManifestError ? `rejected: ${err.message}` : 'the command failed and nothing was changed');
    return 1;
  } finally {
    await database.close();
  }
}

process.exitCode = await main();
