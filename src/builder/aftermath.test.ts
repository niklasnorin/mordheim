import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancesBetween, aftermath } from './aftermath.ts';
import type { Warrior } from './rules.ts';

const warrior = (id: string, over: Partial<Warrior>): Warrior => ({
  id, kind: 'hero', type: 'Champion', count: 1, members: [id], promoted: false, stats: { M: 4, WS: 4, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
  equipment: [], skills: [], injuries: [], experience: 8, gear: [], parts: [], cost: 35, rating: 13, errors: [], ...over,
});

test('a game’s experience: one for coming through, one a takedown for a hero, one more for a winning leader', () => {
  const ws = [
    warrior('cap', { skills: ['Leader'], experience: 20 }),
    warrior('champ', { experience: 7 }),
    warrior('grp', { kind: 'henchmen', type: 'Warriors', count: 2, members: ['a', 'b'], experience: 1 }),
    warrior('kid', { experience: 0 }),
  ];
  const out = aftermath(ws, {
    result: 'victory',
    members: [{ memberId: 'cap', status: 'active' }, { memberId: 'champ', status: 'injured' }, { memberId: 'a', status: 'dead' }, { memberId: 'b', status: 'active' }],
    takedowns: [{ attackerId: 'cap', targetId: 'x' }, { attackerId: 'cap', targetId: 'y' }, { attackerId: 'b', targetId: 'z' }, { attackerId: 'enemy', targetId: 'champ' }],
  });
  const by = new Map(out.map((a) => [a.warriorId, a]));
  assert.equal(by.get('cap')!.suggested, 4, 'came through, two takedowns, and won');
  assert.equal(by.get('champ')!.suggested, 1);
  assert.deepEqual(by.get('champ')!.outOfAction, ['champ'], 'and rolls for it');
  assert.equal(by.get('champ')!.advances, 1, 'eight is a hero’s advance');
  assert.equal(by.get('grp')!.suggested, 1, 'a henchman’s takedown is not counted; the group came through');
  assert.equal(by.get('kid')!.fought, false);
  assert.equal(by.get('kid')!.suggested, 0);
});

test('advances are the thresholds crossed', () => {
  assert.equal(advancesBetween('hero', 1, 4), 2);
  assert.equal(advancesBetween('henchmen', 1, 2), 1);
  assert.equal(advancesBetween('henchmen', 14, 20), 0);
});
