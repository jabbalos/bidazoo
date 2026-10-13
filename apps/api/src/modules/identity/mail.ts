import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { IdentityConfig } from './config';
import { SmtpMailer } from './mail-smtp';

/**
 * The email-sending boundary. Domain logic depends only on this interface: no vendor, SDK, or
 * transport detail appears anywhere else in the identity module.
 *
 * Transports:
 *  - FakeMailer     in-memory outbox for tests.
 *  - FileMailer     appends JSON lines to a file (development and Playwright runs only).
 *  - ConsoleMailer  prints to stdout (development only).
 *  - SmtpMailer     production-capable, provider-neutral SMTP (see mail-smtp.ts).
 * Console and file are refused in production by the configuration loader, and production identity
 * REQUIRES the SMTP transport: there is no silent fallback to anything that does not really send.
 * The sender is a BidaZoo-owned address, never the jonabalos.com sending identity. Provider
 * secrets never live in Git.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML twin of `text`. */
  html?: string;
}

export interface Mailer {
  /** Short transport label for safe logging ("smtp", "file", ...). Never a host or credential. */
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** Why a send failed, in terms that are safe to log. No recipient, reply text, host or credential. */
export type MailFailureCategory = 'connection' | 'timeout' | 'auth' | 'tls' | 'rejected' | 'temporary' | 'overloaded' | 'unknown';

export interface MailFailure {
  operation: string;
  transport: string;
  category: MailFailureCategory;
  /** SMTP reply class when the server answered with one. */
  statusClass?: '4xx' | '5xx';
}

/** The only error a delivery adapter lets out: a category and a status class, nothing else. */
export class MailDeliveryError extends Error {
  constructor(
    readonly category: MailFailureCategory,
    readonly statusClass?: '4xx' | '5xx',
  ) {
    super(`mail delivery failed (${category})`);
    this.name = 'MailDeliveryError';
  }
}

/** The one place a mail failure becomes a log line. Structured fields only. */
export function logMailFailure(log: { warn(fields: object, message: string): void }, failure: MailFailure): void {
  log.warn({ mail: failure }, 'mail send failed');
}

/** Tests inspect `outbox`; `failNext` simulates a provider outage. Never reachable over HTTP. */
export class FakeMailer implements Mailer {
  readonly name = 'fake';
  readonly outbox: MailMessage[] = [];
  private failures = 0;

  /** Make the next `count` sends fail. */
  failNext(count = 1): void {
    this.failures += count;
  }

  async send(message: MailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('simulated mail provider outage');
    }
    this.outbox.push({ ...message });
  }

  /** The most recent message to `to`, or undefined. */
  lastTo(to: string): MailMessage | undefined {
    return [...this.outbox].reverse().find((message) => message.to === to);
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

/** Development and e2e only: writes one JSON object per line so a test runner can read the link. */
export class FileMailer implements Mailer {
  readonly name = 'file';
  constructor(private readonly dir: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, 'outbox.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`, 'utf8');
  }
}

/** Development only: prints the message (including the sign-in link) to the terminal. */
export class ConsoleMailer implements Mailer {
  readonly name = 'console';
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`\n[mail:console] to=${message.to} subject=${message.subject}\n${message.text}\n\n`);
  }
}

export function createMailer(config: Pick<IdentityConfig, 'mailTransport' | 'mailOutboxDir' | 'smtp'>): Mailer {
  switch (config.mailTransport) {
    case 'smtp':
      if (!config.smtp) throw new Error('MAIL_TRANSPORT=smtp needs SMTP settings');
      return new SmtpMailer(config.smtp);
    case 'console':
      return new ConsoleMailer();
    case 'file':
      return new FileMailer(config.mailOutboxDir ?? '');
    default:
      throw new Error('no mail transport is configured');
  }
}

/** Bound on messages in flight at once. A stuck provider can hold at most this many (each also has a deadline). */
const MAX_PENDING = 50;

/**
 * Sends mail AFTER the HTTP response is decided, so response timing never depends on the
 * provider, and a provider failure can never change what a caller sees (the public answer to
 * "email me a link" is the same whether or not delivery works, so it leaks nothing about either).
 * Failures are reported as a safe category only: a provider error can contain the recipient, the
 * server's reply, the message body or credentials. One attempt, no retry.
 */
export class MailDispatcher {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly mailer: Mailer,
    private readonly onFailure: (failure: MailFailure) => void,
  ) {}

  enqueue(message: MailMessage, operation = 'guardian_login_link'): void {
    const transport = this.mailer.name;
    if (this.pending.size >= MAX_PENDING) {
      this.report({ operation, transport, category: 'overloaded' });
      return;
    }
    const task: Promise<void> = (async () => {
      try {
        await this.mailer.send(message);
      } catch (err) {
        this.report(
          err instanceof MailDeliveryError
            ? { operation, transport, category: err.category, ...(err.statusClass === undefined ? {} : { statusClass: err.statusClass }) }
            : { operation, transport, category: 'unknown' },
        );
      }
    })().finally(() => {
      this.pending.delete(task);
    });
    this.pending.add(task);
  }

  private report(failure: MailFailure): void {
    try {
      this.onFailure(failure);
    } catch {
      // Logging must never throw into the request path.
    }
  }

  /** Resolves when every queued message has been handed to the transport (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}
