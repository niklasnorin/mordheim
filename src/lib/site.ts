/** The site's base path without a trailing slash: '' at the root, '/mordheim' if a base is ever configured again. */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** An absolute URL path for something in `public/`. */
export function asset(path: string): string {
  return `${base}/${path.replace(/^\//, '')}`;
}
