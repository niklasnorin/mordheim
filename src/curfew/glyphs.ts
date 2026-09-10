/** Drawn glyphs pressed into each kind of wax seal. One stroke weight, 24-unit grid. */
import type { TokenType } from './engine';

const GLYPHS: Record<TokenType, string> = {
  // a knuckle bone: rerolls and second chances
  fortune: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  // a signpost at a crossroads: knowing the streets
  ground: '<path d="M12 21v-9"/><path d="M5 6h11l2.5 2.5L16 11H5z"/><path d="M12 6V3"/>',
  // a coin with a struck ring: the fence's chit
  market: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v2M12 18v2"/>',
  // an open eye: something overheard, something seen
  sight: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
};

export function sealSvg(type: TokenType): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[type]}</svg>`;
}
