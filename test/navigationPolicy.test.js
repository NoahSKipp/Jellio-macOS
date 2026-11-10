const test = require('node:test');
const assert = require('node:assert');
const { pathToFileURL } = require('url');
const policy = require('../src/lib/navigationPolicy');

const PAGES = '/Applications/Jellio.app/Contents/Resources/app.asar/src/pages';
const page = (name) => pathToFileURL(PAGES).href + '/' + name;

test('isAppPage accepts files inside the packaged pages directory', () => {
  assert.ok(policy.isAppPage(page('setup.html'), PAGES));
  assert.ok(policy.isAppPage(page('offline.html') + '?server=x&reason=y', PAGES));
  assert.ok(policy.isAppPage(page('whatsnew.html') + '#top', PAGES));
});

test('isAppPage handles directories with spaces', () => {
  const dir = '/Users/me/My Apps/Jellio.app/Contents/Resources/app.asar/src/pages';
  assert.ok(policy.isAppPage(pathToFileURL(dir + '/setup.html').href, dir));
  assert.ok(!policy.isAppPage('file:///Users/me/My Apps/other.html', dir));
});

test('isAppPage rejects other local files', () => {
  assert.ok(!policy.isAppPage('file:///tmp/evil.html', PAGES));
  assert.ok(!policy.isAppPage('file:///Users/me/Downloads/setup.html', PAGES));
  assert.ok(!policy.isAppPage(pathToFileURL(PAGES).href, PAGES));
  assert.ok(!policy.isAppPage(pathToFileURL(PAGES + '/').href, PAGES));
  assert.ok(!policy.isAppPage(pathToFileURL(PAGES + '-evil/setup.html').href, PAGES));
});

test('isAppPage rejects traversal out of the pages directory', () => {
  assert.ok(!policy.isAppPage(page('../../../../../../tmp/evil.html'), PAGES));
  assert.ok(!policy.isAppPage(page('%2e%2e/%2e%2e/evil.html'), PAGES));
  assert.ok(!policy.isAppPage(page('..%2f..%2fevil.html'), PAGES));
  assert.ok(!policy.isAppPage(page('x%5c..%5cevil.html'), PAGES));
  assert.ok(!policy.isAppPage(page('bad%ZZ.html'), PAGES));
});

test('isAppPage rejects non-file and remote file URLs', () => {
  assert.ok(!policy.isAppPage('https://example.com' + PAGES + '/setup.html', PAGES));
  assert.ok(!policy.isAppPage('file://server.local' + PAGES + '/setup.html', PAGES));
  assert.ok(!policy.isAppPage('not a url', PAGES));
});

test('isServerUrl compares origins exactly', () => {
  const origin = 'https://jellyfin.example.com';
  assert.ok(policy.isServerUrl('https://jellyfin.example.com/web/#/home', origin));
  assert.ok(!policy.isServerUrl('http://jellyfin.example.com/web/', origin));
  assert.ok(!policy.isServerUrl('https://jellyfin.example.com:8920/web/', origin));
  assert.ok(!policy.isServerUrl('https://jellyfin.example.com.evil.example/web/', origin));
  assert.ok(!policy.isServerUrl('file:///tmp/x.html', 'null'));
  assert.ok(!policy.isServerUrl('https://jellyfin.example.com/', null));
});
