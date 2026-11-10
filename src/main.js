const { app, dialog, nativeTheme, powerMonitor } = require('electron');
const updates = require('./updates');
const { openDeepLink, registerDeepLinks } = require('./app/deeplink');
const { activeDownloadCount } = require('./app/downloads');
const { registerIpc } = require('./app/ipc');
const { setPlaybackActiveState } = require('./app/media');
const { buildDockMenu, buildMenu } = require('./app/menu');
const { preconnectAfterWake, preconnectServer } = require('./app/server');
const { liveWin, state } = require('./app/state');
const { createTray, destroyTray } = require('./app/tray');
const { createWindow, shouldShowWhatsNewOnStartup, showWhatsNewWindow } = require('./app/window');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

registerDeepLinks();

nativeTheme.themeSource = 'dark';

// Hardware video decoding and Apple Silicon acceleration flags.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,VaapiVideoDecoder,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
if (process.platform === 'darwin' && process.arch === 'arm64') {
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
}

registerIpc();

app.on('second-instance', (_event, argv) => {
  if (!liveWin()) createWindow();
  const win = state.win;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (Array.isArray(argv)) {
    const url = argv.find((arg) => /^(jellio|jellyfin):\/\//i.test(arg));
    if (url) openDeepLink(url);
  }
});

app.on('activate', () => {
  const win = liveWin();
  if (win) win.show();
  else createWindow();
});

app.on('before-quit', (event) => {
  const activeDownloads = activeDownloadCount();
  if (activeDownloads && !state.quitConfirmed && !updates.isInstalling()) {
    event.preventDefault();
    const win = liveWin();
    if (win) win.show();
    const opts = {
      type: 'warning',
      message: activeDownloads === 1 ? 'A download is still running' : activeDownloads + ' downloads are still running',
      detail: 'If you quit now, they pick up again the next time you open Jellio.',
      buttons: ['Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    };
    (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then(({ response }) => {
      if (response !== 0) return;
      state.quitConfirmed = true;
      app.quit();
    });
    return;
  }
  state.quitting = true;
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
  preconnectServer();
  // Logout, restart and shutdown: a prompt here would stall the system.
  powerMonitor.on('shutdown', () => {
    state.quitConfirmed = true;
    app.quit();
  });
  powerMonitor.on('resume', preconnectAfterWake);
  createWindow();
  if (shouldShowWhatsNewOnStartup()) {
    showWhatsNewWindow();
  }
  if (app.isPackaged) updates.startAutomaticChecks(() => state.win);
});

app.on('will-quit', () => {
  setPlaybackActiveState(false);
  destroyTray();
});
