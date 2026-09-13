/**
 * The Watch House's API. Every action is a POST with a JSON body from a signed-in game master; the ones that touch
 * accounts and ledgers are for the admin alone. Answers are small: the page reloads its overview after a change.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { dispatch, route } from '../../../server/api';
import { todayFor } from '../../../server/curfew/service';
import { burnLedger, deleteDispatch, moveCampaign, postNotice, releaseLedger, revokeSessions, runMidnight } from '../../../server/admin/service';
import { issueResetWord } from '../../../server/account/service';
import { setRole } from '../../../server/roles';
import { createArticle, deleteArticle, updateArticle } from '../../../server/campaign/news';
import { deleteDocument, saveDocument } from '../../../server/content/curfew';
import { currentLocation } from '../../../server/curfew/service';

export const prerender = false;

// never steered: these actions reach every ledger
const today = () => todayFor(null);
const article = { headline: z.string().max(200), byline: z.string().max(200), body: z.string().max(4000), notice: z.boolean(), locationId: z.string().max(64), published: z.boolean(), sort: z.number().int() };

const routes = {
  // the admin's: accounts and ledgers
  burn: route(z.object({ warbandId: z.string().min(1).max(64) }), async (i) => { await burnLedger(i.warbandId, today()); return { ok: true, message: 'The ledger is ash. The keeper keeps the warband.' }; }, 'admin'),
  release: route(z.object({ warbandId: z.string().min(1).max(64) }), async (i) => { await releaseLedger(i.warbandId); return { ok: true, message: 'The warband is nobody’s now.' }; }, 'admin'),
  'revoke-sessions': route(z.object({ userId: z.string().min(1).max(128) }), async (i) => { const n = await revokeSessions(i.userId); return { ok: true, message: n ? `Signed out of ${n} ${n === 1 ? 'device' : 'devices'}.` : 'They were not signed in anywhere.' }; }, 'admin'),
  'issue-reset': route(z.object({ userId: z.string().min(1).max(128) }), async (i) => { const r = await issueResetWord(i.userId); return { ok: true, message: 'A reset word, good for two days. Pass it on; it is not shown again.', word: r.word, expiresAt: r.expiresAt }; }, 'admin'),
  'set-role': route(z.object({ userId: z.string().min(1).max(128), role: z.enum(['player', 'gm']) }), async (i) => { await setRole(i.userId, i.role); return { ok: true, message: i.role === 'gm' ? 'They are a game master now.' : 'They are a player again.' }; }, 'admin'),
  'run-midnight': route(z.object({}), async () => { const r = await runMidnight(today()); return { ok: true, message: r.nights ? `Midnight ran: ${r.nights} ${r.nights === 1 ? 'night' : 'nights'} written across ${r.ledgers} ${r.ledgers === 1 ? 'ledger' : 'ledgers'}, ${r.dispatches} for the Cryer.` : 'Midnight ran: every ledger was already current.', run: r }; }, 'admin'),
  // the game master's: the campaign
  'delete-dispatch': route(z.object({ id: z.number().int().positive() }), async (i) => { await deleteDispatch(i.id); return { ok: true, message: 'Pulled from the broadsheet.' }; }, 'gm'),
  'post-notice': route(z.object({ text: z.string().min(1).max(200) }), async (i) => { const d = await postNotice(i.text, today()); return { ok: true, message: 'The Cryer will print it.', dispatch: d }; }, 'gm'),
  'move-campaign': route(z.object({ locationId: z.string().min(1).max(64) }), async (i) => { const l = await moveCampaign(i.locationId, today()); return { ok: true, message: `The campaign is in ${l.name} from tonight.` }; }, 'gm'),
  'article-create': route(z.object(article).partial().required({ headline: true, body: true }), async (i, a) => ({ ok: true, message: 'Set in type.', article: await createArticle(a, i) }), 'gm'),
  'article-update': route(z.object({ id: z.number().int().positive(), patch: z.object(article).partial() }), async (i, a) => ({ ok: true, message: 'Corrected.', article: await updateArticle(a, i.id, i.patch) }), 'gm'),
  'article-delete': route(z.object({ id: z.number().int().positive() }), async (i, a) => { await deleteArticle(a, i.id); return { ok: true, message: 'Pulled from the Cryer.' }; }, 'gm'),
  'content-save': route(z.object({ id: z.string().min(1).max(80), text: z.string().max(2_000_000), version: z.number().int().nullable() }), async (i, a) => { const d = await saveDocument(a, i.id, i.text, i.version); return { ok: true, message: `Saved as version ${d.version}. The engine reads it from now on.`, version: d.version }; }, 'gm'),
  'content-delete': route(z.object({ id: z.string().min(1).max(80) }), async (i, a) => { await deleteDocument(a, i.id, (await currentLocation(today())).id); return { ok: true, message: 'The place is off the map. Its last version is kept.' }; }, 'gm'),
};

export const POST: APIRoute = ({ request, params }) => dispatch(routes, params.action, request, 'watch-house');
