import { createServer, type Server, type Socket } from 'node:net';

/**
 * A tiny SMTP server on 127.0.0.1 for adapter tests. It never leaves the machine, so tests stay
 * offline. It deliberately does NOT offer STARTTLS, and records every byte the client sent so a test
 * can prove what was (and was not) transmitted.
 *
 *  accept       full conversation, message accepted
 *  auth-fail    AUTH is answered 535 with text that echoes `secret` (to prove it never leaks)
 *  data-reject  conversation completes, message rejected after DATA with text echoing `secret`
 *  silent       accepts the connection and says nothing (a hung provider)
 */
export type FakeSmtpMode = 'accept' | 'auth-fail' | 'data-reject' | 'silent';

export interface FakeSmtp {
  port: number;
  /** Everything the client sent, in order. */
  raw(): string;
  /** The DATA section of each accepted or rejected message. */
  messages(): string[];
  connections(): number;
  close(): Promise<void>;
}

export async function startFakeSmtp(mode: FakeSmtpMode, secret = 'provider-echo-SECRET-7731'): Promise<FakeSmtp> {
  let raw = '';
  let connections = 0;
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    if (mode === 'silent') return;
    socket.write('220 fake.test ESMTP ready\r\n');
    let buffer = '';
    let inData = false;
    let authContinuation = false;
    socket.on('data', (chunk) => {
      raw += chunk.toString('latin1');
      buffer += chunk.toString('latin1');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return; // keep buffering until the terminator arrives
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write(mode === 'data-reject' ? `554 5.6.0 message refused: ${secret}\r\n` : '250 2.0.0 queued\r\n');
          continue;
        }
        const eol = buffer.indexOf('\r\n');
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (authContinuation) {
          authContinuation = false;
          socket.write(mode === 'auth-fail' ? `535 5.7.8 Authentication failed for ${secret}\r\n` : '235 2.7.0 ok\r\n');
        } else if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake.test\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
        else if (line.toUpperCase().startsWith('AUTH PLAIN')) {
          if (line.trim().toUpperCase() === 'AUTH PLAIN') {
            authContinuation = true;
            socket.write('334 \r\n');
          } else socket.write(mode === 'auth-fail' ? `535 5.7.8 Authentication failed for ${secret}\r\n` : '235 2.7.0 ok\r\n');
        } else if (verb === 'MAIL' || verb === 'RCPT' || verb === 'RSET' || verb === 'NOOP') socket.write('250 2.1.0 ok\r\n');
        else if (verb === 'DATA') {
          inData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (verb === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
          return;
        } else socket.write('502 5.5.1 not implemented\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    port,
    raw: () => raw,
    messages: () => [...messages],
    connections: () => connections,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Decodes quoted-printable text (soft line breaks and =XX), as found in a captured message. */
export function decodeQuotedPrintable(input: string): string {
  return input.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
