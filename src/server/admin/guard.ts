/** Who may open the Watch House. */
import { isAdminEmail } from '../env.ts';
import { getViewer, type Viewer } from '../session.ts';

export type Admission = { viewer: Viewer | null; admin: boolean };

export async function admission(request: Request): Promise<Admission> {
  const viewer = await getViewer(request);
  return { viewer, admin: Boolean(viewer && isAdminEmail(viewer.email)) };
}
