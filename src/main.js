const path = require('path');
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  powerSaveBlocker,
  screen,
  session,
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
let tray = null;
let currentMediaTitle = null;
let isPlaybackPlaying = false;
let currentDownloadProgress = -1;
let currentUpdaterProgress = -1;
let pendingRoute = null;

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
      sandbox: true,
      nodeIntegration: false,
    },
  });
  whatsNewWin.loadFile(path.join(__dirname, 'pages', 'whatsnew.html'));
  whatsNewWin.once('ready-to-show', () => {
    if (whatsNewWin && !whatsNewWin.isDestroyed()) {
      whatsNewWin.show();
    }
  });
  whatsNewWin.on('close', () => {
    config.set('lastSeenChangelogVersion', app.getVersion());
  });
  whatsNewWin.on('closed', () => {
    whatsNewWin = null;
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
  process.exit(0);
}

app.setAsDefaultProtocolClient('jellio');
app.setAsDefaultProtocolClient('jellyfin');

function parseDeepLink(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    if (parsed.hash) {
      return parsed.hash;
    }
    let route = '';
    if (parsed.host && parsed.host !== 'web') {
      route += '/' + parsed.host;
    }
    if (parsed.pathname && parsed.pathname !== '/') {
      route += parsed.pathname;
    }
    if (parsed.search) {
      route += parsed.search;
    }
    if (route) {
      if (!route.startsWith('#')) {
        route = '#' + (route.startsWith('/') ? route : '/' + route);
      }
      return route;
    }
    return '#/home';
  } catch {
    const stripped = urlStr.replace(/^[a-z]+:\/\//i, '');
    if (stripped.startsWith('#')) return stripped;
    return '#/' + stripped.replace(/^\/+/, '');
  }
}

function navigateRoute(route) {
  if (!route) return;
  if (!win || win.isDestroyed()) {
    pendingRoute = route;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  if (win.webContents.isLoading() || !isServerUrl(win.webContents.getURL())) {
    pendingRoute = route;
  } else {
    win.webContents.send('jellio:navigate', route);
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  const route = parseDeepLink(url);
  if (route) {
    navigateRoute(route);
  }
});

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
  setPlaybackActiveState(false);
  setActiveDownloads(0);
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
  setPlaybackActiveState(false);
  setActiveDownloads(0);
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

function updateProgressBar() {
  if (!win || win.isDestroyed()) return;

  let progress = -1;
  if (currentUpdaterProgress >= 0) {
    progress = currentUpdaterProgress;
  } else if (activeDownloads > 0) {
    progress = currentDownloadProgress >= 0 ? currentDownloadProgress : 0.0;
  }

  if (progress >= 0) {
    const clamped = Math.max(0.0, Math.min(1.0, progress));
    win.setProgressBar(clamped);
  } else {
    win.setProgressBar(-1);
  }
}

function toggleWindowVisibility() {
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
  updateTray();
}

function updateTray() {
  if (!tray) return;

  const isWinVisible = Boolean(win && !win.isDestroyed() && win.isVisible());
  const mediaLabel = isPlaybackPlaying && currentMediaTitle ? currentMediaTitle : 'Nothing Playing';
  const downloadSummary =
    activeDownloads === 1
      ? '1 download active'
      : activeDownloads > 1
        ? activeDownloads + ' downloads active'
        : 'No active downloads';

  if (activeDownloads > 0) {
    tray.setTitle(' ' + activeDownloads + '↓');
  } else {
    tray.setTitle('');
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: mediaLabel,
      enabled: false,
    },
    {
      label: isPlaybackPlaying ? 'Pause' : 'Play',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('jellio:playback-command', 'play-pause');
        }
      },
    },
    {
      label: 'Next',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('jellio:playback-command', 'next');
        }
      },
    },
    {
      label: 'Previous',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('jellio:playback-command', 'previous');
        }
      },
    },
    { type: 'separator' },
    {
      label: downloadSummary,
      click: () => go('downloads'),
    },
    { type: 'separator' },
    {
      label: isWinVisible ? 'Hide Jellio' : 'Show Jellio',
      click: () => toggleWindowVisibility(),
    },
    {
      label: 'Check for Updates…',
      click: () => updates.checkForUpdates(win, 'menu'),
    },
    {
      label: 'Quit Jellio',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('Jellio');
  updateTray();
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

  win.on('show', () => updateTray());
  win.on('hide', () => updateTray());
  win.on('focus', () => updateTray());
  win.on('blur', () => updateTray());

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
    updateTray();
  });

  win.on('swipe', (_event, direction) => {
    if (direction === 'left' && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
    if (direction === 'right' && win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
  });

  const contents = win.webContents;

  contents.on('did-finish-load', () => {
    if (pendingRoute && isServerUrl(contents.getURL())) {
      contents.send('jellio:navigate', pendingRoute);
      pendingRoute = null;
    }
  });

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
    setPlaybackActiveState(false);
    setActiveDownloads(0);
    if (details.reason === 'clean-exit') return;
    console.warn('Jellio: page crashed', details.reason);
    setTimeout(() => win && !win.isDestroyed() && loadServer(), 1000);
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
  updateProgressBar();
  updateTray();
}

function setActiveDownloads(count, progress) {
  const previous = activeDownloads;
  activeDownloads = count;
  if (typeof progress === 'number' && progress >= 0) {
    currentDownloadProgress = progress;
  } else if (count === 0) {
    currentDownloadProgress = -1;
  } else if (currentDownloadProgress < 0) {
    currentDownloadProgress = 0.0;
  }
  updateProgressBar();
  updateTray();
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

function setPlaybackActiveState(active, title) {
  isPlaybackPlaying = !!active;
  currentMediaTitle = active ? (title || null) : null;
  if (active) {
    registerMediaShortcuts();
    if (playbackBlockerId === null) {
      playbackBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    }
  } else {
    unregisterMediaShortcuts();
    if (playbackBlockerId !== null) {
      if (powerSaveBlocker.isStarted(playbackBlockerId)) {
        powerSaveBlocker.stop(playbackBlockerId);
      }
      playbackBlockerId = null;
    }
  }
  updateTray();
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
  if (!win || event.sender !== win.webContents) return false;
  const frameUrl = (event.senderFrame && event.senderFrame.url) || win.webContents.getURL() || '';
  return isAppPage(frameUrl);
}

ipcMain.handle('jellio:connect', (event, input) => {
  if (!fromAppPage(event)) return { ok: false, error: 'Not allowed.' };
  return connect(input);
});

ipcMain.handle('jellio:retry', async (event) => {
  if (!fromAppPage(event)) return { ok: false, error: 'Not allowed.' };
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
    return { ok: false, error: describeError(err) };
  }
});

ipcMain.on('jellio:retry', (event) => {
  if (fromAppPage(event)) {
    const server = serverUrl();
    if (!server) return loadSetup();
    probe(server).then(() => loadServer()).catch(() => {});
  }
});

ipcMain.on('jellio:change-server', (event) => {
  if (fromAppPage(event)) loadSetup();
});

ipcMain.handle('jellio:get-changelogs', (event) => {
  if (!event.senderFrame || !isAppPage(event.senderFrame.url)) return [];
  return MACOS_CHANGELOG_RELEASES;
});
// Sent to Jellyfin as this client's version, so Devices shows the app's own.
ipcMain.on('jellio:app-version', (event) => {
  event.returnValue = app.getVersion();
});
ipcMain.on('jellio:dismiss-whatsnew', (event) => {
  if (!event.senderFrame || !isAppPage(event.senderFrame.url)) return;
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
  if (win && !win.isDestroyed() && isServerUrl(win.webContents.getURL())) {
    win.webContents.send('jellio:update-state', snapshot);
  }
  if (snapshot.status === 'downloading') {
    currentUpdaterProgress = typeof snapshot.progress === 'number' ? snapshot.progress : 0.0;
  } else if (snapshot.status === 'installing') {
    currentUpdaterProgress = 1.0;
  } else {
    currentUpdaterProgress = -1;
  }
  updateProgressBar();
});

ipcMain.on('jellio:downloads', (event, count, progress) => {
  if (!win || event.sender !== win.webContents || (!isServerUrl(event.senderFrame.url) && !isAppPage(event.senderFrame.url))) return;
  setActiveDownloads(Math.max(0, parseInt(count, 10) || 0), typeof progress === 'number' ? progress : undefined);
});

ipcMain.on('jellio:playback-state', (event, active, title) => {
  if (!win || event.sender !== win.webContents || (!isServerUrl(event.senderFrame.url) && !isAppPage(event.senderFrame.url))) return;
  setPlaybackActiveState(!!active, title);
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
        ')',
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

function unregisterMediaShortcuts() {
  try {
    globalShortcut.unregister('MediaPlayPause');
    globalShortcut.unregister('MediaNextTrack');
    globalShortcut.unregister('MediaPreviousTrack');
  } catch (err) {
    console.warn('Jellio: could not unregister global media shortcuts', err);
  }
}

function buildMenu() {
  const history = () => win && !win.isDestroyed() && win.webContents.navigationHistory;
  const sendPlayback = (command) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('jellio:playback-command', command);
    }
  };
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: "What's New in Jellio…", click: () => showWhatsNewWindow() },
        { label: 'Check for Updates…', click: () => updates.checkForUpdates(win, 'menu') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => go('settings') },
        { label: 'Change Server…', click: () => win && !win.isDestroyed() && (win.show(), loadSetup()) },
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
      label: 'Playback',
      submenu: [
        {
          label: 'Play / Pause',
          accelerator: 'Cmd+Alt+Down',
          click: () => sendPlayback('play-pause'),
        },
        {
          label: 'Next',
          accelerator: 'Alt+Cmd+Right',
          click: () => sendPlayback('next'),
        },
        {
          label: 'Previous',
          accelerator: 'Alt+Cmd+Left',
          click: () => sendPlayback('previous'),
        },
        { type: 'separator' },
        {
          label: 'Skip 10 Seconds Forward',
          accelerator: 'Ctrl+Cmd+Right',
          click: () => sendPlayback('skip-forward'),
        },
        {
          label: 'Skip 10 Seconds Back',
          accelerator: 'Ctrl+Cmd+Left',
          click: () => sendPlayback('skip-backward'),
        },
        { type: 'separator' },
        {
          label: 'Volume Up',
          accelerator: 'Alt+Cmd+Up',
          click: () => sendPlayback('volume-up'),
        },
        {
          label: 'Volume Down',
          accelerator: 'Alt+Cmd+Down',
          click: () => sendPlayback('volume-down'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Picture-in-Picture',
          accelerator: 'Cmd+Shift+P',
          click: () => sendPlayback('toggle-pip'),
        },
      ],
    },
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

app.on('second-instance', (_event, argv) => {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (Array.isArray(argv)) {
    const url = argv.find((arg) => /^(jellio|jellyfin):\/\//i.test(arg));
    if (url) {
      const route = parseDeepLink(url);
      if (route) navigateRoute(route);
    }
  }
});

app.on('activate', () => {
  if (win && !win.isDestroyed()) win.show();
  else createWindow();
});

app.on('before-quit', (event) => {
  if (activeDownloads && !quitConfirmed && !updates.isInstalling()) {
    event.preventDefault();
    if (win && !win.isDestroyed()) win.show();
    const opts = {
      type: 'warning',
      message: activeDownloads === 1 ? 'A download is still running' : activeDownloads + ' downloads are still running',
      detail: 'If you quit now, they pick up again the next time you open Jellio.',
      buttons: ['Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    };
    (win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
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
  createTray();
  const server = serverUrl();
  if (server) session.defaultSession.preconnect({ url: server, numSockets: 4 });
  createWindow();
  if (shouldShowWhatsNewOnStartup()) {
    showWhatsNewWindow();
  }
  if (app.isPackaged) updates.startAutomaticChecks(() => win);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  setPlaybackActiveState(false);
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
