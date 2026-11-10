const path = require('path');
const { net, session } = require('electron');
const config = require('../config');
const serverAddress = require('../lib/serverAddress');
const { PAGES_DIR, isServerUrl, serverUrl } = require('./navigation');
const { setActiveDownloads } = require('./downloads');
const { setPlaybackActiveState } = require('./media');
const { state } = require('./state');

const HOME_ROUTES = {
  home: '#/home',
  search: '#/search',
  downloads: '#/downloads',
  settings: '#/account',
};

const LOAD_TIMEOUT_MS = 20000;
let loadTimer = null;
let lastPreconnect = 0;

// Warm sockets to the server before the next request needs them.
function preconnectServer() {
  const server = serverUrl();
  if (!server || Date.now() - lastPreconnect < 10000) return;
  lastPreconnect = Date.now();
  session.defaultSession.preconnect({ url: server, numSockets: 4 });
}

function preconnectAfterWake() {
  lastPreconnect = 0;
  preconnectServer();
}

function clearLoadTimer() {
  clearTimeout(loadTimer);
  loadTimer = null;
}

function loadSetup() {
  clearLoadTimer();
  setPlaybackActiveState(false);
  setActiveDownloads(0);
  state.win.loadFile(path.join(PAGES_DIR, 'setup.html'), {
    query: { server: serverUrl() || '' },
  });
}

function loadServer() {
  const server = serverUrl();
  if (!server) return loadSetup();
  // A blackholed host never fails on its own; give up and say so.
  clearLoadTimer();
  loadTimer = setTimeout(() => {
    loadTimer = null;
    const win = state.win;
    if (!win || win.isDestroyed()) return;
    win.webContents.stop();
    loadOffline(serverAddress.describeLoadFailure(-118));
  }, LOAD_TIMEOUT_MS);
  state.win.loadURL(server + '/web/').catch(() => {});
}

function loadOffline(reason) {
  clearLoadTimer();
  setPlaybackActiveState(false);
  setActiveDownloads(0);
  state.win.loadFile(path.join(PAGES_DIR, 'offline.html'), {
    query: { server: serverUrl() || '', reason: reason || '' },
  });
}

function go(route) {
  const win = state.win;
  if (!win) return;
  win.show();
  if (!isServerUrl(win.webContents.getURL())) {
    loadServer();
    return;
  }
  const hash = HOME_ROUTES[route];
  win.webContents
    .executeJavaScript(
      '((window.Emby && window.Emby.Page && typeof window.Emby.Page.show === "function") ' +
        '? window.Emby.Page.show(' +
        JSON.stringify(hash) +
        ') ' +
        ': (location.hash = ' +
        JSON.stringify(hash) +
        '));',
    )
    .catch(() => {});
}

async function probe(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await net.fetch(base + '/System/Info/Public', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('The server answered ' + response.status + '.');
    const info = await response.json();
    if (!info || !info.Id) throw new Error('That address is not a Jellyfin server.');
    return info;
  } finally {
    clearTimeout(timer);
  }
}

async function connect(input) {
  const text = String(input || '').trim();
  if (!text) return { ok: false, error: 'Enter your server’s address.' };
  let lastError = null;
  for (const candidate of serverAddress.candidates(text)) {
    let base;
    try {
      base = serverAddress.normalise(candidate);
    } catch (err) {
      lastError = err;
      break;
    }
    try {
      const info = await probe(base);
      config.set('serverUrl', base);
      loadServer();
      return { ok: true, name: info.ServerName || '' };
    } catch (err) {
      lastError = err;
      // Falling back after a bad certificate would hand the connection to
      // whoever presented it, unencrypted.
      if (!serverAddress.allowsHttpFallback(err)) break;
    }
  }
  return { ok: false, error: serverAddress.describeError(lastError) };
}

async function retry() {
  const server = serverUrl();
  if (!server) {
    loadSetup();
    return { ok: true };
  }
  try {
    await probe(server);
    loadServer();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: serverAddress.describeError(err) };
  }
}

module.exports = {
  clearLoadTimer,
  connect,
  go,
  loadOffline,
  loadServer,
  loadSetup,
  preconnectAfterWake,
  preconnectServer,
  retry,
};
