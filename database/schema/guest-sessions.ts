import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { players } from './players';

/**
 * Browser identity for a guest player.
 *
 * The browser holds a random opaque token in an HttpOnly cookie. Only the SHA-256 hash of that
 * token is stored here, so a database leak does not yield usable cookies. The token has no
 * meaning by itself: it is looked up, never decoded.
 */
export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Hex SHA-256 of the cookie token. */
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('guest_sessions_token_hash_uq').on(t.tokenHash),
    index('guest_sessions_player_idx').on(t.playerId),
  ],
);

export type GuestSession = typeof guestSessions.$inferSelect;
