/**
 * The Tarot of the Damned at the table: each warband's hidden hand, kept whole as JSON against its row at the
 * scenario, reckoned against the table's turn whenever its keeper looks, and a card played logged for everyone.
 *
 * The rules are `src/campaign/tarot.ts`, pure; this file only loads, reckons, changes and saves. The hand is the
 * one thing at a scenario the other side must not see, so it never rides on the scenario the tracker answers
 * with: it has its own two actions, each checked against who speaks for the warband.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { scenarioEvents, scenarioWarbands, scenarios } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { WALL_CARD, cardById, coerceTarot, handOf, handTurn, holds, newTarot, playTarot, reconcileTarot, wallOpenUntil, type TarotHand, type TarotState } from '../../campaign/tarot.ts';
import type { Scenario } from '../../campaign/model.ts';
import type { Actor } from '../roles.ts';
import { getScenario, row, speaksFor } from './scenarios.ts';

type ScenarioRow = Awaited<ReturnType<typeof row>>;

async function inPlay(actor: Actor, scenarioId: string, warbandId: string): Promise<ScenarioRow> {
  const r = await row(scenarioId);
  if (!r.tarot) throw new LedgerError('The Tarot of the Damned is not in play at this scenario.', 400);
  await speaksFor(actor, scenarioId, warbandId);
  return r;
}

/** The warband's deck as stored, dealt fresh if it has none yet. */
async function stored(scenarioId: string, warbandId: string): Promise<{ state: TarotState; fresh: boolean }> {
  const rows = await db().select({ tarot: scenarioWarbands.tarot }).from(scenarioWarbands).where(and(eq(scenarioWarbands.scenarioId, scenarioId), eq(scenarioWarbands.warbandId, warbandId))).limit(1);
  const state = coerceTarot(rows[0]?.tarot);
  return state ? { state, fresh: false } : { state: newTarot(randomUUID()), fresh: true };
}

/**
 * Save the deck as it now stands, only if nobody wrote it in between: two phones of one keeper, or a look racing a
 * play. Returns whether the write took; the caller reads again when it did not.
 */
async function save(scenarioId: string, warbandId: string, before: TarotState | null, next: TarotState): Promise<boolean> {
  const where = and(eq(scenarioWarbands.scenarioId, scenarioId), eq(scenarioWarbands.warbandId, warbandId), before ? sql`${scenarioWarbands.tarot} = ${JSON.stringify(before)}::jsonb` : isNull(scenarioWarbands.tarot));
  const updated = await db().update(scenarioWarbands).set({ tarot: next }).where(where).returning({ warbandId: scenarioWarbands.warbandId });
  return updated.length > 0;
}

/** The hand reckoned against the table's turn, saved when that changed it. The game called, the hand stands as it was. */
async function reckoned(r: ScenarioRow, warbandId: string): Promise<TarotState> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { state, fresh } = await stored(r.id, warbandId);
    const next = r.status === 'played' && !fresh ? state : reconcileTarot(state, r.turn);
    if (!fresh && JSON.stringify(next) === JSON.stringify(state)) return state;
    if (await save(r.id, warbandId, fresh ? null : state, next)) return next;
  }
  throw new LedgerError('The cards would not settle. Try again.', 409);
}

/**
 * The hand as the keeper sees it, with the other side's hands through the wall while the Whispering Wall listens:
 * the log says when it was played, and the other hands are reckoned as they would be when their own keepers look.
 */
async function seen(r: ScenarioRow, warbandId: string, state: TarotState): Promise<TarotHand> {
  const view = handOf(state, r.turn, warbandId);
  const d = db();
  const plays = await d.select({ kind: scenarioEvents.kind, warbandId: scenarioEvents.warbandId, text: scenarioEvents.text, turn: scenarioEvents.turn }).from(scenarioEvents).where(and(eq(scenarioEvents.scenarioId, r.id), eq(scenarioEvents.kind, 'card'), eq(scenarioEvents.warbandId, warbandId), eq(scenarioEvents.text, WALL_CARD)));
  const until = wallOpenUntil(plays, warbandId, r.turn);
  if (until === null) return view;
  const others = (await d.select({ warbandId: scenarioWarbands.warbandId }).from(scenarioWarbands).where(eq(scenarioWarbands.scenarioId, r.id))).map((x) => x.warbandId).filter((id) => id !== warbandId);
  const through = [];
  for (const other of others) through.push({ warbandId: other, hand: (await reckoned(r, other)).hand });
  return { ...view, wallUntil: until, through };
}

/** The keeper's hand, as of now. The warband's keeper, or a game master. */
export async function loadHand(actor: Actor, scenarioId: string, warbandId: string): Promise<TarotHand> {
  const r = await inPlay(actor, scenarioId, warbandId);
  return seen(r, warbandId, await reckoned(r, warbandId));
}

/** Play a card from the hand: it leaves for the played pile, and the table's log says which card was shown, by whom. */
export async function playCard(actor: Actor, scenarioId: string, warbandId: string, cardId: string): Promise<{ hand: TarotHand; scenario: Scenario }> {
  const r = await inPlay(actor, scenarioId, warbandId);
  if (r.status === 'played') throw new LedgerError('The game is already called.', 409);
  const card = cardById(cardId);
  if (!card) throw new LedgerError('No such card is in the Tarot.', 404);
  const state = await reckoned(r, warbandId);
  if (!holds(state, cardId)) throw new LedgerError('That card is not in your hand.', 409);
  const next = playTarot(state, cardId, r.turn);
  if (!(await save(r.id, warbandId, state, next))) throw new LedgerError('The cards moved under your hand. Look again.', 409);
  const d = db();
  await d.insert(scenarioEvents).values({ scenarioId: r.id, turn: handTurn(r.turn), kind: 'card', warbandId, points: 0, text: card.id, authorId: actor.id, authorName: actor.name });
  await d.update(scenarios).set({ updatedAt: new Date() }).where(eq(scenarios.id, r.id));
  return { hand: await seen(r, warbandId, next), scenario: (await getScenario(r.id))! };
}
