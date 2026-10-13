import nodemailer from 'nodemailer';
import type { Mailer, MailMessage } from './mail';
import { MailDeliveryError, type MailFailureCategory } from './mail';

/**
 * Generic SMTP delivery. Provider-neutral on purpose: any transactional relay that speaks SMTP
 * (host, port, TLS, user, password) works, and nothing here or in the domain code names a vendor.
 *
 * Guarantees:
 *  - ONE attempt per message, no retries; a hard overall deadline (`timeoutSeconds`) plus the
 *    library's connect / greeting / socket timeouts, so a stuck provider cannot hold work open.
 *  - TLS is always verified (certificate and hostname). `tls` = TLS from the first byte (port 465
 *    style); `starttls` = the connection MUST upgrade or the send fails (never downgrades to
 *    plaintext). `none` exists for a local development catcher only and is refused in production
 *    by the configuration loader.
 *  - Failures surface as MailDeliveryError carrying a category and a status class ONLY. The
 *    library's own error (which can echo the recipient, the server's reply, or credentials) is
 *    dropped here and never reaches logs, responses or `cause`.
 *  - No file or URL access from message content, no library logging.
 */

export type SmtpSecurity = 'tls' | 'starttls' | 'none';

export interface SmtpSettings {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string | undefined;
  password: string | undefined;
  fromAddress: string;
  fromName: string;
  timeoutSeconds: number;
}

/** The slice of a nodemailer transport this adapter uses. Tests substitute a fake right here. */
export interface SmtpTransportLike {
  sendMail(options: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

function createTransport(settings: SmtpSettings): SmtpTransportLike {
  const ms = settings.timeoutSeconds * 1000;
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'tls',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    ...(settings.user !== undefined && settings.password !== undefined ? { auth: { user: settings.user, pass: settings.password } } : {}),
    connectionTimeout: ms,
    greetingTimeout: ms,
    socketTimeout: ms,
    pool: false,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  }) as unknown as SmtpTransportLike;
}

const CONNECTION_CODES = new Set(['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EDNS', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ESOCKET']);
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ETIMEOUT']);

/** Maps a library error to a safe category using only its machine fields (code, responseCode), never its text. */
export function classifyMailError(err: unknown): { category: MailFailureCategory; statusClass?: '4xx' | '5xx' } {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.responseCode === 'number' ? e.responseCode : undefined;
  const statusClass = status === undefined ? undefined : status >= 500 ? ('5xx' as const) : status >= 400 ? ('4xx' as const) : undefined;
  const withClass = (category: MailFailureCategory) => (statusClass === undefined ? { category } : { category, statusClass });
  if (TIMEOUT_CODES.has(code)) return withClass('timeout');
  if (code === 'EAUTH' || status === 530 || status === 534 || status === 535) return withClass('auth');
  if (code === 'ETLS' || code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'ERR_SSL') return withClass('tls');
  if (CONNECTION_CODES.has(code)) return withClass('connection');
  if (code === 'EENVELOPE' || code === 'EMESSAGE' || code === 'EPROTOCOL' || (status !== undefined && status >= 500)) return withClass('rejected');
  if (status !== undefined && status >= 400) return withClass('temporary');
  return withClass('unknown');
}

export class SmtpMailer implements Mailer {
  readonly name = 'smtp';
  private readonly transport: SmtpTransportLike;

  constructor(
    private readonly settings: SmtpSettings,
    deps: { transport?: SmtpTransportLike } = {},
  ) {
    this.transport = deps.transport ?? createTransport(settings);
  }

  async send(message: MailMessage): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new MailDeliveryError('timeout')), this.settings.timeoutSeconds * 1000);
    });
    const attempt = this.transport
      .sendMail({
        from: { name: this.settings.fromName, address: this.settings.fromAddress },
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      .then(
        () => undefined,
        (err: unknown) => {
          const { category, statusClass } = classifyMailError(err);
          throw new MailDeliveryError(category, statusClass);
        },
      );
    try {
      await Promise.race([attempt, deadline]);
    } catch (err) {
      // Free the socket if the deadline won; the losing attempt's rejection is already handled.
      if (err instanceof MailDeliveryError && err.category === 'timeout') this.transport.close();
      attempt.catch(() => undefined);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
