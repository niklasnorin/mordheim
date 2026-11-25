/**
 * The stash and the trading post: what an item fetches when it is sold, and which line of the price chart a
 * catalogue's item is. Pure and tested.
 *
 * The campaign's rules, as the game masters set them:
 * - A warband is founded with 500 crowns; what is not spent goes into the stash.
 * - Between games, gear moves from a warrior to the stash and back; a henchman group is armed alike, so it takes one
 *   of an item for every warrior in it.
 * - An item sells at the trading post for half its price if it is common there, and half its base price (the figure
 *   before the dice) if it is rare. Halves round down. A warrior's free dagger fetches nothing.
 * - The post is the one where the campaign is now.
 * - A warrior who dies takes their gear with them: it is lost.
 */
import { TRADING_POST, COMMON, tradeItemById, type StockLine, type TradeItem } from '../campaign/trading.ts';

/** The fixed part of a price: "25+D6" is 25, "100+D6×10" is 100, "15" is 15. */
export function basePrice(price: string): number {
  const m = /^\s*(\d+)/.exec(price ?? '');
  return m ? Number(m[1]) : 0;
}
/** Whether a price leaves anything to the dice. */
export const rolled = (price: string): boolean => /d\d/i.test(price ?? '');

/** The lowest and highest a price can come to, the dice at their least and most. */
export function priceRange(price: string): { min: number; max: number } {
  const base = basePrice(price);
  let min = base, max = base;
  for (const m of (price ?? '').matchAll(/\+\s*(\d*)D(\d+)(?:\s*[×x*]\s*(\d+))?/gi)) {
    const n = Number(m[1] || 1), sides = Number(m[2]), times = Number(m[3] || 1);
    min += n * times;
    max += n * sides * times;
  }
  return { min, max };
}

export interface Saleable {
  /** The price at the post, as the chart or the location writes it. */
  price: string;
  /** 0 for common; the rarity to roll against otherwise. */
  rarity: number;
  /** How many of the chart's item this is: a brace of pistols is two. */
  multiplier?: number;
  /** The free dagger every warrior is given. */
  free?: boolean;
  /** A game master's own price for selling it at this post, overriding the rule. */
  salePrice?: number | null;
}

/**
 * What one fetches at the post: half the price if common, half the base price if rare, rounded down; a free dagger
 * nothing. A common item's price is a plain figure on the chart, so both come to half the figure before any dice.
 */
export function saleValue(item: Saleable): number {
  if (item.free) return 0;
  if (item.salePrice != null && Number.isFinite(item.salePrice)) return Math.max(0, Math.floor(item.salePrice));
  return Math.floor((basePrice(item.price) * (item.multiplier ?? 1)) / 2);
}

// ───────────────────────── the catalogue's items on the chart ─────────────────────────

/** Catalogue names the chart writes otherwise. */
const ALIASES: Record<string, [string, number?]> = {
  hammer: ['mace'], mace: ['mace'], club: ['mace'], 'mace hammer or club': ['mace'],
  longbow: ['long-bow'], shortbow: ['short-bow'], 'throwing knives stars': ['throwing-knives'], 'throwing stars or knives': ['throwing-knives'],
  'brace of pistols': ['pistol', 2], 'brace of duelling pistols': ['duelling-pistol', 2],
  'halfling cook book': ['halfling-cookbook'], 'holy tome': ['holy-tome'], 'superior black powder': ['superior-blackpowder'],
  'tears of shallaya': ['tears-of-shallya'], 'hochland long rifle': ['hunting-rifle'], 'free dagger': ['dagger'],
};
const norm = (s: string) => s.toLowerCase().replace(/^(gromril|ithilmar)\s+/, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const byName = new Map(TRADING_POST.map((t) => [norm(t.name), t]));

/** The chart's line for a catalogue item by its name, and how many of it the item is; undefined when the chart has no such item. */
export function chartItemFor(name: string): { item: TradeItem; multiplier: number } | undefined {
  const k = norm(name);
  const alias = ALIASES[k];
  if (alias) { const item = tradeItemById(alias[0]); return item ? { item, multiplier: alias[1] ?? 1 } : undefined; }
  const item = byName.get(k);
  return item ? { item, multiplier: 1 } : undefined;
}

export const isFreeDagger = (name: string): boolean => /^free dagger$/i.test(name.trim());

/**
 * What a catalogue item fetches at a post: the post's own line where it has one (its price, its rarity, a game
 * master's sale price), else the chart's, else the catalogue's own cost and rarity.
 */
export function saleOf(name: string, catalogue: { gold: number; rarity: number }, lines: StockLine[], salePrices: Record<string, number | null | undefined> = {}): { value: number; price: string; rarity: number; itemId: string | null } {
  if (isFreeDagger(name)) return { value: 0, price: '0', rarity: COMMON, itemId: 'dagger' };
  const chart = chartItemFor(name);
  const line = chart ? lines.find((l) => l.itemId === chart.item.id) : lines.find((l) => norm(l.name) === norm(name));
  const price = line?.price ?? chart?.item.price ?? String(catalogue.gold);
  const rarity = line?.rarity ?? chart?.item.rarity ?? catalogue.rarity;
  const itemId = line?.itemId ?? chart?.item.id ?? null;
  const value = saleValue({ price, rarity, multiplier: chart?.multiplier ?? 1, salePrice: itemId ? salePrices[itemId] : null });
  return { value, price, rarity, itemId };
}
