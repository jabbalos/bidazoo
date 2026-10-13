/**
 * What may be written to the application log about an unexpected error.
 *
 * Database errors are the hazard. Drizzle's "Failed query" message embeds the SQL text AND every
 * bound parameter, and PostgreSQL's own `detail` repeats the offending key ("Key (email)=(...)").
 * In the identity tables those values are token hashes, code hashes, PIN hashes and email
 * addresses, so logging the raw error would put credentials in the log. For anything that looks
 * like a database error only the class of failure is logged (error name, SQLSTATE, constraint and
 * table names); every other error is logged in full, as before.
 */

type Chained = { name?: unknown; message?: unknown; code?: unknown; detail?: unknown; routine?: unknown; severity?: unknown; constraint?: unknown; table?: unknown; params?: unknown; cause?: unknown };

function chain(error: unknown): Chained[] {
  const out: Chained[] = [];
  let current: unknown = error;
  for (let i = 0; i < 4 && typeof current === 'object' && current !== null; i += 1) {
    out.push(current as Chained);
    current = (current as Chained).cause;
  }
  return out;
}

function isDatabaseError(link: Chained): boolean {
  return (
    link.name === 'DrizzleQueryError' ||
    'params' in link ||
    (typeof link.message === 'string' && link.message.startsWith('Failed query')) ||
    (typeof link.code === 'string' && ('detail' in link || 'routine' in link || 'severity' in link))
  );
}

export function describeErrorForLog(error: unknown): Record<string, unknown> {
  const links = chain(error);
  if (!links.some(isDatabaseError)) return { err: error };
  const pg = links.find((l) => typeof l.code === 'string');
  const fields: Record<string, unknown> = { errorName: typeof links[0]?.name === 'string' ? links[0].name : 'Error', databaseError: true };
  if (pg) {
    if (typeof pg.code === 'string') fields['sqlState'] = pg.code;
    if (typeof pg.constraint === 'string') fields['constraint'] = pg.constraint;
    if (typeof pg.table === 'string') fields['table'] = pg.table;
  }
  return fields;
}
