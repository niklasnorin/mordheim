/**
 * The first campaign's nights, pinned. Making the campaign an input to the engine must not move a single roll of
 * `mordheim-2000`: its players have nights written and a running Omen. This records omens, moons, dates, whole
 * reconciled ledgers with their crossroads, the Cryer's dispatches, the odds' simulation, the jobs' seeds and the
 * Imperial dates, and compares them with `__golden__/mordheim-2000.json`. Run with GOLDEN_WRITE=1 to write the file
 * again, which is only ever right when the dice are meant to change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dateForNight, locationById, moonForNight, nightForDate, omenForNight, resolveNight, cityProvides, epithetFor, eveTicket } from './engine.ts';
import { freshState, giveOrders, reconcile, waitingCrossroads, decide, type WarbandState } from './ledger.ts';
import { dispatchesForNight, bylineFor } from './cryer.ts';
import { simulateNights } from './odds.ts';
import { jobSeed } from '../campaign/jobs.ts';
import { formatImperial, imperialForDate } from '../lib/calendar.ts';

const stats = (M: number, WS: number, BS: number, S: number, T: number, W: number, I: number, A: number, Ld: number) => ({ M, WS, BS, S, T, W, I, A, Ld });
const nordost = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [
    { id: 'agnar', name: 'Agnar Nordost', role: 'Elder', stats: stats(4, 4, 3, 3, 3, 1, 4, 1, 8) },
    { id: 'skalle', name: 'Skalle', role: 'Priest of Taal', stats: stats(4, 3, 3, 3, 4, 1, 3, 1, 8) },
    { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger', stats: stats(4, 3, 4, 3, 3, 1, 4, 1, 7) },
    { id: 'hilde', name: 'Hilde', role: 'Youngblood', stats: stats(4, 2, 2, 3, 3, 1, 3, 1, 6) },
  ],
};
const bitterbrow = { id: 'bitterbrow-expedition', name: 'The Bitterbrow Expedition', members: [{ id: 'durin', name: 'Durin Bitterbrow', role: 'Captain', stats: stats(3, 5, 4, 3, 4, 1, 2, 1, 9) }] };
const moves = [{ locationId: 'fussenbach', fromNight: 12 }, { locationId: 'mordheim', fromNight: 30 }];

function ledgerRun(): { nights: unknown[]; state: WarbandState; dispatches: unknown[] } {
  const s = freshState(nordost, 1);
  const errands = ['scavenge', 'carouse', 'train', 'spy', 'pray', 'trade', 'dredge'] as const;
  const nights: unknown[] = [];
  const dispatches: unknown[] = [];
  for (let night = 1; night <= 45; night++) {
    if (night % 3 !== 0) {
      const a = nordost.members[night % 4], b = nordost.members[(night + 1) % 4];
      try { giveOrders(s, nordost, night, [{ memberId: a.id, errand: errands[night % 7] }, { memberId: b.id, errand: errands[(night * 3) % 7] }], [], locationById(night >= 12 && night < 30 ? 'fussenbach' : 'mordheim')); } catch { /* resting or not to be had there: the night runs on standing orders */ }
    }
    const written = reconcile(s, nordost, night + 1, [], bitterbrow, moves);
    for (const n of written) {
      nights.push(n);
      dispatches.push(dispatchesForNight(nordost, n, s.headlines.filter((h) => h.night === n.night)));
    }
    const waiting = waitingCrossroads(s);
    if (waiting && night % 2 === 0) {
      const options = waiting.crossroads!.options;
      decide(s, nordost, waiting.night, options[night % options.length].id, { on: night + 1, rival: bitterbrow });
    }
  }
  return { nights, state: s, dispatches };
}

function snapshot(): unknown {
  const nights = Array.from({ length: 120 }, (_, i) => i - 4);
  return {
    omens: nights.map((n) => omenForNight(n).id),
    moons: nights.map((n) => moonForNight(n).id),
    dates: nights.map((n) => dateForNight(n)),
    nightFor: ['2026-09-09', '2026-09-10', '2026-12-24', '2027-06-01'].map(nightForDate),
    single: [1, 7, 33].map((night) => resolveNight({ warband: nordost, night, orders: [{ memberId: 'agnar', errand: 'carouse' }, { memberId: 'torgrim', errand: 'scavenge' }], state: { favour: 10, shards: 2, renown: 5, hand: [] }, rival: bitterbrow, location: locationById(night === 7 ? 'fussenbach' : 'mordheim') })),
    ledger: ledgerRun(),
    bylines: [3, 14].map((n) => bylineFor('nordost', n, locationById(n === 14 ? 'fussenbach' : 'mordheim'))),
    provides: [5, 9].map((n) => cityProvides('nordost', n).id),
    epithet: epithetFor('agnar', { carouse: 4, spy: 2 }),
    ticket: eveTicket('nordost', 20, 2),
    simulation: simulateNights(locationById('fussenbach'), nordost, 60, 3),
    jobs: [jobSeed('nordost', 'scenario-02'), jobSeed('bitterbrow-expedition', 'scenario-03')],
    imperial: ['2026-09-05', '2026-09-10', '2027-01-01', '2028-02-29'].map((d) => formatImperial(imperialForDate(d))),
  };
}

const file = new URL('./__golden__/mordheim-2000.json', import.meta.url);

test('the first campaign rolls exactly as it always has', () => {
  const now = JSON.parse(JSON.stringify(snapshot()));
  if (process.env.GOLDEN_WRITE === '1' || !existsSync(file)) {
    mkdirSync(new URL('./__golden__/', import.meta.url), { recursive: true });
    writeFileSync(file, `${JSON.stringify(now, null, 1)}\n`);
    if (process.env.GOLDEN_WRITE !== '1') assert.fail('The golden file was missing and has been written; run the tests again.');
    return;
  }
  assert.deepEqual(now, JSON.parse(readFileSync(file, 'utf8')));
});
