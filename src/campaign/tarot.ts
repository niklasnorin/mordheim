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
  /** When it may be played. */
  when: string;
  /** What it does. */
  effect: string;
  /** Only in the first turn, or only in the last round; the hand says so, and greys the card out at other times. */
  only?: 'first' | 'last';
}

type Effect = Pick<TarotCard, 'kind' | 'when' | 'effect' | 'only'>;

/** What each card does, by the Omen's id. A rule of the game, so code; the picture and the title are the Omen's. */
const EFFECTS: Record<string, Effect> = {
  'ash-wind': { kind: 'boon', when: 'In your movement phase.', effect: 'One of your warriors moves 1″ further this turn, walking, running or charging. The wind covers the footfall.' },
  'drowned-bell': { kind: 'bane', when: 'When an enemy warrior takes a Leadership test.', effect: 'They take it at −1. Something is tolling under the water, and it is not for you.' },
  'hanged-merchant': { kind: 'boon', when: 'Any time. Keep it face up to the end.', effect: 'After the game, re-roll one of your exploration dice. The merchant’s ledger had one more page in it.' },
  'green-light-under-ash': { kind: 'boon', when: 'In your recovery phase.', effect: 'One of your stunned warriors stands up as knocked down instead. The green does that to a body, for a while.' },
  'hammer-reversed': { kind: 'bane', when: 'When an enemy prays or casts a spell.', effect: 'They roll at −1 to cast. The hammer is turned the wrong way tonight.' },
  'rat-kings-court': { kind: 'bane', when: 'At the start of an enemy movement phase.', effect: 'Name one enemy warrior: they may not run this turn. Something in the gutters has hold of their heel.' },
  'empty-cradle': { kind: 'boon', when: 'When one of your warriors is taken out of action.', effect: 'They are not counted against you for rout tests this turn. The warband has not noticed yet.' },
  'lantern-bearer': { kind: 'boon', when: 'In your shooting phase.', effect: 'One of your warriors ignores the −1 for shooting at a target in cover this turn. The lantern found them.' },
  'the-comet': { kind: 'boon', only: 'first', when: 'In the first turn only.', effect: 'Every warrior of yours adds 1″ to their move this turn. The sky lit the way in.' },
  'broken-bell': { kind: 'boon', when: 'When your warband fails a rout test.', effect: 'Re-roll it. The second roll stands, whatever it says; nobody heard the bell the first time.' },
  'fences-scales': { kind: 'bane', when: 'When an enemy warrior picks up a shard, a relic or an objective.', effect: 'They drop it on a D6 roll of 1. Everyone else saw where it fell.' },
  'plague-doctor': { kind: 'boon', when: 'When one of your warriors is taken out of action. Keep it face up.', effect: 'After the game, re-roll their serious injury once; the second roll stands. The doctor’s fee is whatever is in their pockets.' },
  'witch-hunter': { kind: 'boon', when: 'When one of your warriors must take a Fear or an All Alone test.', effect: 'They pass it. The witch hunter has seen worse than this, and said so.' },
  'crooked-dice': { kind: 'boon', when: 'After any one die roll of yours.', effect: 'Re-roll it. The second result stands, even if it is worse. Crooked cuts both ways.' },
  'the-pit': { kind: 'bane', when: 'When an enemy warrior climbs or jumps.', effect: 'They take the test at −1 Initiative. The Pit is closer than it looks.' },
  'drowned-quarter': { kind: 'twist', when: 'At the start of any turn.', effect: 'Until the end of the turn, every shot over 12″ is at −1, yours and theirs. The fog is up from the river.' },
  'sisters-candle': { kind: 'boon', when: 'When one of your warriors fails an armour save.', effect: 'Re-roll it. The candle was lit for them this morning; nobody knows by whom.' },
  'black-sails': { kind: 'bane', when: 'In your shooting phase.', effect: 'Name one hidden enemy warrior within 12″ of one of yours: they are hidden no longer. The raiders have been seen coming off the river before.' },
  'nameless-grave': { kind: 'bane', when: 'When an enemy rolls to wound one of your warriors.', effect: 'They roll at −1. The grave is dug, but not for this one.' },
  'whispering-wall': { kind: 'boon', when: 'When an enemy shoots at one of your warriors in cover.', effect: 'The cover counts −2 instead of −1. The wall has learned to lean in.' },
  'tower-on-the-rock': { kind: 'boon', when: 'In close combat, when one of your warriors stands higher than their attacker.', effect: 'They get +1 to their armour save this turn, a 6+ if they have none. Height is a kind of armour.' },
  'beggar-king': { kind: 'boon', when: 'When one of your henchmen takes a Leadership test.', effect: 'They use your leader’s Leadership, wherever he is. The beggar king lends a crown for the hour.' },
  'cracked-hourglass': { kind: 'boon', when: 'In your shooting phase.', effect: 'One of your warriors who ran this turn may shoot anyway, at −1. The hour had a little more in it than it should.' },
  'twin-moons': { kind: 'twist', when: 'At the start of any turn.', effect: 'Until the end of the turn, nobody may hide: both moons are out. Warriors already hidden stay so.' },
  'sealed-door': { kind: 'boon', when: 'When an enemy charges one of your warriors who is inside a building or behind a wall.', effect: 'The charger is at −1 to hit in the first round of that combat. The door held, for a moment.' },
  'wyrd-lantern': { kind: 'boon', when: 'In your movement phase.', effect: 'One of your warriors in the open counts as in cover until the start of your next turn. The lantern throws a shadow that does not match.' },
  'carrion-crown': { kind: 'boon', when: 'When one of your warriors takes an enemy out of action.', effect: 'That warrior gains +1 Experience after the game. The crows have given a name.' },
  'the-ferryman': { kind: 'boon', only: 'last', when: 'In the last round only. Keep it face up.', effect: 'After the game, if one of your warriors rolls Dead on the serious injury table, re-roll it once; the second roll stands. The ferryman was busy elsewhere.' },
  'bone-hand': { kind: 'boon', when: 'When one of your warriors rolls to wound in close combat.', effect: '+1 to one roll to wound. The hand knows where the ribs part.' },
  'last-candle': { kind: 'boon', only: 'last', when: 'In the last round only.', effect: 'One of your warriors re-rolls one failed roll this round. The last light goes where it is most needed.' },
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

/** The rules as the scenario page prints them. */
export const TAROT_RULES: string[] = [
  `Every warband that fights has its own deck of the thirty cards: the Tarot the Curfew draws its Omens from, shuffled once for the game.`,
  `At the start of the game each is dealt a hand of ${HAND_SIZE}, hidden from the other side. The hand is on your phone, in the battle tracker, behind the Tarot button.`,
  `A card is good for the turn it was drawn on and the next. At the start of the turn after, it fades; at the start of every turn the hand is filled back up to ${HAND_SIZE}.`,
  `Play a card when its moment comes, as the card says. Show it to the table: the tracker holds it up large, and the log records it. A card played is spent.`,
  `When the deck runs out, the cards played and faded are shuffled back in. A card that says to keep it face up stays on the table to the end.`,
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

/** What the hand's keeper is shown: their hand, what they have played and lost, and how deep the deck still is. */
export interface TarotHand {
  warbandId: string;
  /** The turn the hand was reckoned against. */
  turn: number;
  hand: HeldCard[];
  played: PlayedCard[];
  faded: FadedCard[];
  deckLeft: number;
}
export function handOf(state: TarotState, tableTurn: number, warbandId: string): TarotHand {
  return { warbandId, turn: handTurn(tableTurn), hand: state.hand, played: state.played, faded: state.faded, deckLeft: state.deck.length };
}
