/**
 * The Tarot of the Damned, at the table: an optional rule a game master switches on for a scenario.
 *
 * Every warband that fights has a deck of the thirty cards the Curfew draws its Omens from, shuffled once for the
 * game. At the start of the game each is dealt a hand of three, hidden from the other side. A card is good for the
 * turn it was drawn on and the next; at the start of the turn after, it fades, and at the start of every turn the
 * hand is filled back up to three. A card played is shown to the table and logged. What a card does is small: a
 * point on a roll, a re-roll, an inch, a test passed, and a few that only come into their own at a certain hour.
 *
 * Pure: the hand is a function of (state, turn), so the server, the tracker and the tests agree. The deal itself
 * takes a seed the server makes up, so nobody at the table can work out the other side's deck from the code.
 */
import omensData from '../data/curfew/omens.json' with { type: 'json' };
import { hashSeed, rng, shuffle } from '../lib/random.ts';
import type { ScenarioEvent } from './model.ts';

export const TAROT_NAME = 'The Tarot of the Damned';
/** The hand is filled back up to this many at the start of every turn. */
export const HAND_SIZE = 3;
/** A card is good for this many turns, the one it was drawn on included; at the start of the next it fades. */
export const CARD_LASTS = 2;

/** A boon helps you, a bane hinders them, a twist does something to the whole table. */
export type TarotKind = 'boon' | 'bane' | 'twist';
export const TAROT_KIND_LABEL: Record<TarotKind, string> = { boon: 'A boon', bane: 'A bane', twist: 'A twist' };

export interface TarotCard {
  id: string;
  numeral: string;
  title: string;
  image: string;
  kind: TarotKind;
  /** The rule in a few words, no frills, for under the card in the hand: “+1 to wound, one roll”. */
  short: string;
  /** The whole rule: when it may be played, and what it does. */
  rule: string;
  /** A line of flavour after the rule, in another voice. */
  flavour: string;
  /** Only in the first turn, or only in the last round; the hand says so, and greys the card out at other times. */
  only?: 'first' | 'last';
}

type Effect = Pick<TarotCard, 'short' | 'kind' | 'rule' | 'flavour' | 'only'>;

/** What each card does, by the Omen's id. A rule of the game, so code; the picture and the title are the Omen's. */
const EFFECTS: Record<string, Effect> = {
  'ash-wind': { short: '+1″ move for one model', kind: 'boon', rule: 'In your movement phase, one of your warriors moves 1″ further this turn, walking, running or charging.', flavour: 'The wind covers the footfall.' },
  'drowned-bell': { short: 'Enemy Leadership test at −1', kind: 'bane', rule: 'When an enemy warrior takes a Leadership test, they take it at −1.', flavour: 'Something is tolling under the water, and it is not for you.' },
  'hanged-merchant': { short: 'After the game: re-roll one exploration die', kind: 'boon', rule: 'Play at any time and keep it face up to the end. After the game, re-roll one of your exploration dice.', flavour: 'The merchant’s ledger had one more page in it.' },
  'green-light-under-ash': { short: 'A stunned model gets up as knocked down', kind: 'boon', rule: 'In your recovery phase, one of your stunned warriors stands up as knocked down instead.', flavour: 'The green does that to a body, for a while.' },
  'hammer-reversed': { short: 'Enemy casts or prays at −1', kind: 'bane', rule: 'When an enemy prays or casts a spell, they roll at −1 to cast.', flavour: 'The hammer is turned the wrong way tonight.' },
  'rat-kings-court': { short: 'Pick an enemy model: it may not run this turn', kind: 'bane', rule: 'At the start of an enemy movement phase, name one enemy warrior: they may not run this turn.', flavour: 'Something in the gutters has hold of their heel.' },
  'empty-cradle': { short: 'A model out of action does not count for rout this turn', kind: 'boon', rule: 'When one of your warriors is taken out of action, they are not counted against you for rout tests this turn.', flavour: 'The warband has not noticed yet.' },
  'lantern-bearer': { short: 'One shooter ignores cover this turn', kind: 'boon', rule: 'In your shooting phase, one of your warriors ignores the −1 for shooting at a target in cover this turn.', flavour: 'The lantern found them.' },
  'the-comet': { short: 'Turn 1 only: +1″ move for all your models', kind: 'boon', only: 'first', rule: 'In the first turn only. Every warrior of yours adds 1″ to their move this turn.', flavour: 'The sky lit the way in.' },
  'broken-bell': { short: 'Re-roll a failed rout test', kind: 'boon', rule: 'When your warband fails a rout test, re-roll it. The second roll stands, whatever it says.', flavour: 'Nobody heard the bell the first time.' },
  'fences-scales': { short: 'Enemy picking up a shard drops it on a 1', kind: 'bane', rule: 'When an enemy warrior picks up a shard, a relic or an objective, they drop it on a D6 roll of 1.', flavour: 'Everyone else saw where it fell.' },
  'plague-doctor': { short: 'After the game: re-roll one serious injury', kind: 'boon', rule: 'When one of your warriors is taken out of action, play it and keep it face up. After the game, re-roll their serious injury once; the second roll stands.', flavour: 'The doctor’s fee is whatever is in their pockets.' },
  'witch-hunter': { short: 'Pass a Fear or All Alone test', kind: 'boon', rule: 'When one of your warriors must take a Fear or an All Alone test, they pass it.', flavour: 'The witch hunter has seen worse than this, and said so.' },
  'crooked-dice': { short: 'Re-roll one of your dice', kind: 'boon', rule: 'After any one die roll of yours, re-roll it. The second result stands, even if it is worse.', flavour: 'Crooked cuts both ways.' },
  'the-pit': { short: 'Enemy climbs or jumps at −1 Initiative', kind: 'bane', rule: 'When an enemy warrior climbs or jumps, they take the test at −1 Initiative.', flavour: 'The Pit is closer than it looks.' },
  'drowned-quarter': { short: 'This turn: all shots over 12″ at −1, both sides', kind: 'twist', rule: 'At the start of any turn. Until the end of the turn, every shot over 12″ is at −1, yours and theirs.', flavour: 'The fog is up from the river.' },
  'sisters-candle': { short: 'Re-roll a failed armour save', kind: 'boon', rule: 'When one of your warriors fails an armour save, re-roll it.', flavour: 'The candle was lit for them this morning; nobody knows by whom.' },
  'black-sails': { short: 'Pick a hidden enemy within 12″: no longer hidden', kind: 'bane', rule: 'In your shooting phase, name one hidden enemy warrior within 12″ of one of yours: they are hidden no longer.', flavour: 'The raiders have been seen coming off the river before.' },
  'nameless-grave': { short: 'Enemy rolls to wound you at −1', kind: 'bane', rule: 'When an enemy rolls to wound one of your warriors, they roll at −1.', flavour: 'The grave is dug, but not for this one.' },
  'whispering-wall': { short: 'See the other side’s hand until the end of next turn', kind: 'boon', rule: 'Play at any time. You see the other side’s hand, in your own, until the end of the next turn.', flavour: 'Thin walls, and somebody on the other side of them talking in their sleep.' },
  'tower-on-the-rock': { short: '+1 armour save when higher than the attacker', kind: 'boon', rule: 'In close combat, when one of your warriors stands higher than their attacker, they get +1 to their armour save this turn, a 6+ if they have none.', flavour: 'Height is a kind of armour.' },
  'beggar-king': { short: 'A henchman uses the leader’s Leadership for one test', kind: 'boon', rule: 'When one of your henchmen takes a Leadership test, they use your leader’s Leadership, wherever he is.', flavour: 'The beggar king lends a crown for the hour.' },
  'cracked-hourglass': { short: 'A model that ran may still shoot, at −1', kind: 'boon', rule: 'In your shooting phase, one of your warriors who ran this turn may shoot anyway, at −1.', flavour: 'The hour had a little more in it than it should.' },
  'twin-moons': { short: 'This turn: nobody may hide', kind: 'twist', rule: 'At the start of any turn. Until the end of the turn, nobody may hide; warriors already hidden stay so.', flavour: 'Both moons are out.' },
  'sealed-door': { short: 'Cancel a bane played against you', kind: 'boon', rule: 'When the other side plays a bane against you, their card is spent and does nothing.', flavour: 'The door was bolted from the inside, and nobody will say by whom.' },
  'wyrd-lantern': { short: 'One model in the open counts as in cover', kind: 'boon', rule: 'In your movement phase, one of your warriors in the open counts as in cover until the start of your next turn.', flavour: 'The lantern throws a shadow that does not match.' },
  'carrion-crown': { short: '+1 Experience for a model that takes an enemy out', kind: 'boon', rule: 'When one of your warriors takes an enemy out of action, that warrior gains +1 Experience after the game.', flavour: 'The crows have given a name.' },
  'the-ferryman': { short: 'Last round: after the game, re-roll a Dead result', kind: 'boon', only: 'last', rule: 'In the last round only; keep it face up. After the game, if one of your warriors rolls Dead on the serious injury table, re-roll it once; the second roll stands.', flavour: 'The ferryman was busy elsewhere.' },
  'bone-hand': { short: '+1 to wound, one roll', kind: 'boon', rule: 'When one of your warriors rolls to wound in close combat, +1 to one roll to wound.', flavour: 'The hand knows where the ribs part.' },
  'last-candle': { short: 'Last round: re-roll one failed roll', kind: 'boon', only: 'last', rule: 'In the last round only. One of your warriors re-rolls one failed roll this round.', flavour: 'The last light goes where it is most needed.' },
};

/** The deck, in the Omens' order: the built-in thirty, with their pictures, and what each does at the table. */
export const TAROT: readonly TarotCard[] = omensData.omens.map((o) => {
  const e = EFFECTS[o.id];
  if (!e) throw new Error(`The Tarot of the Damned has no effect for the Omen "${o.id}".`);
  return { id: o.id, numeral: o.numeral, title: o.title, image: o.image, ...e };
});
/** The card back, the same one the Curfew turns over at dusk. */
export const TAROT_BACK = '/curfew/omens/back.png';

export function cardById(id: string): TarotCard | undefined { return TAROT.find((c) => c.id === id); }

/** The card that opens the other side's hand to you, for as long as a card is good. */
export const WALL_CARD = 'whispering-wall';
/** The card that shuts a bane. */
export const DOOR_CARD = 'sealed-door';

/** The rules as the scenario page prints them. */
export const TAROT_RULES: string[] = [
  `Every warband that fights has its own deck of the thirty cards: the Tarot the Curfew draws its Omens from, shuffled once for the game.`,
  `At the start of the game each is dealt a hand of ${HAND_SIZE}, hidden from the other side. The hand is on your phone, in the battle tracker, behind the Tarot button.`,
  `A card is good for the turn it was drawn on and the next. At the start of the turn after, it fades; at the start of every turn the hand is filled back up to ${HAND_SIZE}.`,
  `Play a card when its moment comes, as the card says. Show it to the table: the tracker holds it up large, and the log records it. A card played is spent.`,
  `When the deck runs out, the cards played and faded are shuffled back in. A card that says to keep it face up stays on the table to the end.`,
  `Two cards work on the cards themselves: The Sealed Door shuts a bane played against you, and The Whispering Wall shows you the other side’s hand, in your own, for as long as a card is good.`,
  `None of it is strong. A point on a roll, a re-roll, an inch. The table settles what the card does not say.`,
];

// ───────────────────────── the hand ─────────────────────────

export interface HeldCard { id: string; /** The turn it was drawn on; 1 for the opening hand. */ drawnOn: number }
export interface PlayedCard { id: string; turn: number }
export interface FadedCard { id: string; drawnOn: number; /** The turn it faded at the start of. */ turn: number }

/** One warband's deck for one game. Kept whole as JSON against the scenario's warband row. */
export interface TarotState {
  seed: string;
  /** The cards still to be drawn, next first. */
  deck: string[];
  hand: HeldCard[];
  played: PlayedCard[];
  faded: FadedCard[];
  /** How many times the deck has been shuffled; seeds the next shuffle. */
  shuffles: number;
  /** The last turn the hand was filled on; 0 before the opening hand. The hand fills once a turn, never twice. */
  reckonedOn: number;
}

/** A fresh deck, shuffled from the seed; nothing dealt yet. */
export function newTarot(seed: string): TarotState {
  return { seed, deck: shuffle(rng(hashSeed(seed, 'tarot', 0)), TAROT.map((c) => c.id)), hand: [], played: [], faded: [], shuffles: 1, reckonedOn: 0 };
}

/** Something stored that may or may not be a deck: an older shape, a missing field, nothing at all. */
export function coerceTarot(given: unknown): TarotState | null {
  if (!given || typeof given !== 'object') return null;
  const g = given as Partial<TarotState>;
  if (typeof g.seed !== 'string') return null;
  const ids = new Set(TAROT.map((c) => c.id));
  const strs = (l: unknown) => (Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string' && ids.has(x)) : []);
  const held = (l: unknown): HeldCard[] => (Array.isArray(l) ? l.filter((x): x is HeldCard => !!x && typeof x === 'object' && ids.has((x as HeldCard).id) && Number.isInteger((x as HeldCard).drawnOn)) : []);
  return {
    seed: g.seed, deck: strs(g.deck), hand: held(g.hand),
    played: Array.isArray(g.played) ? g.played.filter((x): x is PlayedCard => !!x && typeof x === 'object' && ids.has(x.id) && Number.isInteger(x.turn)) : [],
    faded: Array.isArray(g.faded) ? g.faded.filter((x): x is FadedCard => !!x && typeof x === 'object' && ids.has(x.id) && Number.isInteger(x.turn) && Number.isInteger(x.drawnOn)) : [],
    shuffles: Number.isInteger(g.shuffles) && g.shuffles! > 0 ? g.shuffles! : 1,
    reckonedOn: Number.isInteger(g.reckonedOn) && g.reckonedOn! >= 0 ? g.reckonedOn! : 0,
  };
}

/** The last turn a card drawn then may still be played on. */
export const fadesAfter = (card: Pick<HeldCard, 'drawnOn'>): number => card.drawnOn + CARD_LASTS - 1;
/** The turn a hand is reckoned against: the table's, never before the first. */
export const handTurn = (turn: number): number => Math.max(1, turn);

/**
 * The hand at the start of a turn: what has faded goes to the faded pile, then the hand is filled back up to
 * three from the deck, reshuffling the spent cards back in when the deck runs dry. The hand fills once a turn, so
 * a card played is not replaced until the next one. Idempotent for the same turn, and a turn taken back changes
 * nothing: a card never un-fades.
 */
export function reconcileTarot(state: TarotState, tableTurn: number): TarotState {
  const turn = handTurn(tableTurn);
  const faded = state.hand.filter((c) => fadesAfter(c) < turn).map((c) => ({ id: c.id, drawnOn: c.drawnOn, turn }));
  const hand = state.hand.filter((c) => fadesAfter(c) >= turn);
  const next: TarotState = { ...state, deck: state.deck.slice(), hand, faded: [...state.faded, ...faded] };
  if (turn <= state.reckonedOn) return next;
  next.reckonedOn = turn;
  while (next.hand.length < HAND_SIZE) {
    if (!next.deck.length) {
      const inHand = new Set(next.hand.map((c) => c.id));
      const pool = TAROT.map((c) => c.id).filter((id) => !inHand.has(id));
      if (!pool.length) break;
      next.deck = shuffle(rng(hashSeed(next.seed, 'tarot', next.shuffles)), pool);
      next.shuffles += 1;
    }
    next.hand.push({ id: next.deck.shift()!, drawnOn: turn });
  }
  return next;
}

export const holds = (state: TarotState, cardId: string): boolean => state.hand.some((c) => c.id === cardId);

/** Play a card from the hand: it goes to the played pile with the turn. The hand is not refilled until the next turn. */
export function playTarot(state: TarotState, cardId: string, tableTurn: number): TarotState {
  if (!holds(state, cardId)) throw new Error('That card is not in the hand.');
  return { ...state, hand: state.hand.filter((c) => c.id !== cardId), played: [...state.played, { id: cardId, turn: handTurn(tableTurn) }] };
}

/** Whether a card's hour is now: `only: first` wants the first turn, `only: last` the last round, when one is set. */
export function hourOf(card: Pick<TarotCard, 'only'>, tableTurn: number, turnLimit: number | null): 'now' | 'not-yet' | 'too-late' {
  const turn = handTurn(tableTurn);
  if (card.only === 'first') return turn <= 1 ? 'now' : 'too-late';
  if (card.only === 'last') return turnLimit === null || turn >= turnLimit ? 'now' : 'not-yet';
  return 'now';
}

/**
 * The last turn the Whispering Wall still listens for a warband, from the log: the card is good for the turn it was
 * played on and the next, like any card. Null when it was never played, or has gone quiet.
 */
export function wallOpenUntil(events: Pick<ScenarioEvent, 'kind' | 'warbandId' | 'text' | 'turn'>[], warbandId: string, tableTurn: number): number | null {
  const turn = handTurn(tableTurn);
  const until = events.filter((e) => e.kind === 'card' && e.warbandId === warbandId && e.text === WALL_CARD).map((e) => e.turn + CARD_LASTS - 1).filter((t) => t >= turn);
  return until.length ? Math.max(...until) : null;
}

/** Another warband's hand, seen through the wall. */
export interface SeenHand { warbandId: string; hand: HeldCard[] }

/** What the hand's keeper is shown: their hand, what they have played and lost, how deep the deck still is, and what the wall lets them see. */
export interface TarotHand {
  warbandId: string;
  /** The turn the hand was reckoned against. */
  turn: number;
  hand: HeldCard[];
  played: PlayedCard[];
  faded: FadedCard[];
  deckLeft: number;
  /** The last turn the Whispering Wall still listens, and the other hands it shows; absent when it does not. */
  wallUntil?: number | null;
  through?: SeenHand[];
}
export function handOf(state: TarotState, tableTurn: number, warbandId: string): TarotHand {
  return { warbandId, turn: handTurn(tableTurn), hand: state.hand, played: state.played, faded: state.faded, deckLeft: state.deck.length };
}
