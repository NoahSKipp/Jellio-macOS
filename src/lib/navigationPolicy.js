const { pathToFileURL } = require('url');

function parse(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodedPath(url) {
  // An encoded separator would decode into a different directory.
  if (/%(2f|5c|00)/i.test(url.pathname)) return null;
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

// Only files inside the packaged pages directory get the app-page bridge.
function isAppPage(value, pagesDir) {
  const url = parse(value);
  if (!url || url.protocol !== 'file:' || url.host) return false;
  const actual = decodedPath(url);
  const base = decodedPath(pathToFileURL(pagesDir + '/'));
  return Boolean(actual && base && actual.startsWith(base) && actual.length > base.length);
}

function isServerUrl(value, serverOrigin) {
  const url = parse(value);
  return Boolean(serverOrigin && url && /^https?:$/.test(url.protocol) && url.origin === serverOrigin);
}

module.exports = { isAppPage, isServerUrl };
