/**
 * Database schema. Postgres on Neon, managed with Drizzle.
 *
 * Two groups of tables: the four Better Auth needs for social login, and the two Curfew needs.
 * A ledger is stored whole as JSON: it is the same serialisable `WarbandState` the browser used to keep,
 * resolved by the same pure engine, so the shape is owned by `src/curfew/ledger.ts` and not duplicated here.
 * Dispatches are the one thing the Town Cryer has to query across warbands, so they get their own rows.
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// ───────────────────────── auth (Better Auth core schema) ─────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ───────────────────────── curfew ─────────────────────────

/**
 * One ledger per warband, kept by the player who claimed it. `state` is the serialised WarbandState;
 * `version` guards concurrent writes (two tabs, or a visit racing the midnight cron).
 */
export const curfewLedgers = pgTable(
  'curfew_ledgers',
  {
    warbandId: text('warband_id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    state: jsonb('state').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('curfew_ledgers_owner_idx').on(t.ownerId)],
);

/**
 * What the Town Cryer may print. A `headline` is a title change, an epithet or a planted flourish;
 * a `happening` is one member's night, chosen occasionally by the seeded dice when the night resolves;
 * a `notice` is posted by the Watch from the admin console. `key` makes writing them idempotent:
 * reconciling twice never prints twice.
 */
export const cryerDispatches = pgTable(
  'cryer_dispatches',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    key: text('key').notNull().unique(),
    warbandId: text('warband_id').notNull(),
    night: integer('night').notNull(),
    kind: text('kind', { enum: ['headline', 'happening', 'notice'] }).notNull(),
    headline: text('headline').notNull(),
    body: text('body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cryer_dispatches_night_idx').on(t.night)],
);

/**
 * Where the campaign is, as a log: each row says the campaign is at `locationId` from `fromNight` on. The
 * current place is the latest row; the place of any past night is the latest row on or before it, so a move
 * never rewrites a night already written. Written only by the game master from the Watch House; the
 * locations themselves are content (`src/data/curfew/locations/`).
 */
export const curfewMoves = pgTable('curfew_moves', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  locationId: text('location_id').notNull(),
  fromNight: integer('from_night').notNull(),
  movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every run of the nightly resolve, by the cron or by hand from the console. */
export const curfewRuns = pgTable('curfew_runs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['cron', 'admin'] }).notNull(),
  night: integer('night').notNull(),
  ledgers: integer('ledgers').notNull(),
  nights: integer('nights').notNull(),
  dispatches: integer('dispatches').notNull(),
  durationMs: integer('duration_ms').notNull(),
});

/**
 * One reset word per player, issued by the Watch and hashed like a password. No emails are sent, so this
 * is how a forgotten password is reset: the game master reads the word to the player, who trades it for a
 * new password at the Ledger. Spent on use; stale after two days.
 */
export const curfewRecovery = pgTable('curfew_recovery', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  phraseHash: text('phrase_hash').notNull(),
  issuedBy: text('issued_by', { enum: ['self', 'watch'] }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const authSchema = { user, session, account, verification };
