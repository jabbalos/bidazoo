import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { IdentityConfig } from './config';

/**
 * The email-sending boundary. Domain logic depends only on this interface: no vendor, SDK, or
 * transport detail appears anywhere else in the identity module.
 *
 * Shipped transports (Checkpoint E):
 *  - FakeMailer     in-memory outbox for tests.
 *  - FileMailer     appends JSON lines to a file (development and Playwright runs only).
 *  - ConsoleMailer  prints to stdout (development only).
 * Console and file are refused in production by the configuration loader. A production adapter
 * (a transactional sender on a BidaZoo-owned domain, NOT the jonabalos.com sending identity) is a
 * separate, documented hookup behind this same interface. Provider secrets never live in Git.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Tests inspect `outbox`; `failNext` simulates a provider outage. Never reachable over HTTP. */
export class FakeMailer implements Mailer {
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
  constructor(private readonly dir: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, 'outbox.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`, 'utf8');
  }
}

/** Development only: prints the message (including the sign-in link) to the terminal. */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`\n[mail:console] to=${message.to} subject=${message.subject}\n${message.text}\n\n`);
  }
}

export function createMailer(config: Pick<IdentityConfig, 'mailTransport' | 'mailOutboxDir'>): Mailer {
  switch (config.mailTransport) {
    case 'console':
      return new ConsoleMailer();
    case 'file':
      return new FileMailer(config.mailOutboxDir ?? '');
    default:
      throw new Error('no mail transport is configured');
  }
}

/**
 * Sends mail AFTER the HTTP response is decided, so response timing never depends on the
 * provider, and a provider failure can never change what a caller sees. Failures are reported by
 * error name only: a provider error can contain the recipient or the message body.
 */
export class MailDispatcher {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly mailer: Mailer,
    private readonly onFailure: (errorName: string) => void,
  ) {}

  enqueue(message: MailMessage): void {
    const task: Promise<void> = (async () => {
      try {
        await this.mailer.send(message);
      } catch (err) {
        this.onFailure(err instanceof Error ? err.name : 'Error');
      }
    })().finally(() => {
      this.pending.delete(task);
    });
    this.pending.add(task);
  }

  /** Resolves when every queued message has been handed to the transport (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}
