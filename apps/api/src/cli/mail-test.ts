/**
 * Operator tool: send ONE harmless test message through the configured mail transport.
 *
 *   npm run identity:mail-test -w @bidazoo/api -- --to someone@example.com
 *
 * Reads the same environment as the API (.env is read if present): IDENTITY_SECRET, PUBLIC_BASE_URL,
 * MAIL_TRANSPORT and the MAIL_* settings. It never touches the database, creates no sign-in token
 * or guardian, and the message carries no link. Output names the transport and the result only:
 * no host, address, credential or provider reply is ever printed.
 */
import { loadIdentityConfig } from '../modules/identity/config';
import { normalizeEmail } from '../modules/identity/email';
import { MailDeliveryError, createMailer } from '../modules/identity/mail';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const to = normalizeEmail(arg('to') ?? '');
  if (to === null) {
    console.error('usage: identity:mail-test --to <address>');
    return 2;
  }
  const env = process.env['NODE_ENV'] === 'production' ? 'production' : process.env['NODE_ENV'] === 'test' ? 'test' : 'development';
  let mailer;
  try {
    const config = loadIdentityConfig(process.env, env);
    if (!config) {
      console.error('identity is not enabled (IDENTITY_SECRET is unset), so no mail transport is configured');
      return 2;
    }
    mailer = createMailer(config);
  } catch (err) {
    // Configuration errors name variables, never values.
    console.error(`mail configuration problem: ${err instanceof Error ? err.message : 'invalid'}`);
    return 2;
  }
  console.error(`transport: ${mailer.name}`);
  try {
    await mailer.send({
      to,
      subject: 'BidaZoo mail test',
      text: 'This is a test message from the BidaZoo operator tool. It contains no link and needs no action.',
    });
    console.log(`sent: yes (transport ${mailer.name})`);
    return 0;
  } catch (err) {
    console.log(`sent: no (${err instanceof MailDeliveryError ? err.category : 'unknown'})`);
    return 1;
  }
}

process.exitCode = await main();
