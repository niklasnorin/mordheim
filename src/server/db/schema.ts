/**
 * Database schema. Postgres on Neon, managed with Drizzle.
 *
 * Three groups of tables: the four Better Auth needs, the Curfew's ledgers and dispatches, and the campaign's
 * record (warbands, members, scenarios, locations, articles, Curfew content) since it moved out of the source files.
 * A ledger is stored whole as JSON: it is the same serialisable `WarbandState` the browser used to keep,
 * resolved by the same pure engine, so the shape is owned by `src/curfew/ledger.ts` and not duplicated here.
 * Dispatches are the one thing the Town Cryer has to query across warbands, so they get their own rows.
 */
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// ───────────────────────── auth (Better Auth core schema) ─────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** A game master helps run the campaign; granted by an admin in the Watch House. Admins are named by ADMIN_EMAILS and count as game masters too. */
  role: text('role', { enum: ['player', 'gm'] }).notNull().default('player'),
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

// ───────────────────────── the campaign ─────────────────────────

/**
 * The warbands, as the players and game masters keep them. The id is forever: it keys the ledger, the dispatches
 * and every scenario record. `owner_id` is the player who keeps the warband; one player, one warband.
 * `battles` and `victories` are counted from the played scenarios, never stored.
 */
export const warbands = pgTable(
  'warbands',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    sigil: text('sigil').notNull(),
    crest: text('crest'),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
    /** The player's name for the card, kept when nobody has signed in to own the warband yet. */
    player: text('player').notNull().default(''),
    rating: integer('rating').notNull().default(0),
    wyrdstone: integer('wyrdstone').notNull().default(0),
    gold: integer('gold').notNull().default(0),
    lore: text('lore').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('warbands_owner_idx').on(t.ownerId)],
);

/** The warriors. Ids are unique across the campaign, as the archives and the ledgers key on them alone. */
export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    warbandId: text('warband_id').notNull().references(() => warbands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull().default(''),
    rank: text('rank', { enum: ['hero', 'henchman'] }).notNull().default('henchman'),
    portrait: text('portrait').notNull().default(''),
    epithet: text('epithet').notNull().default(''),
    dead: boolean('dead').notNull().default(false),
    death: jsonb('death'),
    stats: jsonb('stats').notNull(),
    experience: integer('experience'),
    skills: jsonb('skills').notNull().default([]),
    injuries: jsonb('injuries').notNull().default([]),
    lore: text('lore').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('members_warband_idx').on(t.warbandId)],
);

/**
 * A warband's own story, chapter by chapter, written on its page by its keeper or a game master. `blocks` is the
 * chapter's prose and pictures in order (`ChapterBlock[]` in campaign/model.ts); `sort` orders the chapters.
 */
export const warbandChapters = pgTable(
  'warband_chapters',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    warbandId: text('warband_id').notNull().references(() => warbands.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    blocks: jsonb('blocks').notNull().default([]),
    sort: integer('sort').notNull().default(0),
    authorId: text('author_id'),
    authorName: text('author_name').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('warband_chapters_warband_idx').on(t.warbandId)],
);

/**
 * Pictures uploaded to the site, kept in the database and served at `/images/<id>`: a warband's story pictures
 * (`warband_id`) and a location's map (`location_id`), one or the other. `data` is base64, so it reads back the same
 * through Neon's HTTP driver and PGlite alike; the browser shrinks a picture before it is sent, so a row is a few
 * hundred kilobytes. A story picture no chapter shows is swept a day after it was uploaded; a map goes when replaced.
 */
export const images = pgTable(
  'images',
  {
    id: text('id').primaryKey(),
    warbandId: text('warband_id').references(() => warbands.id, { onDelete: 'cascade' }),
    locationId: text('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    mime: text('mime').notNull(),
    data: text('data').notNull(),
    bytes: integer('bytes').notNull(),
    uploadedBy: text('uploaded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('images_warband_idx').on(t.warbandId)],
);

/**
 * The scenarios: set up by a game master ahead of the game, written up after it. `played_on` is the real day;
 * the Imperial date is derived. `battle` is the current narrative; earlier tellings are in `scenario_revisions`.
 */
export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey(),
  sequence: integer('sequence').notNull(),
  status: text('status', { enum: ['upcoming', 'played'] }).notNull().default('upcoming'),
  title: text('title').notNull(),
  playedOn: text('played_on').notNull(),
  rulebookScenario: text('rulebook_scenario'),
  customRules: text('custom_rules').notNull().default(''),
  winCondition: text('win_condition').notNull().default(''),
  summary: text('summary').notNull().default(''),
  chronicle: text('chronicle').notNull().default(''),
  outcome: text('outcome').notNull().default(''),
  prologue: text('prologue').notNull().default(''),
  /** Until the game is played, the prologue stands in for the summary under the title. */
  prologueAsSummary: boolean('prologue_as_summary').notNull().default(true),
  battle: jsonb('battle').notNull().default([]),
  epilogue: text('epilogue').notNull().default(''),
  battleOpen: boolean('battle_open').notNull().default(false),
  loot: jsonb('loot').notNull().default([]),
  campaignNotes: jsonb('campaign_notes').notNull().default([]),
  puzzle: jsonb('puzzle'),
  /** The battle tracker: the game turn the table is on (0 before the first), and what the scenario scores (empty: the rulebook's tally, or none). */
  turn: integer('turn').notNull().default(0),
  tally: text('tally').notNull().default(''),
  /** The turn after which the game ends of itself (a house scenario's own, or as the game master set it); null runs on. */
  turnLimit: integer('turn_limit'),
  /** Where it is fought: a location of the campaign's, a point of interest there, or a spot on the map (percent of its width and height). */
  locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),
  pointId: integer('point_id').references(() => locationPoints.id, { onDelete: 'set null' }),
  mapX: real('map_x'),
  mapY: real('map_y'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A warband attending a scenario, its result once played, and its own prologue and epilogue. */
export const scenarioWarbands = pgTable(
  'scenario_warbands',
  {
    scenarioId: text('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    warbandId: text('warband_id').notNull().references(() => warbands.id, { onDelete: 'cascade' }),
    result: text('result', { enum: ['victory', 'defeat', 'draw'] }),
    /** Attacker or defender, in a scenario that has sides (campaign/house.ts); null otherwise. */
    side: text('side', { enum: ['attacker', 'defender'] }),
    prologue: text('prologue').notNull().default(''),
    epilogue: text('epilogue').notNull().default(''),
    accomplishments: text('accomplishments').notNull().default(''),
    highlights: jsonb('highlights').notNull().default([]),
    lowlights: jsonb('lowlights').notNull().default([]),
    rating: integer('rating'),
    wyrdstone: integer('wyrdstone'),
    gold: integer('gold'),
  },
  (t) => [primaryKey({ columns: [t.scenarioId, t.warbandId] })],
);

/** A warrior brought to a scenario: how they came out of it and their two moments. */
export const scenarioMembers = pgTable(
  'scenario_members',
  {
    scenarioId: text('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    memberId: text('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
    warbandId: text('warband_id').notNull(),
    status: text('status', { enum: ['active', 'injured', 'dead'] }).notNull().default('active'),
    highlight: text('highlight').notNull().default(''),
    lowlight: text('lowlight').notNull().default(''),
    stats: jsonb('stats'),
    experience: integer('experience'),
  },
  (t) => [primaryKey({ columns: [t.scenarioId, t.memberId] }), index('scenario_members_member_idx').on(t.memberId)],
);

/** Confirmed out-of-action results. */
export const scenarioOutOfAction = pgTable(
  'scenario_out_of_action',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    scenarioId: text('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    attackerId: text('attacker_id').notNull(),
    targetId: text('target_id'),
    target: text('target').notNull(),
    detail: text('detail').notNull().default(''),
    /** The game turn it happened in, when logged at the table; null when written up afterwards. */
    turn: integer('turn'),
  },
  (t) => [index('scenario_ooa_scenario_idx').on(t.scenarioId)],
);

/**
 * The battle tracker's log: what the table noted turn by turn while the game was played. A `note` is anything
 * worth remembering, a `score` counts towards the scenario's tally for one warband. Out-of-action results are
 * not here: they go straight into `scenario_out_of_action` with their turn.
 */
export const scenarioEvents = pgTable(
  'scenario_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    scenarioId: text('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    turn: integer('turn').notNull(),
    kind: text('kind', { enum: ['note', 'score', 'hold', 'roll'] }).notNull(),
    warbandId: text('warband_id'),
    points: integer('points').notNull().default(0),
    text: text('text').notNull().default(''),
    authorId: text('author_id'),
    authorName: text('author_name').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scenario_events_scenario_idx').on(t.scenarioId)],
);

/** Every earlier telling of a battle, kept whole when the narrative is rewritten. */
export const scenarioRevisions = pgTable(
  'scenario_revisions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    scenarioId: text('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    battle: jsonb('battle').notNull(),
    authorId: text('author_id'),
    authorName: text('author_name').notNull().default(''),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scenario_revisions_scenario_idx').on(t.scenarioId)],
);

// ───────────────────────── the campaign's locations ─────────────────────────

/**
 * Where the campaign fights: a town or city as the record keeps it, with its map, its points of interest and its
 * trading post. The id is forever and matches the Curfew's pack for the place (`location:<id>`) where there is one,
 * so Fussenbach is Fussenbach on both sides; a location may have no pack and a pack no record. Seeded from
 * `src/data/locations.ts` when the table is empty; after that a game master keeps them at /locations/.
 */
export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** "Ostermark": the province or the wider country, printed under the name. */
  region: text('region').notNull().default(''),
  description: text('description').notNull().default(''),
  /** The map, as a path on this site: a file under public/ for the seed, `/images/<id>` once a game master uploads one. Null until there is one. */
  map: text('map'),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A point of interest in a location: a tavern, a bridge, a shrine, anything the story turns on. Pinned on the map when
 * `x` and `y` are set (percent of the map's width and height, from the top left corner); in the list either way.
 */
export const locationPoints = pgTable(
  'location_points',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    locationId: text('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** "Tavern", "Bridge": the kind of place, for the list and the pin's label. */
    kind: text('kind').notNull().default(''),
    description: text('description').notNull().default(''),
    x: real('x'),
    y: real('y'),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('location_points_location_idx').on(t.locationId)],
);

/**
 * The trading post at a location, as the game master set it over the rulebook's price chart (`campaign/trading.ts`).
 * A row for a chart item overrides it: whether it is to be had here (null keeps the chart's own rule: common items
 * are, rare ones are not), its price and its rarity (0 is common). A custom item (`custom`) is wholly its row. An item
 * with no row is the chart's as printed.
 */
export const locationStock = pgTable(
  'location_stock',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    locationId: text('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    custom: boolean('custom').notNull().default(false),
    name: text('name').notNull().default(''),
    category: text('category').notNull().default(''),
    available: boolean('available'),
    price: text('price'),
    rarity: integer('rarity'),
    notes: text('notes').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('location_stock_item_idx').on(t.locationId, t.itemId)],
);

/** The Town Cryer's articles and notices, written by game masters, printed where the campaign is. */
export const newsArticles = pgTable('news_articles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  headline: text('headline').notNull(),
  byline: text('byline').notNull().default(''),
  body: text('body').notNull(),
  notice: boolean('notice').notNull().default(false),
  locationId: text('location_id').notNull().default('mordheim'),
  published: boolean('published').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The Curfew's content, one JSON document each: `omens`, `moons`, `tokens`, and `location:<id>` for every
 * place. The engine reads whatever is here; the files under src/data/curfew/ are the seed and the tests' fixture.
 */
export const curfewContent = pgTable('curfew_content', {
  id: text('id').primaryKey(),
  document: jsonb('document').notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every earlier version of a content document, so a bad edit can be read back. */
export const curfewContentRevisions = pgTable(
  'curfew_content_revisions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    contentId: text('content_id').notNull(),
    document: jsonb('document').notNull(),
    version: integer('version').notNull(),
    savedBy: text('saved_by'),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('curfew_content_revisions_content_idx').on(t.contentId)],
);

/**
 * The campaign's switches, one row each, set by the admin in the Watch House: `standingsVisible` says whether the
 * home page prints the standings table and the cards their ratings (hidden until the admin says otherwise).
 */
export const campaignSettings = pgTable('campaign_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSchema = { user, session, account, verification };
