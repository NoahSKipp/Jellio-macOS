const { app, ipcMain } = require('electron');
const config = require('../config');
const updates = require('../updates');
const { MACOS_CHANGELOG_RELEASES } = require('../changelogData');
const { setActiveDownloads, setUpdaterProgress } = require('./downloads');
const { setPlaybackActiveState } = require('./media');
const { fromAppFrame, fromAppPage, fromServerPage, isServerUrl } = require('./navigation');
const { connect, loadSetup, retry } = require('./server');
const { liveWin, state } = require('./state');

function registerIpc() {
  ipcMain.handle('jellio:connect', (event, input) => {
    if (!fromAppPage(event)) return { ok: false, error: 'Not allowed.' };
    return connect(input);
  });

  ipcMain.handle('jellio:retry', async (event) => {
    if (!fromAppPage(event)) return { ok: false, error: 'Not allowed.' };
    return retry();
  });

  ipcMain.on('jellio:change-server', (event) => {
    if (fromAppPage(event)) loadSetup();
  });

  ipcMain.handle('jellio:get-changelogs', (event) => {
    if (!fromAppFrame(event)) return [];
    return MACOS_CHANGELOG_RELEASES;
  });
  // Sent to Jellyfin as this client's version, so Devices shows the app's own.
  ipcMain.on('jellio:app-version', (event) => {
    event.returnValue = app.getVersion();
  });
  ipcMain.on('jellio:dismiss-whatsnew', (event) => {
    if (!fromAppFrame(event)) return;
    config.set('lastSeenChangelogVersion', app.getVersion());
    if (state.whatsNewWin && !state.whatsNewWin.isDestroyed()) {
      state.whatsNewWin.close();
    }
  });

  // Jellio's Settings > About (the plugin) shows and drives updates.
  ipcMain.handle('jellio:update-state', (event) => (fromServerPage(event) ? updates.getState() : null));
  ipcMain.handle('jellio:update-check', (event) => (fromServerPage(event) ? updates.checkForUpdates(state.win, 'settings') : null));
  ipcMain.handle('jellio:update-automatic', (event, on) => (fromServerPage(event) ? updates.setAutomatic(on) : null));
  ipcMain.handle('jellio:update-install', (event) => {
    if (fromServerPage(event)) updates.installUpdate(state.win);
    return null;
  });

  updates.onChange((snapshot) => {
    const win = liveWin();
    if (win && isServerUrl(win.webContents.getURL())) {
      win.webContents.send('jellio:update-state', snapshot);
    }
    setUpdaterProgress(snapshot);
  });

  ipcMain.on('jellio:downloads', (event, count, progress) => {
    if (!fromServerPage(event)) return;
    setActiveDownloads(Math.max(0, parseInt(count, 10) || 0), Number.isFinite(progress) ? progress : undefined);
  });

  ipcMain.on('jellio:playback-state', (event, active, title) => {
    if (!fromServerPage(event)) return;
    setPlaybackActiveState(!!active, typeof title === 'string' ? title.slice(0, 200) : null);
  });
}

module.exports = { registerIpc };
