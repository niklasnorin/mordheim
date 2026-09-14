/**
 * Scenarios: the game master sets them up and marks them played; everyone who fought tells their part, and the
 * battle tracker logs the game turn by turn while it is played. Every answer carries the scenario as it now stands.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { dispatch, route } from '../../../server/api';
import { addEvent, addOutOfAction, createScenario, deleteScenario, markPlayed, removeEvent, removeOutOfAction, reopenScenario, requireScenario, setBrought, setParticipants, setTurn, updateScenario, writeBattle, writePerspective } from '../../../server/campaign/scenarios';

export const prerender = false;

const id = z.string().min(1).max(120);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paragraphs = z.array(z.string().max(4000)).max(60);
const scenarioFields = {
  title: z.string().max(120), playedOn: day, rulebookScenario: z.string().max(80).nullable(), customRules: z.string().max(8000), prologue: z.string().max(8000), prologueAsSummary: z.boolean(), summary: z.string().max(1000),
  warbandIds: z.array(z.string().max(64)).max(20), winCondition: z.string().max(4000), chronicle: z.string().max(4000), outcome: z.string().max(4000), epilogue: z.string().max(8000),
  loot: paragraphs, campaignNotes: paragraphs, battleOpen: z.boolean(), tally: z.string().max(60),
};
const turn = z.number().int().min(0).max(99);
const wrap = (p: Promise<unknown>) => p.then((scenario) => ({ scenario }));

const routes = {
  create: route(z.object(scenarioFields).partial().required({ title: true, playedOn: true }), (i, a) => wrap(createScenario(a, i)), 'gm'),
  update: route(z.object({ scenarioId: id, patch: z.object(scenarioFields).partial() }), (i, a) => wrap(updateScenario(a, i.scenarioId, i.patch)), 'gm'),
  participants: route(z.object({ scenarioId: id, warbandIds: z.array(z.string().max(64)).max(20) }), (i, a) => wrap(setParticipants(a, i.scenarioId, i.warbandIds)), 'gm'),
  played: route(z.object({ scenarioId: id, results: z.array(z.object({ warbandId: z.string().max(64), result: z.enum(['victory', 'defeat', 'draw']) })).max(20) }), (i, a) => wrap(markPlayed(a, i.scenarioId, i.results))),
  reopen: route(z.object({ scenarioId: id }), (i, a) => wrap(reopenScenario(a, i.scenarioId)), 'gm'),
  delete: route(z.object({ scenarioId: id }), (i, a) => deleteScenario(a, i.scenarioId).then(() => ({ ok: true })), 'gm'),
  battle: route(z.object({ scenarioId: id, battle: paragraphs }), (i, a) => wrap(writeBattle(a, i.scenarioId, i.battle))),
  perspective: route(z.object({
    scenarioId: id, warbandId: z.string().max(64),
    patch: z.object({ prologue: z.string().max(8000), epilogue: z.string().max(8000), accomplishments: z.string().max(2000), highlights: z.array(z.string().max(1000)).max(12), lowlights: z.array(z.string().max(1000)).max(12) }).partial(),
  }), (i, a) => wrap(writePerspective(a, i.scenarioId, i.warbandId, i.patch))),
  brought: route(z.object({
    scenarioId: id, warbandId: z.string().max(64),
    brought: z.array(z.object({ memberId: z.string().max(64), status: z.enum(['active', 'injured', 'dead']).optional(), highlight: z.string().max(1000).optional(), lowlight: z.string().max(1000).optional() })).max(60),
  }), (i, a) => wrap(setBrought(a, i.scenarioId, i.warbandId, i.brought))),
  'out-of-action': route(z.object({ scenarioId: id, attackerId: z.string().max(64), targetId: z.string().max(64).nullable().optional(), target: z.string().max(120).optional(), detail: z.string().max(1000).optional(), turn: turn.min(1).nullable().optional() }), (i, a) => wrap(addOutOfAction(a, i.scenarioId, i))),
  'remove-out-of-action': route(z.object({ scenarioId: id, id: z.number().int().positive() }), (i, a) => wrap(removeOutOfAction(a, i.scenarioId, i.id))),
  // the battle tracker, at the table
  tracker: route(z.object({ scenarioId: id }), (i) => wrap(requireScenario(i.scenarioId))),
  turn: route(z.object({ scenarioId: id, turn }), (i, a) => wrap(setTurn(a, i.scenarioId, i.turn))),
  event: route(z.object({ scenarioId: id, kind: z.enum(['note', 'score']), turn: turn.min(1).nullable().optional(), warbandId: z.string().max(64).nullable().optional(), points: z.number().int().min(-99).max(99).optional(), text: z.string().max(500).optional() }), (i, a) => wrap(addEvent(a, i.scenarioId, i))),
  'remove-event': route(z.object({ scenarioId: id, id: z.number().int().positive() }), (i, a) => wrap(removeEvent(a, i.scenarioId, i.id))),
};

export const POST: APIRoute = ({ request, params }) => dispatch(routes, params.action, request, 'scenarios');
