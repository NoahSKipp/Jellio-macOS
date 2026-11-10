const path = require('path');
const { shell } = require('electron');
const config = require('../config');
const navigationPolicy = require('../lib/navigationPolicy');
const { state } = require('./state');

const PAGES_DIR = path.join(__dirname, '..', 'pages');
const SERVER_PERMISSIONS = [
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
  'clipboard-read',
  'media',
  'mediaKeySystem',
  'persistent-storage',
];

function serverUrl() {
  return config.get('serverUrl') || null;
}

function serverOrigin() {
  const server = serverUrl();
  try {
    return server ? new URL(server).origin : null;
  } catch {
    return null;
  }
}

function isServerUrl(url) {
  return navigationPolicy.isServerUrl(url, serverOrigin());
}

function isAppPage(url) {
  return navigationPolicy.isAppPage(url, PAGES_DIR);
}

// senderFrame is null once the frame is gone, and reading a disposed
// frame's url throws.
function mainFrameUrl(event) {
  try {
    const frame = event.senderFrame;
    return frame && !frame.parent ? frame.url : null;
  } catch {
    return null;
  }
}

function fromAppFrame(event) {
  const url = mainFrameUrl(event);
  return Boolean(url && isAppPage(url));
}

function fromAppPage(event) {
  return Boolean(state.win && event.sender === state.win.webContents && fromAppFrame(event));
}

function fromServerPage(event) {
  const win = state.win;
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
  const url = mainFrameUrl(event);
  return Boolean(url && isServerUrl(url));
}

function denyPopups(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (navigationPolicy.popupOpensExternally(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function guardNavigation(contents, onOffSiteRedirect) {
  denyPopups(contents);

  // Set while a sign-in page the server redirected to is open; cleared once
  // the server or an app page is back.
  let signingIn = false;
  contents.on('did-navigate', (_event, url) => {
    if (navigationPolicy.navigationAction(url, serverOrigin(), PAGES_DIR) === 'allow') signingIn = false;
  });

  contents.on('will-navigate', (event) => {
    const action = navigationPolicy.navigationAction(event.url, serverOrigin(), PAGES_DIR, signingIn);
    if (action === 'allow') return;
    event.preventDefault();
    if (action === 'external') shell.openExternal(event.url);
  });

  // The main frame is will-navigate's job; this covers iframes.
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    if (!navigationPolicy.subframeAllowed(event.url)) event.preventDefault();
  });

  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame) {
      if (!navigationPolicy.subframeAllowed(event.url)) event.preventDefault();
      return;
    }
    const action = navigationPolicy.redirectAction(event.url, serverOrigin(), PAGES_DIR);
    if (action === 'allow') return;
    if (action === 'sign-in') {
      signingIn = true;
      return;
    }
    event.preventDefault();
    let target = event.url;
    try {
      target = new URL(event.url).origin;
    } catch {}
    setImmediate(() => onOffSiteRedirect(target));
  });
}

function guardPermissions(session) {
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isServerUrl(details.requestingUrl || webContents.getURL()) && SERVER_PERMISSIONS.includes(permission));
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isServerUrl(requestingOrigin) && SERVER_PERMISSIONS.includes(permission);
  });
}

module.exports = {
  PAGES_DIR,
  denyPopups,
  fromAppFrame,
  fromAppPage,
  fromServerPage,
  guardNavigation,
  guardPermissions,
  isServerUrl,
  serverUrl,
};
