/** The management forms' one piece of arithmetic: a dotted field name becomes the body the server asks for. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPath } from './manage.ts';
import { summaryOf } from '../campaign/model.ts';

test('a dotted field name nests, and a numbered one makes the list the server asks for', () => {
  const body: Record<string, unknown> = {};
  setPath(body, 'patch.lore', 'A holding of longhouses.');
  setPath(body, 'patch.stats.WS', 4);
  assert.deepEqual(body, { patch: { lore: 'A holding of longhouses.', stats: { WS: 4 } } });

  // "the game is played" posts one row per warband; zod wants an array, not an object keyed 0, 1
  const played: Record<string, unknown> = {};
  setPath(played, 'results.0.warbandId', 'nordost');
  setPath(played, 'results.0.result', 'defeat');
  setPath(played, 'results.1.warbandId', 'bitterbrow-expedition');
  setPath(played, 'results.1.result', 'victory');
  assert.ok(Array.isArray(played.results), 'the rows are a list');
  assert.deepEqual(played, { results: [{ warbandId: 'nordost', result: 'defeat' }, { warbandId: 'bitterbrow-expedition', result: 'victory' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(played)).results.length, 2);
});

test('an upcoming scenario prints its prologue under the title until it is played, unless the game master says otherwise', () => {
  const scenario = { status: 'upcoming' as const, summary: '', chronicle: '', prologue: 'A bell where no belfry stands.', prologueAsSummary: true };
  assert.equal(summaryOf(scenario), 'A bell where no belfry stands.');
  assert.equal(summaryOf({ ...scenario, prologueAsSummary: false }), '');
  assert.equal(summaryOf({ ...scenario, summary: 'Two companies, one bell.' }), 'Two companies, one bell.', 'a summary of its own always wins');
  assert.equal(summaryOf({ ...scenario, status: 'played' }), '', 'once played, the prologue is the prologue');
  assert.equal(summaryOf({ ...scenario, status: 'played', chronicle: 'The kin win the ground.' }), 'The kin win the ground.', 'a record written before the summary and the Chronicle were one field still reads');
});
