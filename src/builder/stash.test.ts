import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePrice, chartItemFor, priceRange, saleOf, saleValue } from './stash.ts';
import { stockOf } from '../campaign/trading.ts';

test('the base price is the figure before the dice', () => {
  assert.equal(basePrice('25+D6'), 25);
  assert.equal(basePrice('100+D6×10'), 100);
  assert.equal(basePrice('15'), 15);
  assert.equal(basePrice(''), 0);
  assert.deepEqual(priceRange('100+D6×10'), { min: 110, max: 160 });
  assert.deepEqual(priceRange('20+2D6'), { min: 22, max: 32 });
});

test('a common item sells for half its price and a rare one for half its base price, rounded down', () => {
  assert.equal(saleValue({ price: '2', rarity: 0 }), 1, 'a dagger');
  assert.equal(saleValue({ price: '3', rarity: 0 }), 1, 'a mace rounds down');
  assert.equal(saleValue({ price: '1', rarity: 0 }), 0, 'garlic fetches nothing');
  assert.equal(saleValue({ price: '25+D6', rarity: 8 }), 12);
  assert.equal(saleValue({ price: '100+D6×10', rarity: 12 }), 50);
  assert.equal(saleValue({ price: '15', rarity: 0, multiplier: 2 }), 15, 'a brace is two');
  assert.equal(saleValue({ price: '2', rarity: 0, free: true }), 0, 'the free dagger');
  assert.equal(saleValue({ price: '25+D6', rarity: 8, salePrice: 20 }), 20, 'a game master’s own price wins');
});

test('the catalogue’s items find their line on the chart, under their other names too', () => {
  assert.equal(chartItemFor('Sword')?.item.id, 'sword');
  assert.equal(chartItemFor('Hammer')?.item.id, 'mace');
  assert.equal(chartItemFor('Gromril Sword')?.item.id, 'sword', 'a Gromril blade is still a sword on the chart');
  assert.deepEqual(chartItemFor('Brace of Pistols') && { id: chartItemFor('Brace of Pistols')!.item.id, n: chartItemFor('Brace of Pistols')!.multiplier }, { id: 'pistol', n: 2 });
  assert.equal(chartItemFor('Sigmarite Warhammer'), undefined);
});

test('a sale reads the post where the campaign is: its price and rarity, and a game master’s sale price', () => {
  const plain = stockOf([]);
  assert.equal(saleOf('Sword', { gold: 10, rarity: 0 }, plain).value, 5);
  assert.equal(saleOf('Free Dagger', { gold: 0, rarity: 0 }, plain).value, 0);
  assert.equal(saleOf('Elven Cloak', { gold: 100, rarity: 12 }, plain).value, 50);
  const commonHere = stockOf([{ itemId: 'lucky-charm', custom: false, available: true, price: null, rarity: 0, name: '', category: '', notes: '', sort: 0 }]);
  assert.equal(saleOf('Lucky Charm', { gold: 10, rarity: 6 }, commonHere).rarity, 0, 'common where the post has made it so');
  const dearer = stockOf([{ itemId: 'sword', custom: false, available: true, price: '14', rarity: null, name: '', category: '', notes: '', sort: 0 }]);
  assert.equal(saleOf('Sword', { gold: 10, rarity: 0 }, dearer).value, 7, 'half the post’s own price');
  assert.equal(saleOf('Sword', { gold: 10, rarity: 0 }, plain, { sword: 8 }).value, 8);
  assert.equal(saleOf('Sigmarite Warhammer', { gold: 15, rarity: 0 }, plain).value, 7, 'off the chart: the catalogue’s own cost');
});
