/**
 * The trading post: the rulebook's price chart, and how a location's own stock is laid over it.
 *
 * The chart is a rule, so it is code. Each location keeps a list of entries (`location_stock`) that say how its
 * trading post differs from the chart: a chart item made available or not, repriced or made rarer or commoner, and
 * custom items of the game master's own. `stockOf` merges the two into what the post has, in the chart's order.
 * The rule for an item nobody has touched: common items are to be had, rare ones have to be enabled first.
 */

export const TRADE_CATEGORIES = ['Hand-to-hand combat weapons', 'Missile weapons', 'Blackpowder weapons', 'Armour', 'Miscellaneous equipment', 'Animals'] as const;
export type TradeCategory = (typeof TRADE_CATEGORIES)[number];

/** Common. A rarity above zero is the roll needed on 2D6 to find the item: "Rare 8". */
export const COMMON = 0;

/** One line of the price chart. The price is text because the chart rolls dice for many of them: "25+D6". The unit is gold crowns. */
export interface TradeItem {
  id: string;
  name: string;
  category: TradeCategory;
  price: string;
  rarity: number;
  /** A word from the chart worth keeping: the first dagger is free, a brace of pistols is twice the price. */
  note?: string;
}

const item = (id: string, name: string, category: TradeCategory, price: string, rarity = COMMON, note?: string): TradeItem => (note ? { id, name, category, price, rarity, note } : { id, name, category, price, rarity });

/** The Mordheim rulebook's trading post price chart, in its order. */
export const TRADING_POST: readonly TradeItem[] = [
  // hand-to-hand combat weapons
  item('dagger', 'Dagger', 'Hand-to-hand combat weapons', '2', COMMON, 'The first is free'),
  item('mace', 'Mace, hammer or club', 'Hand-to-hand combat weapons', '3'),
  item('axe', 'Axe', 'Hand-to-hand combat weapons', '5'),
  item('sword', 'Sword', 'Hand-to-hand combat weapons', '10'),
  item('flail', 'Flail', 'Hand-to-hand combat weapons', '15'),
  item('morning-star', 'Morning star', 'Hand-to-hand combat weapons', '15'),
  item('halberd', 'Halberd', 'Hand-to-hand combat weapons', '10'),
  item('spear', 'Spear', 'Hand-to-hand combat weapons', '10'),
  item('double-handed-weapon', 'Double-handed weapon', 'Hand-to-hand combat weapons', '15'),
  item('lance', 'Lance', 'Hand-to-hand combat weapons', '40', 8),
  // missile weapons
  item('short-bow', 'Short bow', 'Missile weapons', '5'),
  item('bow', 'Bow', 'Missile weapons', '10'),
  item('long-bow', 'Long bow', 'Missile weapons', '15'),
  item('elf-bow', 'Elf bow', 'Missile weapons', '35+3D6', 12),
  item('crossbow', 'Crossbow', 'Missile weapons', '25'),
  item('sling', 'Sling', 'Missile weapons', '2'),
  item('throwing-knives', 'Throwing stars or knives', 'Missile weapons', '15', 5),
  item('repeater-crossbow', 'Repeater crossbow', 'Missile weapons', '40', 8),
  item('crossbow-pistol', 'Crossbow pistol', 'Missile weapons', '35', 9),
  // blackpowder weapons
  item('pistol', 'Pistol', 'Blackpowder weapons', '15', 8, '30 for a brace'),
  item('duelling-pistol', 'Duelling pistol', 'Blackpowder weapons', '30', 10, '60 for a brace'),
  item('blunderbuss', 'Blunderbuss', 'Blackpowder weapons', '30', 9),
  item('handgun', 'Handgun', 'Blackpowder weapons', '35', 8),
  item('hunting-rifle', 'Hunting rifle', 'Blackpowder weapons', '200', 11),
  // armour
  item('light-armour', 'Light armour', 'Armour', '20'),
  item('heavy-armour', 'Heavy armour', 'Armour', '50'),
  item('shield', 'Shield', 'Armour', '5'),
  item('buckler', 'Buckler', 'Armour', '5'),
  item('helmet', 'Helmet', 'Armour', '10'),
  item('gromril-armour', 'Gromril armour', 'Armour', '150', 11),
  item('ithilmar-armour', 'Ithilmar armour', 'Armour', '90', 11),
  // miscellaneous equipment
  item('black-lotus', 'Black Lotus', 'Miscellaneous equipment', '10+D6', 9),
  item('blessed-water', 'Blessed water', 'Miscellaneous equipment', '10+3D6', 6),
  item('bugmans-ale', 'Bugman’s Ale', 'Miscellaneous equipment', '50+3D6', 9),
  item('caltrops', 'Caltrops', 'Miscellaneous equipment', '15+2D6', 6),
  item('cathayan-silk', 'Cathayan silk clothes', 'Miscellaneous equipment', '50+2D6', 9),
  item('crimson-shade', 'Crimson Shade', 'Miscellaneous equipment', '25+D6', 8),
  item('dark-venom', 'Dark Venom', 'Miscellaneous equipment', '30+2D6', 8),
  item('elven-cloak', 'Elven cloak', 'Miscellaneous equipment', '100+D6×10', 12),
  item('familiar', 'Familiar', 'Miscellaneous equipment', '20+2D6', 8),
  item('garlic', 'Garlic', 'Miscellaneous equipment', '1'),
  item('halfling-cookbook', 'Halfling cookbook', 'Miscellaneous equipment', '30+3D6', 7),
  item('healing-herbs', 'Healing herbs', 'Miscellaneous equipment', '20+2D6', 8),
  item('holy-relic', 'Holy relic', 'Miscellaneous equipment', '15+3D6', 8),
  item('holy-tome', 'Holy or unholy tome', 'Miscellaneous equipment', '100+D6×10', 8),
  item('hunting-arrows', 'Hunting arrows', 'Miscellaneous equipment', '25+D6', 8),
  item('lantern', 'Lantern', 'Miscellaneous equipment', '10'),
  item('lucky-charm', 'Lucky charm', 'Miscellaneous equipment', '10', 6),
  item('mandrake-root', 'Mandrake root', 'Miscellaneous equipment', '25+D6', 8),
  item('mordheim-map', 'Mordheim map', 'Miscellaneous equipment', '20+4D6', 9),
  item('net', 'Net', 'Miscellaneous equipment', '5'),
  item('rabbits-foot', 'Rabbit’s foot', 'Miscellaneous equipment', '10', 5),
  item('rope-and-hook', 'Rope and hook', 'Miscellaneous equipment', '5'),
  item('superior-blackpowder', 'Superior blackpowder', 'Miscellaneous equipment', '30', 11),
  item('tears-of-shallya', 'Tears of Shallya', 'Miscellaneous equipment', '10+2D6', 7),
  item('toughened-leathers', 'Toughened leathers', 'Miscellaneous equipment', '5'),
  item('wyrdstone-pendulum', 'Wyrdstone pendulum', 'Miscellaneous equipment', '25+3D6', 9),
  // animals
  item('wardog', 'Wardog', 'Animals', '25+2D6', 10),
  item('horse', 'Horse', 'Animals', '40', 8),
  item('warhorse', 'Warhorse', 'Animals', '80', 11),
];

export const tradeItemById = (id: string): TradeItem | undefined => TRADING_POST.find((t) => t.id === id);

/**
 * One row of a location's stock, as the record keeps it. For a chart item (`custom: false`) every field but `itemId`
 * may be null, meaning the chart's own; for a custom item the row is the item.
 */
export interface StockEntry {
  itemId: string;
  custom: boolean;
  name: string;
  category: string;
  /** Whether the post has it; null leaves it to the rule (common yes, rare no). */
  available: boolean | null;
  price: string | null;
  rarity: number | null;
  notes: string;
  sort: number;
}

/** One line of what a location's trading post has, chart and stock merged. */
export interface StockLine {
  itemId: string;
  name: string;
  category: string;
  price: string;
  rarity: number;
  available: boolean;
  custom: boolean;
  notes: string;
  /** The chart's own note, if any. */
  note?: string;
  /** What the game master changed on a chart item; never set for a custom one. */
  changed: { available: boolean; price: boolean; rarity: boolean };
  /** The chart's price and rarity, for a line that was changed. */
  chart?: { price: string; rarity: number };
}

export const isCommon = (rarity: number): boolean => rarity <= COMMON;
export const rarityLabel = (rarity: number): string => (isCommon(rarity) ? 'Common' : `Rare ${rarity}`);
/** A price as the post prints it: "25+D6 gc", or "the first free, then 2 gc" is left to the note. */
export const priceLabel = (price: string): string => (price.trim() ? `${price.trim()} gc` : '—');

/** The rule for an item nobody has touched: common items are to be had, rare ones have to be enabled. Judged by the rarity in force. */
export const availableByDefault = (rarity: number): boolean => isCommon(rarity);

/**
 * What a location's trading post has: every chart item as the stock amends it, then the custom items, each in its
 * category's place. Unavailable items are kept in the list (marked) so a game master sees what may be enabled.
 */
export function stockOf(stock: readonly StockEntry[]): StockLine[] {
  const byId = new Map(stock.map((s) => [s.itemId, s]));
  const chart: StockLine[] = TRADING_POST.map((t) => {
    const s = byId.get(t.id);
    const price = s?.price?.trim() ? s.price.trim() : t.price;
    const rarity = s?.rarity ?? t.rarity;
    const available = s?.available ?? availableByDefault(rarity);
    const changed = { available: s?.available != null && s.available !== availableByDefault(rarity), price: price !== t.price, rarity: rarity !== t.rarity };
    return {
      itemId: t.id, name: t.name, category: t.category, price, rarity, available, custom: false, notes: s?.notes ?? '', note: t.note, changed,
      ...(changed.price || changed.rarity ? { chart: { price: t.price, rarity: t.rarity } } : {}),
    };
  });
  const custom: StockLine[] = stock.filter((s) => s.custom).sort((a, b) => a.sort - b.sort || a.itemId.localeCompare(b.itemId)).map((s) => ({
    itemId: s.itemId, name: s.name, category: s.category || 'Miscellaneous equipment', price: s.price ?? '', rarity: s.rarity ?? COMMON, available: s.available ?? true, custom: true, notes: s.notes,
    changed: { available: false, price: false, rarity: false },
  }));
  // custom items follow the chart's items of their category; a category of the game master's own comes last
  const out: StockLine[] = [];
  for (const c of TRADE_CATEGORIES) out.push(...chart.filter((l) => l.category === c), ...custom.filter((l) => l.category === c));
  out.push(...custom.filter((l) => !(TRADE_CATEGORIES as readonly string[]).includes(l.category)));
  return out;
}

/** The lines grouped by category, in the chart's order, categories of the game master's own after. Empty categories are left out. */
export function byCategory(lines: readonly StockLine[]): { category: string; lines: StockLine[] }[] {
  const order = [...TRADE_CATEGORIES, ...new Set(lines.map((l) => l.category).filter((c) => !(TRADE_CATEGORIES as readonly string[]).includes(c)))];
  return order.map((category) => ({ category, lines: lines.filter((l) => l.category === category) })).filter((g) => g.lines.length > 0);
}
