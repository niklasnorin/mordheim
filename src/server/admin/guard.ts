/** Who may open the Watch House: game masters and admins. `admin` says whether the account panels are theirs too. */
import { getActor, isAdmin, isGm, type Actor } from '../roles.ts';

export type Admission = { viewer: Actor | null; gm: boolean; admin: boolean };

export async function admission(request: Request): Promise<Admission> {
  const viewer = await getActor(request);
  return { viewer, gm: isGm(viewer), admin: isAdmin(viewer) };
}
