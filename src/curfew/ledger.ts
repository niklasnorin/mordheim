/**
 * CURFEW — the ledger, as pure functions.
 *
 * A WarbandState is one warband's whole ledger: orders by night, resolved nights, the Hand, rumours,
 * epithets, headlines, pending offers and the Eve. Nothing here touches storage or the clock. The server
 * loads a ledger, calls these, and saves what comes back; the same functions would give the same dawn
 * on any machine, which is what makes the shared Omen and the Eve ticket honest.
 */
import {
  CAMPAIGN, DEFAULT_LOCATION, HAND_SIZE, applyNight, availability, cityProvides, defaultErrand, epithetFor, errandAt, eveTicket, handHas, isErrandAt, locationForNight, nightForDate, omenForNight,
  quietNight, resolveNight, returnNight, titleFor, tokenById, unavailableReason,
  type Errand, type HandState, type HeldToken, type Location, type Move, type NightResult, type Order, type TokenOffer, type WarbandLike,
} from './engine.ts';

export interface Flourish { kind: 'field' | 'headline' | 'weather' | 'dedication'; text: string }
export interface EveSession { night: number; tokens: string[]; flourish?: Flourish; ticket: string; provided?: string }
export interface EveRecord { night: number; tokens: string[]; flourish?: Flourish }
export interface Headline { night: number; text: string }

export interface WarbandState extends HandState {
  version: 1;
  warbandId: string;
  /** The night the ledger was opened. Nothing before it is resolved. */
  firstSeen: number;
  /** Highest night whose dawn has been written. */
  lastResolved: number;
  /** Orders given, by night. */
  orders: Record<string, Order[]>;
  /** Resolved nights, oldest first. The Chronicle. */
  nights: NightResult[];
  /** Members the player has marked back on their feet after the last recorded battle. */
  healed: string[];
  rumours: { night: number; text: string }[];
  epithets: Record<string, string>;
  headlines: Headline[];
  /** Token offers waiting on a keep-or-discard choice. */
  offers: TokenOffer[];
  eve?: EveSession;
  /** The charm the City Provided for an Eve not yet laid, so the table can say so. */
  provided?: { night: number; tokenId: string };
  fights: EveRecord[];
}

/** A player-facing refusal. The message is safe to show as written. */
export class LedgerError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function isDate(s: unknown): s is string { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
/** The night for a `?date=` override, or null when there is none. */
export function nightForOverride(date: string | null | undefined): number | null { return isDate(date) ? nightForDate(date) : null; }

export function freshState(warband: WarbandLike, today: number): WarbandState {
  return {
    version: 1, warbandId: warband.id, favour: 0, shards: 0, renown: 0, hand: [],
    firstSeen: today, lastResolved: Math.max(0, today - 1), orders: {}, nights: [],
    healed: [], rumours: [], epithets: {}, headlines: [], offers: [], fights: [],
  };
}

/** Accept a stored ledger if it is one; otherwise start afresh. */
export function coerceState(raw: unknown, warband: WarbandLike, today: number): WarbandState {
  const s = raw as Partial<WarbandState> | null;
  if (!s || s.version !== 1 || s.warbandId !== warband.id || !Array.isArray(s.nights)) return freshState(warband, today);
  return { ...freshState(warband, today), ...s } as WarbandState;
}

/** Members who came out of the last recorded battle injured stay home until the player says otherwise. */
export function recoveringMembers(state: WarbandState, injuredInLastBattle: string[]): string[] {
  return injuredInLastBattle.filter((id) => !state.healed.includes(id));
}

/** Whoever went out the night before rests tonight. Nobody is sent two nights running, not even on standing orders. */
export function restingMembers(state: WarbandState, night: number): string[] {
  return state.nights.find((n) => n.night === night - 1)?.results.map((r) => r.memberId) ?? [];
}

/** Record tonight's orders. Refuses members who cannot go out, errands the place does not offer, and more than the night allows. */
export function giveOrders(state: WarbandState, warband: WarbandLike, night: number, orders: Order[], recovering: string[] = [], location: Location = DEFAULT_LOCATION): void {
  if (night < 1) throw new LedgerError('The city sleeps until the first night.');
  const clean: Order[] = [];
  const avail = availability(warband, recovering, restingMembers(state, night));
  for (const o of orders) {
    if (clean.some((c) => c.memberId === o.memberId)) continue;
    const a = avail.find((x) => x.memberId === o.memberId);
    if (!a) throw new LedgerError('That is not one of yours.');
    if (!a.available) throw new LedgerError(`${warband.members.find((m) => m.id === o.memberId)?.name ?? 'They'} cannot go out tonight.`);
    if (!isErrandAt(o.errand, location)) throw new LedgerError(unavailableReason(o.errand, location));
    clean.push({ memberId: o.memberId, errand: o.errand });
  }
  if (clean.length > CAMPAIGN.membersPerNight) throw new LedgerError(`Only ${CAMPAIGN.membersPerNight} go out a night.`);
  state.orders[night] = clean;
}

export function heal(state: WarbandState, warband: WarbandLike, memberId: string): void {
  if (!warband.members.some((m) => m.id === memberId)) throw new LedgerError('That is not one of yours.');
  if (!state.healed.includes(memberId)) state.healed.push(memberId);
}

/** The most recent orders the player actually gave, before the given night. Null if none yet. */
export function lastGivenOrders(state: WarbandState, before: number): { night: number; orders: Order[] } | null {
  const nights = Object.keys(state.orders).map(Number).filter((n) => n < before && state.orders[n]?.length).sort((a, b) => b - a);
  return nights.length ? { night: nights[0], orders: state.orders[nights[0]] } : null;
}

/**
 * Standing orders for a night: the last selection the player made, run again at half yield for whoever is
 * still available. Whoever went out the night before rests, so a standing selection runs every other night.
 * Before any selection exists, the first two available members go out on the errand their role suggests.
 * An errand the place does not offer (the Pit, after a move to the village) goes where the place sends it.
 */
export function standingOrders(state: WarbandState, warband: WarbandLike, recovering: string[], night = Number.MAX_SAFE_INTEGER, location: Location = DEFAULT_LOCATION): Order[] {
  const avail = new Set(availability(warband, recovering, restingMembers(state, night)).filter((a) => a.available).map((a) => a.memberId));
  const last = lastGivenOrders(state, night);
  const source: Order[] = last
    ? last.orders
    : warband.members.filter((m) => avail.has(m.id)).slice(0, CAMPAIGN.membersPerNight).map((m) => ({ memberId: m.id, errand: defaultErrand(m, location) }));
  return source.filter((o) => avail.has(o.memberId)).slice(0, CAMPAIGN.membersPerNight).map((o) => ({ memberId: o.memberId, errand: errandAt(o.errand, location), standing: true }));
}

/** How many nights back the Dawn Report remembers its own lines, so as not to repeat them. */
export const AVOID_LINES_NIGHTS = 10;
/** The template lines written in the nights just before `night`; see ResolveInput.avoid. */
export function recentLines(state: WarbandState, night: number): string[] {
  const out: string[] = [];
  for (const n of state.nights) if (n.night >= night - AVOID_LINES_NIGHTS && n.night < night) for (const r of n.results) if (r.line) out.push(r.line);
  return out;
}

/** Where the ledger's last written night happened. Nights from before the campaign could move were in Mordheim. Undefined for a blank ledger. */
export function lastLocationId(state: WarbandState): string | undefined {
  for (let i = state.nights.length - 1; i >= 0; i--) { const id = state.nights[i].locationId; if (id) return id; }
  return state.nights.length ? DEFAULT_LOCATION.id : undefined;
}

/**
 * Write every dawn that is due, up to and including the night before `today`. Returns the nights written.
 * A gap longer than the campaign's return threshold collapses into a single Return vignette.
 * `moves` says where the campaign was on each night; a night written after a move keeps the place it was in.
 */
export function reconcile(state: WarbandState, warband: WarbandLike, today: number, recovering: string[], rival?: WarbandLike | WarbandLike[], moves: readonly Move[] = []): NightResult[] {
  const written: NightResult[] = [];
  const first = state.lastResolved + 1, last = today - 1;
  if (last < first) return written;
  const pending = last - first + 1;
  const missed = Array.from({ length: pending }, (_, i) => first + i).filter((n) => !state.orders[n]).length;

  if (missed > CAMPAIGN.returnAfterNights && pending === missed) {
    const result = returnNight(last, warband.id, locationForNight(last, moves));
    state.nights.push(result); written.push(result);
    state.favour = Math.max(state.favour, 20);
    state.lastResolved = last;
    return written;
  }

  for (let night = first; night <= last; night++) {
    const location = locationForNight(night, moves);
    const resting = restingMembers(state, night);
    // orders given before a move for an errand the new place lacks go where the place sends them
    const given = state.orders[night]?.filter((o) => !resting.includes(o.memberId)).map((o) => ({ ...o, errand: errandAt(o.errand, location) }));
    const orders = given && given.length ? given : standingOrders(state, warband, recovering, night, location);
    const arrived = lastLocationId(state);
    const result = orders.length ? resolveNight({ warband, rival, night, orders, state, location, avoid: recentLines(state, night) }) : quietNight(night, location);
    const before = titleFor(state.renown);
    const applied = applyNight(state, result);
    Object.assign(state, applied.state);
    state.offers.push(...applied.offers);
    normalizeOffers(state);
    for (const res of result.results) if (res.rumour) state.rumours.push({ night, text: res.rumour });
    state.nights.push(result); written.push(result);
    // the first night in a new place is news
    if (arrived && arrived !== location.id) state.headlines.push({ night, text: location.arrival.replace(/\{warband\}/g, warband.name) });
    awardEpithets(state, warband, night, location);
    const after = titleFor(state.renown);
    if (after !== before) state.headlines.push({ night, text: `${warband.name} are spoken of in the taverns as ${after}.` });
    state.lastResolved = night;
  }
  // rumours go cold
  state.rumours = state.rumours.filter((r) => today - r.night <= CAMPAIGN.rumourWarmNights);
  return written;
}

function awardEpithets(state: WarbandState, warband: WarbandLike, night: number, location: Location): void {
  const counts: Record<string, Partial<Record<Errand, number>>> = {};
  for (const n of state.nights) for (const r of n.results) {
    counts[r.memberId] ??= {};
    counts[r.memberId][r.errand] = (counts[r.memberId][r.errand] ?? 0) + 1;
  }
  for (const [memberId, byErrand] of Object.entries(counts)) {
    if (state.epithets[memberId]) continue;
    const total = Object.values(byErrand).reduce((a, b) => a + (b ?? 0), 0);
    if (total < CAMPAIGN.epithetAfterEntries) continue;
    const member = warband.members.find((m) => m.id === memberId);
    if (!member) continue;
    const epithet = epithetFor(memberId, byErrand, location);
    state.epithets[memberId] = epithet;
    state.headlines.push({ night, text: `${member.name} is called ${member.name.split(' ')[0]} ${epithet} now. Nobody remembers who started it.` });
  }
}

/**
 * Keep the pending offers to one decision per token type. A charm already held is no offer at all;
 * a newer find of the same type replaces an older unsettled one (the older went in the river unremarked);
 * an offer whose rival charm has since left the Hand is re-aimed at whatever now fills that slot,
 * or simply taken into the Hand if there is room.
 */
export function normalizeOffers(state: WarbandState): void {
  const byType = new Map<string, TokenOffer>();
  for (const o of state.offers) {
    if (state.hand.some((h) => h.id === o.incoming)) continue;
    const type = tokenById(o.incoming).type;
    const prev = byType.get(type);
    if (!prev || o.night >= prev.night) byType.set(type, o);
  }
  const out: TokenOffer[] = [];
  for (const o of byType.values()) {
    const sameType = handHas(state.hand, tokenById(o.incoming).type);
    const held = sameType ?? (state.hand.length >= HAND_SIZE ? state.hand.slice().sort((a, b) => a.earnedNight - b.earnedNight)[0] : undefined);
    if (!held) { state.hand.push({ id: o.incoming, earnedNight: o.night }); continue; }
    out.push({ night: o.night, incoming: o.incoming, held: held.id });
  }
  state.offers = out;
}

/** Settle a keep-or-discard offer. */
export function settleOffer(state: WarbandState, offer: TokenOffer, keep: 'incoming' | 'held'): void {
  const found = state.offers.find((o) => o.night === offer.night && o.incoming === offer.incoming && o.held === offer.held);
  if (!found) throw new LedgerError('That decision has already been made.');
  state.offers = state.offers.filter((o) => o !== found);
  if (keep === 'incoming') {
    state.hand = state.hand.filter((h) => h.id !== offer.held);
    state.hand.push({ id: offer.incoming, earnedNight: offer.night });
  }
  normalizeOffers(state);
}

export function removeTokens(hand: HeldToken[], ids: string[]): HeldToken[] { return hand.filter((h) => !ids.includes(h.id)); }

// ───────────────────────── the Eve of Battle ─────────────────────────

/** The City Provides: an empty Hand at the Eve is dealt one charm of the place's. Returns its id, or null if the Hand was not empty. */
export function provideIfEmpty(state: WarbandState, night: number, location: Location = DEFAULT_LOCATION): string | null {
  if (state.hand.length) return null;
  const token = cityProvides(state.warbandId, night, location);
  state.hand.push({ id: token.id, earnedNight: night });
  state.provided = { night, tokenId: token.id };
  return token.id;
}

/** Lay the table: choose which charms to bring and, optionally, spend Favour on one flourish. */
export function layTable(state: WarbandState, warband: WarbandLike, night: number, bring: string[], flourish?: Flourish): void {
  if (state.eve) throw new LedgerError('The table is already laid.');
  if (night < 1) throw new LedgerError('The city sleeps until the first night.');
  const held = new Set(state.hand.map((h) => h.id));
  const tokens = [...new Set(bring)].filter((id) => held.has(id));
  if (flourish) {
    const text = flourish.text.trim();
    if (!text) throw new LedgerError('The flourish needs words.');
    if (text.length > 120) throw new LedgerError('The flourish is too long for the broadsheet.');
    if (flourish.kind === 'dedication' && !warband.members.some((m) => m.dead && m.name === text)) throw new LedgerError('A dedication is for one of the dead.');
    if (state.favour < CAMPAIGN.flourishCost) throw new LedgerError(`A flourish costs ${CAMPAIGN.flourishCost} Favour.`);
    state.favour -= CAMPAIGN.flourishCost;
    flourish = { kind: flourish.kind, text };
    if (flourish.kind === 'headline') state.headlines.push({ night, text });
  }
  state.hand = state.hand.filter((h) => tokens.includes(h.id));
  state.eve = { night, tokens, flourish, ticket: eveTicket(state.warbandId, night, tokens.length), provided: state.provided?.tokenId };
  delete state.provided;
}

/** The fight is done: the charms are spent and the Chronicle gets a line. */
export function fightDone(state: WarbandState, night: number): void {
  const eve = state.eve;
  if (!eve) throw new LedgerError('No table is laid.');
  state.fights.push({ night: eve.night, tokens: eve.tokens, flourish: eve.flourish });
  state.nights.push({
    night, omenId: omenForNight(night).id, moonId: '', header: `Night ${night} — the fight.`, results: [],
    detail: eve.tokens.length ? `They went out carrying ${eve.tokens.map((id) => tokenById(id).name).join(', ')}. None of it came back.` : 'They went out with empty hands. That is also a way to go.',
    ledger: eve.flourish ? [`Flourish: ${eve.flourish.text}`] : [],
  });
  state.hand = removeTokens(state.hand, eve.tokens);
  state.eve = undefined;
}

/** Put the charms back in the Hand and reopen the table. Spent Favour does not return. */
export function putBack(state: WarbandState): void {
  const eve = state.eve;
  if (!eve) throw new LedgerError('No table is laid.');
  for (const id of eve.tokens) if (!state.hand.some((h) => h.id === id)) state.hand.push({ id, earnedNight: eve.night });
  state.eve = undefined;
}
