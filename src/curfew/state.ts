/**
 * CURFEW — per-warband state on this device.
 *
 * There is no server. Each player's device keeps their own warband's ledger in localStorage and
 * resolves nights with the deterministic engine when the date turns. The same orders would produce
 * the same dawn on any device, which is what makes the shared Omen and the Eve ticket honest.
 */
import {
  CAMPAIGN, HAND_SIZE, applyNight, availability, defaultErrand, epithetFor, handHas, localDate, nightForDate, quietNight, resolveNight, returnNight, titleFor, tokenById,
  type Errand, type HandState, type HeldToken, type NightResult, type Order, type TokenOffer, type WarbandLike,
} from './engine.ts';

export interface Flourish { kind: 'field' | 'headline' | 'weather' | 'dedication'; text: string }
export interface EveSession { night: number; tokens: string[]; flourish?: Flourish; ticket: string; provided?: string }
export interface EveRecord { night: number; tokens: string[]; flourish?: Flourish }

export interface WarbandState extends HandState {
  version: 1;
  warbandId: string;
  /** The night the player first opened the Ledger. Nothing before it is resolved. */
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
  headlines: { night: number; text: string }[];
  /** Token offers waiting on a keep-or-discard choice. */
  offers: TokenOffer[];
  eve?: EveSession;
  fights: EveRecord[];
}

const KEY = (id: string) => `curfew:state:${id}`;
const CHOSEN = 'curfew:warband';

export function todayNight(now = new Date()): number {
  const override = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('date') : null;
  return nightForDate(override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : localDate(now));
}

export function chosenWarband(): string | null { try { return localStorage.getItem(CHOSEN); } catch { return null; } }
export function chooseWarband(id: string): void { try { localStorage.setItem(CHOSEN, id); } catch {} }

export function loadState(warband: WarbandLike, today: number): WarbandState {
  let state: WarbandState | null = null;
  try { const raw = localStorage.getItem(KEY(warband.id)); if (raw) state = JSON.parse(raw); } catch {}
  if (!state || state.version !== 1) state = freshState(warband, today);
  return state;
}
export function saveState(state: WarbandState): void { try { localStorage.setItem(KEY(state.warbandId), JSON.stringify(state)); } catch {} }
export function resetState(warbandId: string): void { try { localStorage.removeItem(KEY(warbandId)); } catch {} }

export function freshState(warband: WarbandLike, today: number): WarbandState {
  return {
    version: 1, warbandId: warband.id, favour: 0, shards: 0, renown: 0, hand: [],
    firstSeen: today, lastResolved: Math.max(0, today - 1), orders: {}, nights: [],
    healed: [], rumours: [], epithets: {}, headlines: [], offers: [], fights: [],
  };
}

/** Members who came out of the last recorded battle injured stay home until the player says otherwise. */
export function recoveringMembers(state: WarbandState, injuredInLastBattle: string[]): string[] {
  return injuredInLastBattle.filter((id) => !state.healed.includes(id));
}

export function giveOrders(state: WarbandState, night: number, orders: Order[]): void {
  state.orders[night] = orders.slice(0, CAMPAIGN.membersPerNight).map((o) => ({ memberId: o.memberId, errand: o.errand }));
}

/** The most recent orders the player actually gave, before the given night. Null if none yet. */
export function lastGivenOrders(state: WarbandState, before: number): { night: number; orders: Order[] } | null {
  const nights = Object.keys(state.orders).map(Number).filter((n) => n < before && state.orders[n]?.length).sort((a, b) => b - a);
  return nights.length ? { night: nights[0], orders: state.orders[nights[0]] } : null;
}

/**
 * Standing orders for a night: the last selection the player made, run again at half yield for whoever is
 * still available. Before any selection exists, the first two available members go out on the errand their role suggests.
 */
export function standingOrders(state: WarbandState, warband: WarbandLike, recovering: string[], night = Number.MAX_SAFE_INTEGER): Order[] {
  const avail = new Set(availability(warband, recovering).filter((a) => a.available).map((a) => a.memberId));
  const last = lastGivenOrders(state, night);
  const source: Order[] = last
    ? last.orders
    : warband.members.filter((m) => avail.has(m.id)).slice(0, CAMPAIGN.membersPerNight).map((m) => ({ memberId: m.id, errand: defaultErrand(m) }));
  return source.filter((o) => avail.has(o.memberId)).slice(0, CAMPAIGN.membersPerNight).map((o) => ({ memberId: o.memberId, errand: o.errand, standing: true }));
}

/**
 * Write every dawn that is due. Returns the nights written this call.
 * A gap longer than the campaign's return threshold collapses into a single Return vignette.
 */
export function reconcile(state: WarbandState, warband: WarbandLike, today: number, recovering: string[], rival?: WarbandLike): NightResult[] {
  const written: NightResult[] = [];
  const first = state.lastResolved + 1, last = today - 1;
  if (last < first) return written;
  const pending = last - first + 1;
  const missed = Array.from({ length: pending }, (_, i) => first + i).filter((n) => !state.orders[n]).length;

  if (missed > CAMPAIGN.returnAfterNights && pending === missed) {
    const result = returnNight(last, warband.id);
    state.nights.push(result); written.push(result);
    state.favour = Math.max(state.favour, 20);
    state.lastResolved = last;
    saveState(state);
    return written;
  }

  for (let night = first; night <= last; night++) {
    const given = state.orders[night];
    const orders = given && given.length ? given : standingOrders(state, warband, recovering, night);
    const result = orders.length ? resolveNight({ warband, rival, night, orders, state }) : quietNight(night);
    const before = titleFor(state.renown);
    const applied = applyNight(state, result);
    Object.assign(state, applied.state);
    state.offers.push(...applied.offers);
    normalizeOffers(state);
    for (const res of result.results) if (res.rumour) state.rumours.push({ night, text: res.rumour });
    state.nights.push(result); written.push(result);
    awardEpithets(state, warband, night);
    const after = titleFor(state.renown);
    if (after !== before) state.headlines.push({ night, text: `${warband.name} are spoken of in the taverns as ${after}.` });
    state.lastResolved = night;
  }
  // rumours go cold
  state.rumours = state.rumours.filter((r) => today - r.night <= CAMPAIGN.rumourWarmNights);
  saveState(state);
  return written;
}

function awardEpithets(state: WarbandState, warband: WarbandLike, night: number): void {
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
    const epithet = epithetFor(memberId, byErrand);
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
  state.offers = state.offers.filter((o) => !(o.night === offer.night && o.incoming === offer.incoming && o.held === offer.held));
  if (keep === 'incoming') {
    state.hand = state.hand.filter((h) => h.id !== offer.held);
    state.hand.push({ id: offer.incoming, earnedNight: offer.night });
  }
  normalizeOffers(state);
  saveState(state);
}

export function removeTokens(hand: HeldToken[], ids: string[]): HeldToken[] { return hand.filter((h) => !ids.includes(h.id)); }

/** Everything this device knows, for the Town Cryer's dispatches. */
export function allHeadlines(warbandIds: string[]): { warbandId: string; night: number; text: string }[] {
  const out: { warbandId: string; night: number; text: string }[] = [];
  for (const id of warbandIds) {
    try {
      const raw = localStorage.getItem(KEY(id));
      if (!raw) continue;
      const s = JSON.parse(raw) as WarbandState;
      for (const h of s.headlines ?? []) out.push({ warbandId: id, ...h });
    } catch {}
  }
  return out.sort((a, b) => b.night - a.night);
}
