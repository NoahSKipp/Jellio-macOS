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

// 'allow' stays in the window, 'external' belongs in the browser.
function navigationAction(value, serverOrigin, pagesDir) {
  if (isServerUrl(value, serverOrigin) || isAppPage(value, pagesDir)) return 'allow';
  const url = parse(value);
  return url && /^https?:$/.test(url.protocol) ? 'external' : 'deny';
}

// Embeds such as the trailer player, never local files or app schemes.
const SUBFRAME_SCHEMES = new Set(['http:', 'https:', 'about:', 'blob:', 'data:']);

function subframeAllowed(value) {
  const url = parse(value);
  return Boolean(url && SUBFRAME_SCHEMES.has(url.protocol));
}

// Popups never open in the app, so they never get the preload.
function popupOpensExternally(value) {
  const url = parse(value);
  return Boolean(url && /^(https?|mailto):$/.test(url.protocol));
}

module.exports = { isAppPage, isServerUrl, navigationAction, popupOpensExternally, subframeAllowed };
