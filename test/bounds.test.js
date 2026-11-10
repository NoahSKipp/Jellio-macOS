const test = require('node:test');
const assert = require('node:assert');
const { isOnScreen, sanitizeBounds } = require('../src/lib/bounds');

test('sanitizeBounds keeps sane saved bounds', () => {
  assert.deepStrictEqual(sanitizeBounds({ x: 10, y: 20, width: 1200, height: 800 }), { x: 10, y: 20, width: 1200, height: 800 });
});

test('sanitizeBounds falls back to the default size for junk', () => {
  for (const junk of [null, 'big', 42, [], {}, { width: '1200', height: 800 }, { width: NaN, height: 800 }, { width: 1200, height: Infinity }]) {
    assert.deepStrictEqual(sanitizeBounds(junk), { width: 1440, height: 900 }, JSON.stringify(junk));
  }
});

test('sanitizeBounds clamps sizes and drops bad positions', () => {
  assert.deepStrictEqual(sanitizeBounds({ width: 10, height: 99999 }), { width: 800, height: 16384 });
  assert.deepStrictEqual(sanitizeBounds({ x: '5', y: 5, width: 900, height: 600 }), { width: 900, height: 600 });
  assert.deepStrictEqual(sanitizeBounds({ x: 1e9, y: 5, width: 900, height: 600 }), { width: 900, height: 600 });
  assert.deepStrictEqual(sanitizeBounds({ x: 1.6, y: -2.4, width: 900.4, height: 600 }), { x: 2, y: -2, width: 900, height: 600 });
});

test('isOnScreen needs a position overlapping some display', () => {
  const areas = [{ x: 0, y: 25, width: 1512, height: 957 }];
  assert.ok(isOnScreen({ x: 100, y: 100, width: 900, height: 600 }, areas));
  assert.ok(!isOnScreen({ x: 4000, y: 100, width: 900, height: 600 }, areas));
  assert.ok(!isOnScreen({ width: 900, height: 600 }, areas));
});
