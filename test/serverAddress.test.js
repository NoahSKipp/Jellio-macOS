const test = require('node:test');
const assert = require('node:assert');
const server = require('../src/lib/serverAddress');

const netError = (code) => new Error('net::' + code);

test('candidates tries https first only when no scheme was typed', () => {
  assert.deepStrictEqual(server.candidates('jellyfin.local:8096'), ['https://jellyfin.local:8096', 'http://jellyfin.local:8096']);
  assert.deepStrictEqual(server.candidates('http://jellyfin.local:8096'), ['http://jellyfin.local:8096']);
  assert.deepStrictEqual(server.candidates('https://jellyfin.example.com'), ['https://jellyfin.example.com']);
});

test('normalise trims trailing slashes and the /web path', () => {
  assert.strictEqual(server.normalise('https://host/'), 'https://host');
  assert.strictEqual(server.normalise('https://host/jellyfin/web/index.html'), 'https://host/jellyfin');
  assert.throws(() => server.normalise('ftp://host'), /http or https/);
});

test('certificate errors never fall back to http', () => {
  for (const code of ['ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_CERT_COMMON_NAME_INVALID', 'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN']) {
    assert.ok(server.isCertificateError(netError(code)), code);
    assert.ok(!server.allowsHttpFallback(netError(code)), code);
  }
});

test('connection-level failures may fall back to http', () => {
  for (const code of ['ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_TIMED_OUT', 'ERR_SSL_PROTOCOL_ERROR', 'ERR_EMPTY_RESPONSE']) {
    assert.ok(server.allowsHttpFallback(netError(code)), code);
  }
  const timeout = new Error('aborted');
  timeout.name = 'AbortError';
  assert.ok(server.allowsHttpFallback(timeout));
});

test('answers and lookups do not fall back to http', () => {
  assert.ok(!server.allowsHttpFallback(netError('ERR_NAME_NOT_RESOLVED')));
  assert.ok(!server.allowsHttpFallback(new Error('The server answered 404.')));
  assert.ok(!server.allowsHttpFallback(new Error('That address is not a Jellyfin server.')));
  assert.ok(!server.allowsHttpFallback(null));
});

test('describeError explains certificate problems', () => {
  assert.match(server.describeError(netError('ERR_CERT_AUTHORITY_INVALID')), /certificate/);
  assert.match(server.describeError(netError('ERR_NAME_NOT_RESOLVED')), /find that server/);
  assert.strictEqual(server.describeError(new Error('The server answered 500.')), 'The server answered 500.');
  assert.doesNotMatch(server.describeError(netError('ERR_FOO')), /net::/);
});

test('describeLoadFailure never shows raw net error text', () => {
  assert.match(server.describeLoadFailure(-105), /find the server/);
  assert.match(server.describeLoadFailure(-118), /too long/);
  assert.match(server.describeLoadFailure(-202), /certificate/);
  assert.match(server.describeLoadFailure(-107), /http:\/\//);
  assert.strictEqual(server.describeLoadFailure(-999), 'Couldn’t reach the server.');
});
