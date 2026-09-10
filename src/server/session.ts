/** Who is asking. Null when nobody is signed in, or when there is no database to ask. */
import { auth } from './auth.ts';
import { hasDatabase } from './db/client.ts';

export interface Viewer { id: string; name: string; email: string; image?: string | null }

export async function getViewer(request: Request): Promise<Viewer | null> {
  if (!hasDatabase()) return null;
  try {
    const result = await auth().api.getSession({ headers: request.headers });
    if (!result) return null;
    const { id, name, email, image } = result.user;
    return { id, name, email, image };
  } catch {
    return null;
  }
}
