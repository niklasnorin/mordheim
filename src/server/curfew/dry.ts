/**
 * Dry runs: stepping nights for debugging without writing a single one.
 *
 * With the Debug strip on, the browser sets a `curfew-dry` cookie. While it is set, and only where `CURFEW_DEBUG`
 * is on and the viewer is a game master, every ledger request is computed in memory and nothing is saved or
 * published: the page and the API answer as if the night had been written, and the real ledger is untouched.
 * The browser carries the sandbox state between requests (`dry.base`), so a run of nights builds on itself;
 * turning the strip off drops the sandbox and the warband is exactly as it was.
 */
import { env, isAdminEmail } from '../env.ts';
import type { Viewer } from '../session.ts';

export const DRY_COOKIE = 'curfew-dry';

export function hasDryCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').some((c) => c.trim() === `${DRY_COOKIE}=1`);
}

/** Whether this request is a dry run. Needs all three: debug on for the deployment, a game master asking, and the strip on in their browser. */
export function isDryRun(request: Request, viewer: Viewer | null): boolean {
  return env.CURFEW_DEBUG && !!viewer && isAdminEmail(viewer.email) && hasDryCookie(request);
}
