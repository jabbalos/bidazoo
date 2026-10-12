import { createDatabase } from '@bidazoo/api/db';
import { describe, expect, it } from 'vitest';

describe('database pool resilience', () => {
  it('survives an idle-connection error instead of crashing the process', async () => {
    // Regression test: found when PostgreSQL was stopped under a running API.
    // An unhandled pool "error" event is an uncaught exception that kills the server.
    // Port 1 is never listening; the pool connects lazily so no I/O happens here.
    const errors: Error[] = [];
    const database = createDatabase('postgres://user:pw@127.0.0.1:1/none', {
      onError: (err) => errors.push(err),
    });

    expect(() =>
      database.pool.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('terminating connection');

    await database.close();
  });

  it('still does not crash when no onError handler is supplied', async () => {
    const database = createDatabase('postgres://user:pw@127.0.0.1:1/none');
    expect(() => database.pool.emit('error', new Error('boom'))).not.toThrow();
    await database.close();
  });

  it('ping rejects (rather than hanging) when the database is unreachable', async () => {
    const database = createDatabase('postgres://user:pw@127.0.0.1:1/none');
    await expect(database.ping()).rejects.toThrow();
    await database.close();
  });
});
