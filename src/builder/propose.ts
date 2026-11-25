/**
 * A roster drawn up from a warband's hand-written record, for its keeper to correct and confirm: each living warrior
 * found among the catalogue's fighters by their role, henchmen of a kind and kit gathered into groups, their gear,
 * skills and old wounds found by name, their experience carried over, and the difference between their statline and
 * the catalogue's taken as advances. What cannot be found is said, not guessed. Pure.
 */
import { nodeOf, type Bundle } from './catalogue.ts';
import { evaluate, optionsUnder, place, findPlaced, type Roster, type OptionView } from './evaluate.ts';
import { addSelection, findSelection, flatOptions, newRoster, RosterError, setCount, type IdMaker } from './roster.ts';
import { GROUP_MAX, statlineOf, warriorsOf } from './rules.ts';
import { STAT_KEYS, type Statline } from '../campaign/model.ts';

export interface RecordWarrior {
  id: string;
  name: string;
  role: string;
  rank: 'hero' | 'henchman';
  dead: boolean;
  stats: Statline;
  experience?: number;
  equipment: string[];
  skills: string[];
  injuries: string[];
}
export interface Proposal { roster: Roster; names: Record<string, string[]>; notes: string[] }

/** A name as both sides can be compared: no prayer label, no list number, no description after a dash. */
const norm = (s: string) => s.toLowerCase().replace(/^prayer:\s*/, '').replace(/^\d+\s*-\s*/, '').replace(/\s+[—–-]\s+.*$/, '').replace(/[’']/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
const singular = (s: string) => s.replace(/men$/, 'man').replace(/ies$/, 'y').replace(/s$/, '');
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || singular(x) === singular(y); };
const ADV: Record<keyof Statline, string> = { M: 'M', WS: 'WS', BS: 'BS', S: 'S', T: 'T', W: 'W', I: 'I', A: 'A', Ld: 'LD' };

function optionsAt(b: Bundle, r: Roster, parentId: string | null): OptionView[] {
  const roots = place(b, r);
  return flatOptions(optionsUnder(b, roots, parentId ? findPlaced(roots, parentId) ?? null : null)).filter((o) => !o.hidden);
}

export function propose(b: Bundle, slug: string, warriors: RecordWarrior[], newId: IdMaker): Proposal {
  let roster = newRoster(b, slug, newId);
  const names: Record<string, string[]> = {};
  const notes: string[] = [];
  const living = warriors.filter((w) => !w.dead);
  const fighters = optionsAt(b, roster, null).filter((o) => o.type === 'model' || o.type === 'unit');

  // henchmen of one role and one kit stand as a group, five at most
  const groups: RecordWarrior[][] = [];
  for (const w of living) {
    if (w.rank === 'hero') { groups.push([w]); continue; }
    const kit = (x: RecordWarrior) => [...x.equipment].map(norm).sort().join('|');
    const g = groups.find((x) => x[0].rank === 'henchman' && same(x[0].role, w.role) && kit(x[0]) === kit(w) && x.length < GROUP_MAX);
    if (g) g.push(w); else groups.push([w]);
  }

  for (const group of groups) {
    const lead = group[0];
    const fighter = fighters.find((o) => same(o.name, lead.role)) ?? fighters.find((o) => norm(o.name).includes(singular(norm(lead.role))) || singular(norm(lead.role)).includes(singular(norm(o.name))));
    const who = group.map((w) => w.name).join(', ');
    if (!fighter) { notes.push(`${who}: no ${lead.role || 'warrior'} among the catalogue’s fighters; hire them by hand.`); continue; }
    let id: string;
    try { ({ roster, id } = addSelection(b, roster, null, fighter.id, newId)); }
    catch (e) { notes.push(`${who}: ${(e as Error).message}`); continue; }
    const sel = findSelection(roster.selections, id)!;
    const model = sel.children.find((c) => nodeOf(b, c.entry)?.type === 'model');
    if (model && group.length > 1) roster = setCount(roster, model.id, group.length);
    findSelection(roster.selections, id)!.members = group.map((w) => w.id);
    names[id] = group.map((w) => w.name);

    const take = (parent: string, name: string, count = 1): boolean => {
      const o = optionsAt(b, roster, parent).find((x) => same(x.name, name) || same(nodeOf(b, x.id)?.name ?? '', name));
      if (!o) return false;
      try { roster = addSelection(b, roster, parent, o.id, newId, count).roster; return true; } catch { return false; }
    };
    // gear, from the warband's own list where it is on it, else the trading post
    for (const item of lead.equipment) {
      let placed = false;
      for (const where of [/^Starting Equipment/i, /^Trading Post/i]) {
        const holder = findSelection(roster.selections, id)!.children.find((c) => where.test(nodeOf(b, c.entry)?.name ?? ''));
        let cid = holder?.id;
        if (!cid) { const o = optionsAt(b, roster, id).find((x) => where.test(x.name)); if (!o) continue; try { const r = addSelection(b, roster, id, o.id, newId); roster = r.roster; cid = r.id; } catch { continue; } }
        if (take(cid, item.replace(/\s*×\s*\d+$/, ''))) { placed = true; break; }
      }
      if (!placed) notes.push(`${who}: ${item} is not on their lists; take it by hand or leave it off.`);
    }
    // drop an empty kit list the search opened
    for (const c of [...findSelection(roster.selections, id)!.children]) if (/^(Starting Equipment|Trading Post)/i.test(nodeOf(b, c.entry)?.name ?? '') && c.children.length === 0) findSelection(roster.selections, id)!.children.splice(findSelection(roster.selections, id)!.children.indexOf(c), 1);
    const have = () => warriorsOf(b, roster).find((x) => x.id === id)!;
    for (const skill of lead.skills) {
      if (have().skills.some((s) => same(s, skill))) continue;
      if (/^promoted\b/i.test(skill)) { if (!take(id, 'Promoted')) notes.push(`${who}: could not be marked promoted; do it by hand.`); continue; }
      if (/^skill access\b/i.test(skill)) continue;
      if (!take(id, skill)) notes.push(`${who}: ${skill.replace(/^Prayer:\s*/i, '')} was not found among what they may take; pick it by hand.`);
    }
    for (const wound of lead.injuries) if (!take(id, wound)) notes.push(`${who}: the old wound ${wound} was not found; pick it by hand.`);
    // experience as the record has it
    // (none on the record leaves the catalogue's own: a leader's twenty, a champion's eight)
    const xp = lead.experience ?? 0;
    const w0 = have();
    if (xp > 0) {
      if (w0.experienceId) roster = setCount(roster, w0.experienceId, Math.max(xp, 1));
      else if (!take(id, 'Experience', xp)) notes.push(`${who}: their ${xp} experience could not be entered.`);
      if (w0.experienceId && xp < w0.experience) notes.push(`${who}: ${xp} experience on the record, fewer than the ${w0.experience} they would start with.`);
    }
    // the statline: what the record has beyond the catalogue's is an advance
    const ev = evaluate(b, roster);
    const v = ev.byId.get(id);
    const now = statlineOf(v?.profiles.some((p) => p.typeName === 'Model') ? v : v?.children.find((c) => c.type === 'model'));
    for (const k of STAT_KEYS) {
      const d = lead.stats[k] - now[k];
      if (!d) continue;
      if (!take(id, `${d > 0 ? '+' : '-'}1 ${ADV[k]}`, Math.abs(d))) notes.push(`${who}: ${k} ${lead.stats[k]} on the record, ${now[k]} by the catalogue; set it by hand.`);
    }
  }
  return { roster, names, notes };
}

export { RosterError };
