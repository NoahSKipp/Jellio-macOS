const { app, Notification, powerSaveBlocker } = require('electron');
const { liveWin, changed } = require('./state');

let activeDownloads = 0;
let currentDownloadProgress = -1;
let currentUpdaterProgress = -1;
let blockerId = null;

function activeDownloadCount() {
  return activeDownloads;
}

function updateProgressBar() {
  const win = liveWin();
  if (!win) return;

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
  changed();
  if (app.dock) app.dock.setBadge(count ? String(count) : '');
  const win = liveWin();
  // Throttled like any hidden tab unless a download needs the page running.
  if (win) win.webContents.setBackgroundThrottling(count === 0);
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

function setUpdaterProgress(snapshot) {
  if (snapshot.status === 'downloading') {
    currentUpdaterProgress = typeof snapshot.progress === 'number' ? snapshot.progress : 0.0;
  } else if (snapshot.status === 'installing') {
    currentUpdaterProgress = 1.0;
  } else {
    currentUpdaterProgress = -1;
  }
  updateProgressBar();
}

module.exports = { activeDownloadCount, setActiveDownloads, setUpdaterProgress, updateProgressBar };
