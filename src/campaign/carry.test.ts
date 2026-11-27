import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleFor } from '../builder/data.ts';
import { addNamed, findSelection, newRoster } from '../builder/roster.ts';
import { warriorsOf } from '../builder/rules.ts';
import { carryPlan, needsApproval, newIdFor, remapRoster, rosterMembers, type CarryMember } from './carry.ts';
import { DEFAULT_CARRY, type CarryPolicy } from './campaign.ts';

const reik = bundleFor('reiklanders')!;
const ids = () => { let n = 0; return () => `n${++n}`; };

/** A captain with a sword and some experience and an old wound, and a group of two warriors. */
function built() {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  const cap = addNamed(reik, r, null, 'Mercenary Captain', id); r = cap.roster;
  const kit = addNamed(reik, r, cap.id, 'Starting Equipment (Mercenaries)', id); r = kit.roster;
  r = addNamed(reik, r, kit.id, 'Sword', id).roster;
  const war = addNamed(reik, r, null, 'Warriors', id); r = war.roster;
  findSelection(r.selections, cap.id)!.members = ['aldric'];
  findSelection(r.selections, war.id)!.members = ['bruno', 'carl'];
  return { roster: r, cap: cap.id, war: war.id };
}
const member = (id: string, name: string, rank: 'hero' | 'henchman', extra: Partial<CarryMember> = {}): CarryMember => ({ id, name, rank, role: rank === 'hero' ? 'Mercenary Captain' : 'Warriors', dead: false, experience: rank === 'hero' ? 20 : 0, skills: [], injuries: [], equipment: [], ...extra });
const crew = [member('aldric', 'Aldric Voss', 'hero', { injuries: ['Old Battle Wound'] }), member('bruno', 'Bruno', 'henchman'), member('carl', 'Carl', 'henchman'), member('dieter', 'Dieter', 'henchman', { dead: true })];
const policy = (p: Partial<CarryPolicy>): CarryPolicy => ({ ...DEFAULT_CARRY, ...p });

test('as is: the living warriors, the roster, the gold and the wyrdstone; the dead stay behind', () => {
  const { roster } = built();
  const plan = carryPlan({ members: crew, roster, gold: 120, shards: 3 }, policy({ goldCap: 10 }), 'as-is', {}, reik);
  assert.deepEqual(plan.members.map((m) => m.fromId), ['aldric', 'bruno', 'carl']);
  assert.deepEqual(plan.left.map((l) => l.id), ['dieter']);
  assert.equal(plan.gold, 120, 'the policy does not touch a warband brought as it is');
  assert.equal(plan.shards, 3);
  assert.deepEqual(plan.roster, roster);
  assert.equal(needsApproval('as-is', true), false);
});

test('adjusted: heroes only, the experience capped, the gold and wyrdstone capped, a roster the builder still reads', () => {
  const { roster, war } = built();
  const plan = carryPlan({ members: crew, roster, gold: 120, shards: 3 }, policy({ heroesOnly: true, experienceCap: 5, goldCap: 50, shardCap: 1 }), 'adjusted', {}, reik);
  assert.deepEqual(plan.members.map((m) => m.fromId), ['aldric']);
  assert.ok(plan.left.some((l) => l.id === 'bruno' && /henchman/.test(l.why)));
  assert.equal(findSelection(plan.roster!.selections, war), undefined, 'the group is off the roster');
  assert.deepEqual(rosterMembers(plan.roster!), ['aldric']);
  const captain = warriorsOf(reik, plan.roster!).find((w) => w.kind === 'hero')!;
  assert.equal(captain.experience, 5);
  assert.equal(plan.gold, 50);
  assert.equal(plan.shards, 1);
  assert.ok(plan.notes.length >= 3);
  assert.ok(plan.members[0].changes.some((c) => /experience 20 → 5/.test(c)));
  assert.equal(needsApproval('adjusted', true), true, 'the keeper approves it through the draw-up');
  assert.equal(needsApproval('adjusted', false), false, 'one written by hand is edited on its page');
});

test('adjusted, written by hand: warrior by warrior, old wounds healed', () => {
  const plan = carryPlan({ members: crew, roster: null, gold: 30, shards: 0 }, policy({ healInjuries: true, experienceCap: 10 }), 'adjusted');
  const aldric = plan.members.find((m) => m.fromId === 'aldric')!;
  assert.deepEqual(aldric.injuries, []);
  assert.equal(aldric.experience, 10);
  assert.equal(plan.members.length, 3);
  assert.equal(plan.roster, null);
});

test('start over: the veterans named come back on nothing; the rest stay behind', () => {
  const { roster } = built();
  const plan = carryPlan({ members: crew, roster, gold: 300, shards: 9 }, DEFAULT_CARRY, 'start-over', { veterans: ['aldric', 'dieter'] }, reik);
  assert.deepEqual(plan.members.map((m) => [m.fromId, m.veteran, m.experience, m.injuries.length]), [['aldric', true, 0, 0]], 'the dead do not come back, even named');
  assert.equal(plan.roster, null);
  assert.equal(plan.gold, 0);
  assert.ok(plan.left.some((l) => l.id === 'bruno'));
  assert.equal(needsApproval('start-over', false), true);
});

test('the copy names new warriors, and the new ids are free', () => {
  const { roster } = built();
  const r = remapRoster(roster, new Map([['aldric', 'aldric-lustria'], ['bruno', 'bruno-lustria']]));
  assert.deepEqual(rosterMembers(r).sort(), ['aldric-lustria', 'bruno-lustria'], 'one not carried drops off its group');
  assert.deepEqual(rosterMembers(roster).sort(), ['aldric', 'bruno', 'carl'], 'the original is untouched');
  const taken = new Set(['agnar-lustria']);
  assert.equal(newIdFor('agnar', 'lustria', taken), 'agnar-lustria-2');
  assert.equal(newIdFor('agnar', 'lustria', taken), 'agnar-lustria-3');
});
