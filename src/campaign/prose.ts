/** Whitespace is part of Markdown: keep indentation and hard breaks, but treat a blank draft as empty. */
export function proseSource(source: string | null | undefined, max: number): string {
  const text = (source ?? '').replace(/\r\n?/g, '\n');
  return text.trim() ? text.slice(0, max) : '';
}
