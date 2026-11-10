const path = require('path');
const { app, Menu, Tray, nativeImage } = require('electron');
const { activeDownloadCount } = require('./downloads');
const { playback, sendPlayback } = require('./media');
const { checkForUpdatesItem } = require('./menu');
const { go } = require('./server');
const { liveWin, state } = require('./state');
const { toggleWindowVisibility } = require('./window');

let tray = null;

function updateTray() {
  if (!tray) return;

  const activeDownloads = activeDownloadCount();
  const { playing, title } = playback();
  const win = liveWin();
  const isWinVisible = Boolean(win && win.isVisible());
  const mediaLabel = playing && title ? title : 'Nothing Playing';
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
    { label: playing ? 'Pause' : 'Play', click: () => sendPlayback('play-pause') },
    { label: 'Next', click: () => sendPlayback('next') },
    { label: 'Previous', click: () => sendPlayback('previous') },
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
    checkForUpdatesItem(),
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
  // Picks up trayTemplate@2x.png on Retina displays by itself.
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Jellio');
  state.events.on('changed', updateTray);
  updateTray();
}

function destroyTray() {
  if (!tray) return;
  state.events.off('changed', updateTray);
  tray.destroy();
  tray = null;
}

module.exports = { createTray, destroyTray };
