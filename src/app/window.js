const path = require('path');
const { app, BrowserWindow, Menu, screen, shell } = require('electron');
const config = require('../config');
const { isBigRelease } = require('../changelogData');
const { MIN, isOnScreen, sanitizeBounds } = require('../lib/bounds');
const { describeLoadFailure } = require('../lib/serverAddress');
const { PAGES_DIR, denyPopups, guardNavigation, guardPermissions, isServerUrl } = require('./navigation');
const { setActiveDownloads, updateProgressBar } = require('./downloads');
const { setPlaybackActiveState } = require('./media');
const { clearLoadTimer, loadOffline, loadServer, preconnectServer } = require('./server');
const { state, changed } = require('./state');

const PRELOAD = path.join(__dirname, '..', 'preload.js');

let crashTimes = [];

function showWhatsNewWindow() {
  const existing = state.whatsNewWin;
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const whatsNewWin = new BrowserWindow({
    width: 580,
    height: 640,
    minWidth: 480,
    minHeight: 500,
    title: "What's New in Jellio",
    parent: state.win && !state.win.isDestroyed() ? state.win : null,
    show: false,
    backgroundColor: '#141414',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  state.whatsNewWin = whatsNewWin;
  denyPopups(whatsNewWin.webContents);
  whatsNewWin.webContents.on('will-navigate', (event) => event.preventDefault());
  whatsNewWin.loadFile(path.join(PAGES_DIR, 'whatsnew.html'));
  whatsNewWin.once('ready-to-show', () => {
    if (!whatsNewWin.isDestroyed()) whatsNewWin.show();
  });
  whatsNewWin.on('close', () => {
    config.set('lastSeenChangelogVersion', app.getVersion());
  });
  whatsNewWin.on('closed', () => {
    if (state.whatsNewWin === whatsNewWin) state.whatsNewWin = null;
  });
}

function shouldShowWhatsNewOnStartup() {
  const version = app.getVersion();
  if (!isBigRelease(version)) return false;
  const lastSeen = config.get('lastSeenChangelogVersion');
  if (lastSeen && lastSeen !== version) {
    config.set('lastSeenChangelogVersion', null);
    return true;
  }
  return !lastSeen;
}

function savedBounds() {
  const bounds = sanitizeBounds(config.get('bounds'));
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  return isOnScreen(bounds, areas) ? bounds : { width: bounds.width, height: bounds.height };
}

function toggleWindowVisibility() {
  const win = state.win;
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  changed();
}

function showContextMenu(win, contents, params) {
  const items = [];
  if (params.isEditable) {
    params.dictionarySuggestions.forEach((word) =>
      items.push({ label: word, click: () => contents.replaceMisspelling(word) }),
    );
    if (params.dictionarySuggestions.length) items.push({ type: 'separator' });
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
  } else if (params.selectionText) {
    items.push({ role: 'copy' });
  }
  if (params.linkURL && /^https?:/i.test(params.linkURL)) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Copy Link', click: () => require('electron').clipboard.writeText(params.linkURL) });
    if (!isServerUrl(params.linkURL)) {
      items.push({ label: 'Open Link in Browser', click: () => shell.openExternal(params.linkURL) });
    }
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
}

function createWindow() {
  const win = new BrowserWindow({
    ...savedBounds(),
    minWidth: MIN.width,
    minHeight: MIN.height,
    show: false,
    title: 'Jellio',
    backgroundColor: '#141414',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: true,
    },
  });
  state.win = win;
  if (config.get('maximized')) win.maximize();
  // Shown right away like a browser tab, not after the server's first paint.
  win.show();

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      config.set('maximized', win.isMaximized());
      if (!win.isMaximized() && !win.isFullScreen()) config.set('bounds', win.getBounds());
    }, 500);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('show', changed);
  win.on('hide', changed);
  win.on('focus', () => {
    preconnectServer();
    changed();
  });
  win.on('blur', changed);

  // Closing the window keeps Jellio running (and downloading) in the Dock.
  win.on('close', (event) => {
    if (state.quitting) return;
    event.preventDefault();
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide());
      win.setFullScreen(false);
    } else {
      win.hide();
    }
  });
  win.on('closed', () => {
    if (state.win === win) state.win = null;
    changed();
  });

  win.on('swipe', (_event, direction) => {
    if (direction === 'left' && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
    if (direction === 'right' && win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
  });

  const contents = win.webContents;

  contents.on('did-finish-load', () => {
    if (state.pendingRoute && isServerUrl(contents.getURL())) {
      contents.send('jellio:navigate', state.pendingRoute);
      state.pendingRoute = null;
    }
  });

  guardNavigation(contents, (target) =>
    loadOffline('The server sent Jellio to ' + target + '. If that is your server’s address, change the server to it.'),
  );

  // Jellio's service worker answers for the server while it's down, so
  // this only happens before it has ever been cached on this Mac.
  contents.on('did-navigate', () => clearLoadTimer());
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame && isServerUrl(url) && /#\/play\b/.test(url)) preconnectServer();
  });
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isServerUrl(url)) return;
    loadOffline(describeLoadFailure(code));
  });

  contents.on('render-process-gone', (_event, details) => {
    setPlaybackActiveState(false);
    setActiveDownloads(0);
    if (details.reason === 'clean-exit') return;
    console.warn('Jellio: page crashed', details.reason);
    const now = Date.now();
    crashTimes = crashTimes.filter((time) => now - time < 2 * 60 * 1000).concat(now);
    if (crashTimes.length > 3) {
      setTimeout(() => !win.isDestroyed() && loadOffline('Jellio’s page kept crashing, so it stopped reloading it.'), 1000);
      return;
    }
    setTimeout(() => !win.isDestroyed() && loadServer(), 1000);
  });

  contents.on('context-menu', (_event, params) => showContextMenu(win, contents, params));

  guardPermissions(contents.session);

  const ua = contents.getUserAgent();
  if (!ua.includes('jellio-macOS')) contents.setUserAgent(ua + ' jellio-macOS/' + app.getVersion());

  loadServer();
  updateProgressBar();
  changed();
}

module.exports = { createWindow, shouldShowWhatsNewOnStartup, showWhatsNewWindow, toggleWindowVisibility };
