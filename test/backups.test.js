const test = require('node:test');
const assert = require('node:assert');
const { backupsToPrune } = require('../src/lib/backups');

test('backupsToPrune keeps the newest backups', () => {
  const names = [
    'config.json',
    'config.json.corrupted.100.bak',
    'config.json.corrupted.400.bak',
    'config.json.corrupted.200.bak',
    'config.json.corrupted.300.bak',
    'config.json.123.tmp',
  ];
  assert.deepStrictEqual(backupsToPrune(names, 'config.json', 2), ['config.json.corrupted.200.bak', 'config.json.corrupted.100.bak']);
  assert.deepStrictEqual(backupsToPrune(names, 'config.json', 10), []);
});

test('backupsToPrune leaves unrelated files alone', () => {
  const names = ['other.json.corrupted.1.bak', 'config.json.corrupted.x.bak', 'config.json.corrupted.1.bak.txt', 'config.json.corrupted..bak'];
  assert.deepStrictEqual(backupsToPrune(names, 'config.json', 0), []);
});
