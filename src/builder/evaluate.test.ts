import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleFor, catalogueIndex, catalogueSlugs } from './data.ts';
import { evaluate, optionsUnder, place } from './evaluate.ts';
import { addNamed, findSelection, flatOptions, moveSelection, newRoster, optionNamed, removeSelection, RosterError, setCount } from './roster.ts';

const ids = () => { let n = 0; return () => `s${++n}`; };
const reik = bundleFor('reiklanders')!;

test('every warband in the data loads, and every warrior it offers can be hired and read without a fault', () => {
  assert.equal(catalogueSlugs().length, catalogueIndex.warbands.length);
  assert.ok(catalogueSlugs().length >= 16);
  for (const slug of catalogueSlugs()) {
    const b = bundleFor(slug)!;
    const id = ids();
    const r = newRoster(b, slug, id);
    const offered = flatOptions(optionsUnder(b, place(b, r), null)).filter((o) => !o.hidden && o.left !== 0 && (o.type === 'model' || o.type === 'unit'));
    assert.ok(offered.length >= 3, `${slug} offers its warriors`);
    let priced = 0;
    for (const o of offered) {
      const { roster } = addNamed(b, r, null, o.name, id);
      const ev = evaluate(b, roster);
      if ((ev.totals.points ?? 0) > 0) priced++;
    }
    assert.ok(priced >= offered.length - 1, `${slug}: its warriors cost something (a zombie may come free)`);
  }
});

test('the catalogue prices a captain, a champion and a group of warriors as the rulebook does', () => {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  const captain = addNamed(reik, r, null, 'Mercenary Captain', id); r = captain.roster;
  const ev = evaluate(reik, r);
  assert.equal(ev.byId.get(captain.id)!.total.points, 60);
  assert.equal(ev.byId.get(captain.id)!.total['wb-rating'], 25, 'five for the warrior and twenty for the experience they start with');
  const captainSel = findSelection(r.selections, captain.id)!;
  assert.ok(captainSel.children.some((c) => reik.nodes.get(c.entry)?.name === 'Leader'), 'the Leader rule comes with them');
  const warriors = addNamed(reik, r, null, 'Warriors', id); r = warriors.roster;
  const model = findSelection(r.selections, warriors.id)!.children.find((c) => reik.nodes.get(c.entry)?.type === 'model')!;
  r = setCount(r, model.id, 3);
  const kit = addNamed(reik, r, warriors.id, 'Starting Equipment (Mercenaries)', id); r = kit.roster;
  r = addNamed(reik, r, kit.id, 'Sword', id).roster;
  const after = evaluate(reik, r);
  assert.equal(after.byId.get(warriors.id)!.total.points, 3 * 25 + 3 * 10, 'three warriors and a sword for each');
  assert.equal(after.byId.get(warriors.id)!.total['wb-rating'], 15);
});

test('a characteristic increase changes the profile, and the catalogue says what is hidden where', () => {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  const c = addNamed(reik, r, null, 'Champion', id); r = c.roster;
  const before = evaluate(reik, r).byId.get(c.id)!.profiles[0].chars.find((x) => x.name === 'WS')!.value;
  r = addNamed(reik, r, c.id, '+1 WS', id).roster;
  const after = evaluate(reik, r).byId.get(c.id)!.profiles[0].chars.find((x) => x.name === 'WS')!.value;
  assert.equal(Number(after), Number(before) + 1);
  // Gromril blades are a Dwarf's to sell; a Reiklander's sword offers only the general kind
  const tp = addNamed(reik, r, c.id, 'Trading Post', id); r = tp.roster;
  const sword = addNamed(reik, r, tp.id, 'Sword', id); r = sword.roster;
  const under = flatOptions(optionsUnder(reik, place(reik, r), place(reik, r).find((p) => p.s.id === c.id)!.children.find((x) => x.s.id === tp.id)!.children[0]));
  assert.deepEqual(under.filter((o) => !o.hidden).map((o) => [o.name, o.each.points]), [['Gromril Weapon', 30], ['Ithilmar weapon', 20]]);
});

test('the catalogue’s limits refuse a third champion and report a group too large', () => {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  r = addNamed(reik, r, null, 'Champion', id).roster;
  r = addNamed(reik, r, null, 'Champion', id).roster;
  assert.throws(() => addNamed(reik, r, null, 'Champion', id), RosterError);
  const w = addNamed(reik, r, null, 'Warriors', id); r = w.roster;
  const model = findSelection(r.selections, w.id)!.children[0];
  r = setCount(r, model.id, 6);
  assert.ok(evaluate(reik, r).errors.some((e) => /Warriors: no more than 5/.test(e)));
});

test('gear moves from a warrior to the stash and back, and goes where the warrior may carry it', () => {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  const stash = { id: r.selections.find((x) => reik.nodes.get(x.entry)?.name === 'Stash')!.id };
  const c = addNamed(reik, r, null, 'Champion', id); r = c.roster;
  const kit = addNamed(reik, r, c.id, 'Starting Equipment (Mercenaries)', id); r = kit.roster;
  const sword = addNamed(reik, r, kit.id, 'Sword', id); r = sword.roster;
  const inStash = optionNamed(reik, r, stash.id, 'Sword')!;
  r = moveSelection(reik, r, sword.id, stash.id, inStash.id);
  assert.equal(findSelection(r.selections, stash.id)!.children[0].id, sword.id, 'the same sword, now in the stash');
  r = moveSelection(reik, r, sword.id, kit.id, optionNamed(reik, r, kit.id, 'Sword')!.id);
  assert.equal(findSelection(r.selections, kit.id)!.children.length, 1);
  r = removeSelection(r, sword.id);
  assert.equal(findSelection(r.selections, sword.id), undefined);
});
