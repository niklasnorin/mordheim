import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleFor, catalogueSlugs } from './data.ts';
import { addNamed, findSelection, newRoster, setCount } from './roster.ts';
import { maxWarriors, slugForType, stashItems, summarise, warriorsOf } from './rules.ts';

const ids = () => { let n = 0; return () => `s${++n}`; };

test('the record’s warband types find their catalogue', () => {
  const slugs = catalogueSlugs();
  assert.equal(slugForType('Ostlanders', slugs), 'ostlanders');
  assert.equal(slugForType('Dwarf Treasure Hunters', slugs), 'dwarf-treasure-hunters');
  assert.equal(slugForType('Marauders of Chaos', slugs), 'marauders-of-chaos');
  assert.equal(slugForType('Reiklanders (1a)', slugs), 'reiklanders');
  assert.equal(slugForType('Lizardmen', slugs), undefined);
});

test('a roster reads as warriors: statline, gear, skills, old wounds and experience', () => {
  const b = bundleFor('ostlanders')!, id = ids();
  let r = newRoster(b, 'ostlanders', id);
  const elder = addNamed(b, r, null, 'Elder', id); r = elder.roster;
  const kit = addNamed(b, r, elder.id, 'Starting Equipment (Ostlander)', id); r = kit.roster;
  r = addNamed(b, r, kit.id, 'Sword', id).roster;
  const ws = warriorsOf(b, r)[0].stats.WS;
  r = addNamed(b, r, elder.id, '+1 WS', id).roster;
  r = addNamed(b, r, elder.id, 'Old Battle Wound', id).roster;
  const [w] = warriorsOf(b, r);
  assert.equal(w.kind, 'hero');
  assert.equal(w.type, 'Elder');
  assert.ok(w.equipment.includes('Sword'));
  assert.deepEqual(w.injuries, ['Old Battle Wound']);
  assert.ok(w.experience >= 20, 'a leader starts experienced');
  assert.equal(w.stats.WS, ws + 1, 'the advance is on the statline');
  assert.ok(w.skills.includes('Leader'));
});

test('the warband is held to its size, and the stash is not spent', () => {
  const b = bundleFor('dwarf-treasure-hunters')!, id = ids();
  assert.equal(maxWarriors('dwarf-treasure-hunters'), 12);
  let r = newRoster(b, 'dwarf-treasure-hunters', id);
  const g1 = addNamed(b, r, null, 'Clansmen', id); r = g1.roster;
  const g2 = addNamed(b, r, null, 'Clansmen', id); r = g2.roster;
  const g3 = addNamed(b, r, null, 'Clansmen', id); r = g3.roster;
  for (const g of [g1, g2, g3]) r = setCount(r, findSelection(r.selections, g.id)!.children.find((c) => b.nodes.get(c.entry)?.type === 'model')!.id, 5);
  const s = summarise(b, r);
  assert.equal(s.size, 15);
  assert.ok(s.errors.some((e) => /no more than 12 warriors/.test(e)));
  assert.ok(s.errors.some((e) => /needs one of its heroes/.test(e)), 'and it needs a leader');
  assert.deepEqual(stashItems(b, r), []);
});
