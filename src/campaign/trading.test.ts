import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRADE_CATEGORIES, TRADING_POST, availableByDefault, byCategory, priceLabel, rarityLabel, stockOf, type StockEntry } from './trading.ts';

const entry = (over: Partial<StockEntry> & { itemId: string }): StockEntry => ({ custom: false, name: '', category: '', available: null, price: null, rarity: null, notes: '', sort: 0, ...over });

test('the price chart is whole: ids unique, every item in a known category, rarities as the rulebook rolls them', () => {
  const ids = TRADING_POST.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TRADING_POST) {
    assert.ok((TRADE_CATEGORIES as readonly string[]).includes(t.category), t.id);
    assert.ok(t.rarity === 0 || (t.rarity >= 2 && t.rarity <= 12), `${t.id} rarity ${t.rarity}`);
    assert.ok(t.price.trim(), t.id);
  }
  assert.equal(rarityLabel(0), 'Common');
  assert.equal(rarityLabel(8), 'Rare 8');
  assert.equal(priceLabel('25+D6'), '25+D6 gc');
});

test('untouched, the post has the common items and none of the rare ones', () => {
  const lines = stockOf([]);
  assert.equal(lines.length, TRADING_POST.length);
  const sword = lines.find((l) => l.itemId === 'sword')!;
  assert.equal(sword.available, true);
  assert.equal(sword.price, '10');
  assert.deepEqual(sword.changed, { available: false, price: false, rarity: false });
  const rifle = lines.find((l) => l.itemId === 'hunting-rifle')!;
  assert.equal(rifle.available, false, 'rare items wait to be enabled');
  assert.equal(availableByDefault(0), true);
  assert.equal(availableByDefault(6), false);
});

test('the stock lays over the chart: enabled, repriced, made common, made scarce, and custom items in their category', () => {
  const lines = stockOf([
    entry({ itemId: 'hunting-rifle', available: true }),
    entry({ itemId: 'sword', price: '12', notes: 'The smith is the Watch’s cousin.' }),
    entry({ itemId: 'lucky-charm', rarity: 0 }),
    entry({ itemId: 'garlic', available: false }),
    entry({ itemId: 'lantern', rarity: 7 }),
    entry({ itemId: 'custom-eel-oil', custom: true, name: 'Eel oil', category: 'Miscellaneous equipment', price: '5+D6', rarity: 6, available: true, sort: 1 }),
    entry({ itemId: 'custom-barge', custom: true, name: 'Passage on a barge', category: 'Services', price: '15', rarity: 0, available: true, sort: 2 }),
  ]);
  const by = (id: string) => lines.find((l) => l.itemId === id)!;
  assert.equal(by('hunting-rifle').available, true);
  assert.deepEqual(by('hunting-rifle').changed, { available: true, price: false, rarity: false });
  assert.equal(by('sword').price, '12');
  assert.equal(by('sword').chart?.price, '10');
  assert.equal(by('sword').notes, 'The smith is the Watch’s cousin.');
  assert.equal(by('lucky-charm').rarity, 0);
  assert.equal(by('lucky-charm').available, true, 'made common, it is to be had by the rule');
  assert.equal(by('lucky-charm').changed.available, false, 'the rule did it, not the game master');
  assert.equal(by('garlic').available, false);
  assert.equal(by('garlic').changed.available, true);
  assert.equal(by('lantern').available, false, 'made scarce, the rule withholds it until enabled');
  assert.equal(by('custom-eel-oil').custom, true);
  assert.equal(by('custom-eel-oil').category, 'Miscellaneous equipment');
  const misc = lines.filter((l) => l.category === 'Miscellaneous equipment');
  assert.equal(misc.at(-1)!.itemId, 'custom-eel-oil', 'a custom item follows the chart’s items of its category');
  assert.equal(lines.at(-1)!.itemId, 'custom-barge', 'a category of the game master’s own comes last');
  const groups = byCategory(lines);
  assert.deepEqual(groups.map((g) => g.category), [...TRADE_CATEGORIES, 'Services']);
  assert.deepEqual(byCategory(stockOf([])).map((g) => g.category), [...TRADE_CATEGORIES]);
});
