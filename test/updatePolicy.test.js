const test = require('node:test');
const assert = require('node:assert');
const policy = require('../src/lib/updatePolicy');

const HASH = 'a'.repeat(64);

test('releaseVersion strips v and rejects odd tags', () => {
  assert.strictEqual(policy.releaseVersion({ tag_name: 'v1.2.3' }), '1.2.3');
  assert.strictEqual(policy.releaseVersion({ tag_name: '0.7.1' }), '0.7.1');
  assert.strictEqual(policy.releaseVersion({ tag_name: '1.2' }), null);
  assert.strictEqual(policy.releaseVersion({ tag_name: '1.2.3/../x' }), null);
  assert.strictEqual(policy.releaseVersion(null), null);
});

test('asset names follow the publish workflow', () => {
  assert.strictEqual(policy.zipName('1.2.3'), 'Jellio-1.2.3-arm64.zip');
  assert.strictEqual(policy.checksumName('1.2.3'), 'Jellio-1.2.3-arm64.sha256');
});

test('findAsset matches the exact name only', () => {
  const release = { assets: [{ name: 'Jellio-1.2.2-arm64.zip' }, { name: 'Jellio-1.2.3-arm64.zip.old' }, { name: 'Jellio-1.2.3-arm64.zip' }] };
  assert.strictEqual(policy.findAsset(release, 'Jellio-1.2.3-arm64.zip'), release.assets[2]);
  assert.strictEqual(policy.findAsset(release, 'Jellio-9.9.9-arm64.zip'), null);
  assert.strictEqual(policy.findAsset({}, 'x'), null);
});

test('parseChecksum reads the line for the named file', () => {
  const text = 'b'.repeat(64) + '  Jellio-1.2.3-arm64.dmg\n' + HASH.toUpperCase() + '  Jellio-1.2.3-arm64.zip\n';
  assert.strictEqual(policy.parseChecksum(text, 'Jellio-1.2.3-arm64.zip'), HASH);
  assert.strictEqual(policy.parseChecksum(HASH + ' *Jellio-1.2.3-arm64.zip', 'Jellio-1.2.3-arm64.zip'), HASH);
});

test('parseChecksum rejects partial and malformed entries', () => {
  assert.strictEqual(policy.parseChecksum(HASH + '  evil-Jellio-1.2.3-arm64.zip', 'Jellio-1.2.3-arm64.zip'), null);
  assert.strictEqual(policy.parseChecksum('abc  Jellio-1.2.3-arm64.zip', 'Jellio-1.2.3-arm64.zip'), null);
  assert.strictEqual(policy.parseChecksum('', 'Jellio-1.2.3-arm64.zip'), null);
});

test('isAllowedDownloadUrl accepts GitHub release hosts over https only', () => {
  assert.ok(policy.isAllowedDownloadUrl('https://github.com/NoahSKipp/Jellio-macOS/releases/download/v1.2.3/a.zip'));
  assert.ok(policy.isAllowedDownloadUrl('https://objects.githubusercontent.com/x'));
  assert.ok(policy.isAllowedDownloadUrl('https://release-assets.githubusercontent.com/x?sig=1'));
  assert.ok(!policy.isAllowedDownloadUrl('http://github.com/x'));
  assert.ok(!policy.isAllowedDownloadUrl('https://github.com.evil.example/x'));
  assert.ok(!policy.isAllowedDownloadUrl('https://evil.example/github.com'));
  assert.ok(!policy.isAllowedDownloadUrl('https://user@github.com/x'));
  assert.ok(!policy.isAllowedDownloadUrl('https://github.com:8443/x'));
  assert.ok(!policy.isAllowedDownloadUrl('not a url'));
  assert.ok(!policy.isAllowedDownloadUrl(undefined));
});

test('isReleaseAssetUrl pins the repository, tag and asset name', () => {
  const name = 'Jellio-1.2.3-arm64.zip';
  const good = 'https://github.com/NoahSKipp/Jellio-macOS/releases/download/v1.2.3/' + name;
  assert.ok(policy.isReleaseAssetUrl(good, 'v1.2.3', name));
  assert.ok(!policy.isReleaseAssetUrl(good, '1.2.3', name));
  assert.ok(!policy.isReleaseAssetUrl(good, 'v1.2.3', 'Jellio-1.2.4-arm64.zip'));
  assert.ok(!policy.isReleaseAssetUrl(good.replace('NoahSKipp/Jellio-macOS', 'someone/Jellio-macOS'), 'v1.2.3', name));
  assert.ok(!policy.isReleaseAssetUrl(good + '?x=1', 'v1.2.3', name));
  assert.ok(!policy.isReleaseAssetUrl(good.replace('https:', 'http:'), 'v1.2.3', name));
  assert.ok(!policy.isReleaseAssetUrl('https://objects.githubusercontent.com/' + name, 'v1.2.3', name));
});
