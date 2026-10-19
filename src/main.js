const path = require('path');
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  net,
  powerSaveBlocker,
  screen,
  shell,
} = require('electron');
const config = require('./config');
const updates = require('./updates');
const { isBigRelease, MACOS_CHANGELOG_RELEASES } = require('./changelogData');

const HOME_ROUTES = {
  home: '#/home',
  search: '#/search',
  downloads: '#/downloads',
  settings: '#/account',
};

let win = null;
let whatsNewWin = null;

function showWhatsNewWindow() {
  if (whatsNewWin && !whatsNewWin.isDestroyed()) {
    whatsNewWin.show();
    whatsNewWin.focus();
    return;
  }
  whatsNewWin = new BrowserWindow({
    width: 580,
    height: 640,
    minWidth: 480,
    minHeight: 500,
    title: "What's New in Jellio",
    parent: win && !win.isDestroyed() ? win : null,
    show: false,
    backgroundColor: '#141414',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  whatsNewWin.loadFile(path.join(__dirname, 'pages', 'whatsnew.html'));
  whatsNewWin.once('ready-to-show', () => {
    whatsNewWin.show();
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
let quitting = false;
let quitConfirmed = false;
let activeDownloads = 0;
let blockerId = null;
let playbackBlockerId = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

nativeTheme.themeSource = 'dark';

// Hardware video decoding and Apple Silicon acceleration flags.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,VaapiVideoDecoder,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
if (process.platform === 'darwin' && process.arch === 'arm64') {
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
}

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
  try {
    return new URL(url).origin === serverOrigin();
  } catch {
    return false;
  }
}

function isAppPage(url) {
  return url.startsWith('file://');
}

function loadSetup() {
  win.loadFile(path.join(__dirname, 'pages', 'setup.html'), {
    query: { server: serverUrl() || '' },
  });
}

function loadServer() {
  const server = serverUrl();
  if (!server) return loadSetup();
  win.loadURL(server + '/web/');
}

function loadOffline(reason) {
  win.loadFile(path.join(__dirname, 'pages', 'offline.html'), {
    query: { server: serverUrl() || '', reason: reason || '' },
  });
}

function go(route) {
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

function savedBounds() {
  const bounds = config.get('bounds');
  if (!bounds) return { width: 1440, height: 900 };
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    );
  });
  return visible ? bounds : { width: bounds.width, height: bounds.height };
}

function createWindow() {
  win = new BrowserWindow({
    ...savedBounds(),
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'Jellio',
    backgroundColor: '#141414',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: true,
    },
  });
  if (config.get('maximized')) win.maximize();
  // Shown right away like a browser tab, not after the server's first paint.
  win.show();

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      config.set('maximized', win.isMaximized());
      if (!win.isMaximized() && !win.isFullScreen()) config.set('bounds', win.getBounds());
    }, 500);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // Closing the window keeps Jellio running (and downloading) in the Dock.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide());
      win.setFullScreen(false);
    } else {
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });

  win.on('swipe', (_event, direction) => {
    if (direction === 'left' && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
    if (direction === 'right' && win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
  });

  const contents = win.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    if (isServerUrl(url)) return { action: 'allow' };
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isServerUrl(url) || isAppPage(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  // Jellio's service worker answers for the server while it's down, so
  // this only happens before it has ever been cached on this Mac.
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isServerUrl(url)) return;
    loadOffline(description);
  });

  contents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    console.warn('Jellio: page crashed', details.reason);
    setTimeout(() => win && loadServer(), 1000);
  });

  contents.on('context-menu', (_event, params) => {
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
  });

  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed = ['notifications', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'media', 'mediaKeySystem', 'persistent-storage'];
    callback(isServerUrl(details.requestingUrl || webContents.getURL()) && allowed.includes(permission));
  });

  const ua = contents.getUserAgent();
  if (!ua.includes('jellio-macOS')) contents.setUserAgent(ua + ' jellio-macOS/' + app.getVersion());

  loadServer();
}

function setActiveDownloads(count) {
  const previous = activeDownloads;
  activeDownloads = count;
  if (app.dock) app.dock.setBadge(count ? String(count) : '');
  // Throttled like any hidden tab unless a download needs the page running.
  if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(count === 0);
  if (count && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!count && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  if (previous > 0 && count === 0) {
    if (app.dock) app.dock.bounce('informational');
    if (Notification.isSupported() && (!win || !win.isFocused())) {
      new Notification({ title: 'Jellio', body: 'All downloads have finished.' }).show();
    }
  }
}

function setPlaybackActiveState(active) {
  if (active && playbackBlockerId === null) {
    playbackBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!active && playbackBlockerId !== null) {
    if (powerSaveBlocker.isStarted(playbackBlockerId)) {
      powerSaveBlocker.stop(playbackBlockerId);
    }
    playbackBlockerId = null;
  }
}

function withScheme(input) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? [input] : ['https://' + input, 'http://' + input];
}

function normalise(candidate) {
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use an http or https address.');
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/web(\/.*)?$/i, '');
  return url.origin + pathname;
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
  for (const candidate of withScheme(text)) {
    let base;
    try {
      base = normalise(candidate);
    } catch (err) {
      lastError = err;
      continue;
    }
    try {
      const info = await probe(base);
      config.set('serverUrl', base);
      loadServer();
      return { ok: true, name: info.ServerName || '' };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: describeError(lastError) };
}

function describeError(err) {
  const message = String((err && err.message) || '');
  if (err && err.name === 'AbortError') return 'The server took too long to answer.';
  if (/ERR_NAME_NOT_RESOLVED/.test(message)) return 'Couldn’t find that server. Check the address.';
  if (/ERR_CONNECTION_REFUSED/.test(message)) return 'The server refused the connection. Check the address and port.';
  if (/ERR_CERT|ERR_SSL/.test(message)) return 'The server’s certificate isn’t trusted.';
  if (!message || /net::ERR_/.test(message)) return 'Couldn’t reach that server.';
  return message;
}

function fromAppPage(event) {
  return win && event.sender === win.webContents && isAppPage(event.senderFrame.url);
}

ipcMain.handle('jellio:connect', (event, input) => {
  if (!fromAppPage(event)) return { ok: false, error: 'Not allowed.' };
  return connect(input);
});

ipcMain.on('jellio:retry', (event) => {
  if (fromAppPage(event)) loadServer();
});

ipcMain.on('jellio:change-server', (event) => {
  if (fromAppPage(event)) loadSetup();
});

ipcMain.handle('jellio:get-changelogs', () => MACOS_CHANGELOG_RELEASES);
ipcMain.on('jellio:dismiss-whatsnew', () => {
  config.set('lastSeenChangelogVersion', app.getVersion());
  if (whatsNewWin && !whatsNewWin.isDestroyed()) {
    whatsNewWin.close();
  }
});

function fromServerPage(event) {
  return win && event.sender === win.webContents && isServerUrl(event.senderFrame.url);
}

// Jellio's Settings > About (the plugin) shows and drives updates.
ipcMain.handle('jellio:update-state', (event) => (fromServerPage(event) ? updates.getState() : null));
ipcMain.handle('jellio:update-check', (event) => (fromServerPage(event) ? updates.checkForUpdates(win, 'settings') : null));
ipcMain.handle('jellio:update-automatic', (event, on) => (fromServerPage(event) ? updates.setAutomatic(on) : null));
ipcMain.handle('jellio:update-install', (event) => {
  if (fromServerPage(event)) updates.installUpdate(win);
  return null;
});

updates.onChange((snapshot) => {
  if (win && !win.isDestroyed() && isServerUrl(win.webContents.getURL())) win.webContents.send('jellio:update-state', snapshot);
});

ipcMain.on('jellio:downloads', (event, count) => {
  if (!win || event.sender !== win.webContents || !isServerUrl(event.senderFrame.url)) return;
  setActiveDownloads(Math.max(0, parseInt(count, 10) || 0));
});

ipcMain.on('jellio:playback-state', (event, active) => {
  if (!win || event.sender !== win.webContents || !isServerUrl(event.senderFrame.url)) return;
  setPlaybackActiveState(!!active);
});

function sendMediaAction(action) {
  if (!win || win.isDestroyed()) return;
  win.webContents
    .executeJavaScript(
      '((action) => {' +
        '  const ev = new KeyboardEvent("keydown", { key: action, bubbles: true, cancelable: true });' +
        '  document.dispatchEvent(ev);' +
        '})(' +
        JSON.stringify(action) +
        ')'
    )
    .catch(() => {});
}

function registerMediaShortcuts() {
  try {
    globalShortcut.register('MediaPlayPause', () => sendMediaAction('MediaPlayPause'));
    globalShortcut.register('MediaNextTrack', () => sendMediaAction('MediaNextTrack'));
    globalShortcut.register('MediaPreviousTrack', () => sendMediaAction('MediaPreviousTrack'));
  } catch (err) {
    console.warn('Jellio: could not register global media shortcuts', err);
  }
}

function buildMenu() {
  const history = () => win && win.webContents.navigationHistory;
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: "What's New in Jellio…", click: () => showWhatsNewWindow() },
        { label: 'Check for Updates…', click: () => updates.checkForUpdates(win, 'menu') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => go('settings') },
        { label: 'Change Server…', click: () => win && (win.show(), loadSetup()) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Cmd+[',
          click: () => history() && history().canGoBack() && history().goBack(),
        },
        {
          label: 'Forward',
          accelerator: 'Cmd+]',
          click: () => history() && history().canGoForward() && history().goForward(),
        },
        { type: 'separator' },
        { label: 'Home', accelerator: 'Cmd+Shift+H', click: () => go('home') },
        { label: 'Search', accelerator: 'Cmd+F', click: () => go('search') },
        { label: 'Downloads', accelerator: 'Cmd+Shift+D', click: () => go('downloads') },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: "What's New in Jellio…", click: () => showWhatsNewWindow() },
        { label: 'Jellio on GitHub', click: () => shell.openExternal('https://github.com/NoahSKipp/Jellio-macOS') },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/NoahSKipp/Jellio-macOS/issues'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildDockMenu() {
  if (!app.dock) return;
  const template = [
    { label: 'Home', click: () => go('home') },
    { label: 'Search', click: () => go('search') },
    { label: 'Downloads', click: () => go('downloads') },
    { type: 'separator' },
    { label: 'Settings…', click: () => go('settings') },
  ];
  app.dock.setMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('activate', () => {
  if (win) win.show();
  else createWindow();
});

app.on('before-quit', (event) => {
  if (activeDownloads && !quitConfirmed) {
    event.preventDefault();
    if (win) win.show();
    dialog
      .showMessageBox(win, {
        type: 'warning',
        message: activeDownloads === 1 ? 'A download is still running' : activeDownloads + ' downloads are still running',
        detail: 'If you quit now, they pick up again the next time you open Jellio.',
        buttons: ['Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response !== 0) return;
        quitConfirmed = true;
        app.quit();
      });
    return;
  }
  quitting = true;
});

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: 'Jellio',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © Noah S. Kipp. GPL-3.0.',
    website: 'https://github.com/NoahSKipp/Jellio-macOS',
  });
  buildMenu();
  buildDockMenu();
  createWindow();
  registerMediaShortcuts();
  if (shouldShowWhatsNewOnStartup()) {
    showWhatsNewWindow();
  }
  if (app.isPackaged) updates.startAutomaticChecks(() => win);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  setPlaybackActiveState(false);
});
