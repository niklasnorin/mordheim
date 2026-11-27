/** The site's base path without a trailing slash: '' at the root, '/mordheim' if a base is ever configured again. */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** An absolute URL path for something in `public/`. */
export function asset(path: string): string {
  return `${base}/${path.replace(/^\//, '')}`;
}

/**
 * The path a page was asked for, as a link back to it: in the campaign it is in. A page under `/c/<slug>/` is served
 * from the rest of the path (src/middleware.ts), so `Astro.url` no longer carries the prefix; `locals.base` does.
 */
export function herePath(locals: { base: string }, url: URL): string {
  const p = base && url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname;
  return `${locals.base}${p}`;
}
