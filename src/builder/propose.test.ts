import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleFor } from './data.ts';
import { propose, type RecordWarrior } from './propose.ts';
import { summarise } from './rules.ts';
import { warbands } from '../data/warbands.ts';

const recordOf = (id: string): RecordWarrior[] => warbands.find((w) => w.id === id)!.members.map((m) => ({
  id: m.id, name: m.name, role: m.role, rank: m.rank, dead: !!m.dead, stats: m.stats, experience: m.experience,
  equipment: m.equipment, skills: [...m.skills, ...(m.prayers ?? []).map((p) => `Prayer: ${p}`)], injuries: m.injuries ?? [],
}));

test('the Nordost Kin’s written roster is drawn up from the Ostlanders’ catalogue, warrior by warrior', () => {
  const b = bundleFor('ostlanders')!;
  let n = 0;
  const p = propose(b, 'ostlanders', recordOf('nordost'), () => `s${++n}`);
  const s = summarise(b, p.roster);
  assert.equal(s.size, 7);
  const agnar = s.warriors.find((w) => w.members.includes('agnar'))!;
  assert.equal(agnar.type, 'Elder');
  assert.deepEqual(agnar.equipment.sort(), ['Helmet', 'Light Armour', 'Shield', 'Sword']);
  assert.equal(agnar.experience, 24);
  assert.equal(agnar.stats.T, 4, 'the record’s toughness 4 is an advance');
  const mjolnir = s.warriors.find((w) => w.members.includes('mjolnir'))!;
  assert.ok(mjolnir.injuries.some((i) => /Severe Arm Wound/.test(i)), 'the wound is found though the record describes it');
  const baldur = s.warriors.find((w) => w.members.includes('baldur'))!;
  assert.equal(baldur.kind, 'hero', 'the promoted kinsman stands as a hero');
  assert.ok(s.warriors.find((w) => w.members.includes('skalle'))!.skills.some((x) => /Stag/.test(x)), 'the prayer is found under its number');
  assert.deepEqual(p.names[agnar.id], ['Agnar Nordost']);
  assert.ok(p.notes.every((x) => !/Mjølnir|Skalle/.test(x)), p.notes.join('; '));
});

test('a warrior the catalogue has no fighter for is said, not guessed', () => {
  const b = bundleFor('dwarf-treasure-hunters')!;
  let n = 0;
  const p = propose(b, 'dwarf-treasure-hunters', recordOf('bitterbrow-expedition'), () => `s${++n}`);
  assert.ok(p.notes.some((x) => /Jorgrim Bitterbrow: no Lord/.test(x)));
  const s = summarise(b, p.roster);
  assert.equal(s.warriors.find((w) => w.type === 'Clansmen')!.count, 2, 'two clansmen of one kit make one group');
});
