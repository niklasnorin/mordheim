import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proseSource } from './prose.ts';
import { normaliseBlocks } from './model.ts';

test('prose storage preserves Markdown indentation and hard breaks within the existing size limit', () => {
  const source = '    A written order\r\n\r\n- Watch  \r\n  Wait\r\n';
  const expected = source.replace(/\r\n/g, '\n');
  assert.equal(proseSource(source, 4000), expected);
  assert.equal(proseSource(source, 5), '    A');
  assert.equal(proseSource(' \n\t', 4000), '');
  assert.equal(proseSource(undefined, 4000), '');
  assert.equal(proseSource(null, 4000), '');
  assert.deepEqual(normaliseBlocks([{ kind: 'text', text: source }]), [{ kind: 'text', text: expected }]);
});
