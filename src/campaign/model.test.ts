import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaderOf, type Member } from './model.ts';

const member = (id: string, over: Partial<Member> = {}): Member => ({
  id, warbandId: 'w', name: id, role: '', rank: 'henchman', portrait: '', epithet: '', dead: false,
  stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 }, skills: [], injuries: [], lore: '', sort: 0, ...over,
});

test('the leader is the living warrior with the Leader rule, wherever they stand on the roll', () => {
  const w = { members: [member('a', { rank: 'hero' }), member('b', { rank: 'hero', skills: ['Leader'] })] };
  assert.equal(leaderOf(w)?.id, 'b');
});

test('a fallen leader gives way to the first living hero, and an empty roll has no leader', () => {
  const w = { members: [member('henchman'), member('old', { rank: 'hero', skills: ['Leader'], dead: true }), member('next', { rank: 'hero' })] };
  assert.equal(leaderOf(w)?.id, 'next');
  assert.equal(leaderOf({ members: [member('a', { dead: true, skills: ['Leader'] })] })?.id, 'a');
  assert.equal(leaderOf({ members: [] }), undefined);
});
