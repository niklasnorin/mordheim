import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LASTS, DOOR_CARD, HAND_SIZE, TAROT, TAROT_RULES, WALL_CARD, cardById, coerceTarot, fadesAfter, handOf, holds, hourOf, newTarot, playTarot, reconcileTarot, wallOpenUntil } from './tarot.ts';

test('the deck is the thirty Omens, each with a small effect in the voice', () => {
  assert.equal(TAROT.length, 30);
  assert.equal(new Set(TAROT.map((c) => c.id)).size, 30, 'no card repeats');
  for (const c of TAROT) {
    assert.ok(c.image.startsWith('/curfew/omens/'), `${c.id} uses the Curfew’s picture`);
    assert.ok(c.when.endsWith('.') && c.effect.endsWith('.'), `${c.id} is written in sentences`);
    assert.ok(!/!/.test(c.when + c.effect), `${c.id} has no exclamation mark`);
    assert.ok(!/'/.test(c.when + c.effect), `${c.id} uses typographic apostrophes`);
  }
  assert.ok(TAROT.some((c) => c.kind === 'bane') && TAROT.some((c) => c.kind === 'twist'), 'not every card is a boon');
  assert.equal(cardById('the-comet')?.only, 'first');
  assert.equal(cardById('last-candle')?.only, 'last');
  assert.ok(TAROT_RULES.every((l) => l.endsWith('.')));
});

test('the same seed deals the same deck; two seeds do not', () => {
  const a = newTarot('one'), b = newTarot('one'), c = newTarot('two');
  assert.deepEqual(a.deck, b.deck);
  assert.notDeepEqual(a.deck, c.deck);
  assert.equal(a.deck.length, 30);
  assert.equal(a.hand.length, 0, 'nothing is dealt until the hand is reckoned');
});

test('the opening hand is three, dealt before the first turn as if on it; reckoning again changes nothing', () => {
  const s = reconcileTarot(newTarot('seed'), 0);
  assert.equal(s.hand.length, HAND_SIZE);
  assert.ok(s.hand.every((c) => c.drawnOn === 1), 'the opening hand counts as drawn on turn 1');
  assert.equal(s.deck.length, 27);
  assert.deepEqual(reconcileTarot(s, 0), s);
  assert.deepEqual(reconcileTarot(s, 1), s, 'turn 1 is the same hour');
  assert.equal(fadesAfter(s.hand[0]), CARD_LASTS, 'good for this turn and the next');
});

test('a card fades at the start of the turn after the next, and the hand fills back up', () => {
  let s = reconcileTarot(newTarot('seed'), 1);
  const opening = s.hand.map((c) => c.id);
  s = reconcileTarot(s, 2);
  assert.deepEqual(s.hand.map((c) => c.id), opening, 'still good on turn 2');
  s = reconcileTarot(s, 3);
  assert.equal(s.faded.length, 3, 'the opening hand is gone at the start of turn 3');
  assert.ok(s.faded.every((f) => f.turn === 3 && f.drawnOn === 1));
  assert.equal(s.hand.length, 3);
  assert.ok(s.hand.every((c) => c.drawnOn === 3 && !opening.includes(c.id)));
  assert.equal(s.deck.length, 24);
  // the table takes a turn back: nothing comes back
  assert.deepEqual(reconcileTarot(s, 2), s);
});

test('a card played leaves the hand for the played pile and is replaced at the next turn', () => {
  let s = reconcileTarot(newTarot('seed'), 1);
  const [first] = s.hand;
  assert.ok(holds(s, first.id));
  s = playTarot(s, first.id, 1);
  assert.equal(s.hand.length, 2);
  assert.deepEqual(s.played, [{ id: first.id, turn: 1 }]);
  assert.ok(!holds(s, first.id));
  assert.throws(() => playTarot(s, first.id, 1), /not in the hand/);
  assert.equal(reconcileTarot(s, 1).hand.length, 2, 'no new card until the next turn');
  s = reconcileTarot(s, 2);
  assert.equal(s.hand.length, 3);
  assert.equal(s.hand.at(-1)!.drawnOn, 2, 'the new card is good for turns 2 and 3');
  const view = handOf(s, 2, 'nordost');
  assert.equal(view.deckLeft, 26);
  assert.equal(view.warbandId, 'nordost');
});

test('when the deck runs dry, the spent cards are shuffled back in, never the ones in hand', () => {
  let s = reconcileTarot(newTarot('seed'), 1);
  // a long game: every other turn the hand fades whole, three cards at a time
  for (let t = 3; t <= 19; t += 2) s = reconcileTarot(s, t);
  assert.equal(s.deck.length, 0, 'thirty cards, ten hands');
  assert.equal(s.shuffles, 1);
  s = reconcileTarot(s, 21);
  assert.equal(s.shuffles, 2);
  assert.equal(s.hand.length, 3);
  assert.equal(s.deck.length + s.hand.length, 30, 'the whole deck is in play again');
  assert.equal(new Set([...s.deck, ...s.hand.map((c) => c.id)]).size, 30);
});

test('a card’s hour: the first turn, the last round, or any time', () => {
  assert.equal(hourOf({ only: 'first' }, 0, 7), 'now');
  assert.equal(hourOf({ only: 'first' }, 1, 7), 'now');
  assert.equal(hourOf({ only: 'first' }, 2, 7), 'too-late');
  assert.equal(hourOf({ only: 'last' }, 6, 7), 'not-yet');
  assert.equal(hourOf({ only: 'last' }, 7, 7), 'now');
  assert.equal(hourOf({ only: 'last' }, 8, 7), 'now', 'another round is still the last');
  assert.equal(hourOf({ only: 'last' }, 2, null), 'now', 'with no limit the table knows when the end is');
  assert.equal(hourOf({}, 4, 7), 'now');
});

test('the Whispering Wall listens for the turn it is played on and the next; the Sealed Door is in the deck', () => {
  assert.ok(cardById(WALL_CARD) && cardById(DOOR_CARD));
  const line = (turn: number, warbandId = 'nordost', text = WALL_CARD) => ({ kind: 'card' as const, warbandId, text, turn });
  assert.equal(wallOpenUntil([], 'nordost', 3), null);
  assert.equal(wallOpenUntil([line(3)], 'nordost', 3), 3 + CARD_LASTS - 1);
  assert.equal(wallOpenUntil([line(3)], 'nordost', 4), 4, 'still open the next turn');
  assert.equal(wallOpenUntil([line(3)], 'nordost', 5), null, 'quiet the turn after');
  assert.equal(wallOpenUntil([line(3)], 'bitterbrow-expedition', 3), null, 'only for the one who played it');
  assert.equal(wallOpenUntil([line(3, 'nordost', DOOR_CARD)], 'nordost', 3), null, 'another card opens nothing');
  assert.equal(wallOpenUntil([line(1), line(4)], 'nordost', 4), 5, 'played again, the later one counts');
  assert.equal(wallOpenUntil([line(1)], 'nordost', 0), 2, 'before the first turn counts as the first');
});

test('a stored deck is read back whole, and rubbish is not a deck', () => {
  const s = playTarot(reconcileTarot(newTarot('seed'), 1), reconcileTarot(newTarot('seed'), 1).hand[0].id, 1);
  assert.deepEqual(coerceTarot(JSON.parse(JSON.stringify(s))), s);
  assert.equal(coerceTarot(null), null);
  assert.equal(coerceTarot({ deck: [] }), null);
  const odd = coerceTarot({ seed: 'x', deck: ['ash-wind', 'no-such-card', 3], hand: [{ id: 'the-pit', drawnOn: 'one' }], shuffles: 0 })!;
  assert.deepEqual(odd.deck, ['ash-wind']);
  assert.deepEqual(odd.hand, []);
  assert.equal(odd.shuffles, 1);
  assert.equal(odd.reckonedOn, 0);
});
