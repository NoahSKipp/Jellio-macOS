function candidates(input) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? [input] : ['https://' + input, 'http://' + input];
}

function normalise(candidate) {
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use an http or https address.');
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/web(\/.*)?$/i, '');
  return url.origin + pathname;
}

function message(err) {
  return String((err && err.message) || '');
}

function isCertificateError(err) {
  return /ERR_CERT_|ERR_CERTIFICATE_|ERR_SSL_PINNED_KEY|ERR_BAD_SSL_CLIENT_AUTH_CERT/.test(message(err));
}

// Plain http is only worth a try when https never got a server to talk
// to (nothing listening, or something that doesn't speak TLS on that port).
const NO_HTTPS =
  /net::ERR_(CONNECTION_(REFUSED|RESET|CLOSED|FAILED|TIMED_OUT)|ADDRESS_UNREACHABLE|TIMED_OUT|EMPTY_RESPONSE|SSL_PROTOCOL_ERROR|SSL_VERSION_OR_CIPHER_MISMATCH)\b/;

function allowsHttpFallback(err) {
  if (isCertificateError(err)) return false;
  if (err && err.name === 'AbortError') return true;
  return NO_HTTPS.test(message(err));
}

const CERTIFICATE_MESSAGE =
  'The server’s certificate isn’t trusted, so Jellio didn’t connect. Fix the certificate, or enter the address with http:// to connect without encryption.';

function describeError(err) {
  const text = message(err);
  if (err && err.name === 'AbortError') return 'The server took too long to answer.';
  if (isCertificateError(err)) return CERTIFICATE_MESSAGE;
  if (/ERR_NAME_NOT_RESOLVED/.test(text)) return 'Couldn’t find that server. Check the address.';
  if (/ERR_CONNECTION_REFUSED/.test(text)) return 'The server refused the connection. Check the address and port.';
  if (/ERR_SSL/.test(text)) return 'Couldn’t set up a secure connection to the server.';
  if (!text || /net::ERR_/.test(text)) return 'Couldn’t reach that server.';
  return text;
}

const LOAD_FAILURES = {
  '-7': 'The server took too long to answer.',
  '-21': 'The network changed while connecting. Try again.',
  '-100': 'The connection to the server was interrupted.',
  '-101': 'The connection to the server was interrupted.',
  '-102': 'The server refused the connection.',
  '-105': 'Couldn’t find the server. Check the address and your network.',
  '-106': 'This Mac isn’t connected to the internet.',
  '-107': 'The server didn’t answer with a secure connection. If it only uses http, change the server to its http:// address.',
  '-109': 'The server can’t be reached from this network.',
  '-113': 'The server didn’t answer with a secure connection. If it only uses http, change the server to its http:// address.',
  '-118': 'The server took too long to answer.',
  '-324': 'The server closed the connection without answering.',
};

// Chromium's net error codes (did-fail-load), as something to show a person.
function describeLoadFailure(code) {
  const known = LOAD_FAILURES[String(code)];
  if (known) return known;
  if (code <= -200 && code > -300) return 'The server’s certificate isn’t trusted.';
  return 'Couldn’t reach the server.';
}

module.exports = {
  allowsHttpFallback,
  candidates,
  describeError,
  describeLoadFailure,
  isCertificateError,
  normalise,
};
