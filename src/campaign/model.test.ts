import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterNumeral, leaderOf, normaliseBlocks, paragraphsOf, type Member } from './model.ts';

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

test('a chapter keeps its text in paragraphs and its pictures within the sizes their unit allows', () => {
  const blocks = normaliseBlocks([
    { kind: 'text', text: '  \n ' },
    { kind: 'text', text: 'They came by the river.\r\n\r\nNone of them\nspoke.' },
    { kind: 'image', imageId: 'a', align: 'right', size: 400, unit: '%', caption: ' The ferry ' },
    { kind: 'image', imageId: 'b', align: 'sideways' as never, size: 10, unit: 'px', caption: '' },
  ]);
  assert.equal(blocks.length, 3);
  assert.deepEqual(paragraphsOf((blocks[0] as { text: string }).text), ['They came by the river.', 'None of them spoke.']);
  assert.deepEqual(blocks[1], { kind: 'image', imageId: 'a', align: 'right', size: 100, unit: '%', caption: 'The ferry' });
  assert.deepEqual(blocks[2], { kind: 'image', imageId: 'b', align: 'centre', size: 60, unit: 'px', caption: '' });
});

test('chapters are numbered the old way', () => {
  assert.deepEqual([1, 4, 9, 14, 40].map(chapterNumeral), ['I', 'IV', 'IX', 'XIV', 'XL']);
});
