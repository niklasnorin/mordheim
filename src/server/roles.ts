/**
 * Who may do what. Three roles, in order: a player keeps one warband; a game master (`user.role = 'gm'`) runs
 * the campaign as well, setting up scenarios, tending every warband, editing the Curfew's content and the
 * Cryer's articles and moving the campaign; an admin, named by ADMIN_EMAILS, is a game master who also keeps
 * the accounts: granting the role, issuing reset words, signing players out, burning ledgers, running midnight.
 */
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { user } from './db/schema.ts';
import { isAdminEmail } from './env.ts';
import { getViewer, type Viewer } from './session.ts';

export type Role = 'player' | 'gm' | 'admin';
export interface Actor extends Viewer { role: Role }

export function roleFor(email: string, stored: string | null | undefined): Role {
  if (isAdminEmail(email)) return 'admin';
  return stored === 'gm' ? 'gm' : 'player';
}
export const isGm = (a: Actor | null | undefined): boolean => !!a && (a.role === 'gm' || a.role === 'admin');
export const isAdmin = (a: Actor | null | undefined): boolean => !!a && a.role === 'admin';

/** The signed-in user with their role, or null. */
export async function getActor(request: Request): Promise<Actor | null> {
  const viewer = await getViewer(request);
  if (!viewer) return null;
  const rows = await db().select({ role: user.role }).from(user).where(eq(user.id, viewer.id)).limit(1);
  return { ...viewer, role: roleFor(viewer.email, rows[0]?.role) };
}

/** Grant or take the game master's role. Admins are named by the environment and cannot be changed here. */
export async function setRole(userId: string, role: 'player' | 'gm'): Promise<void> {
  const updated = await db().update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId)).returning({ id: user.id });
  if (!updated.length) throw new Error('No such player.');
}

/** Every account, for a game master handing out warbands. */
export async function listUsers(): Promise<{ id: string; name: string; email: string; role: Role }[]> {
  const rows = await db().select({ id: user.id, name: user.name, email: user.email, role: user.role }).from(user).orderBy(user.name);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: roleFor(r.email, r.role) }));
}
