const { contextBridge, ipcRenderer } = require('electron');

const appPage = location.protocol === 'file:';

function getActiveMediaTitle() {
  try {
    if (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) {
      const meta = navigator.mediaSession.metadata;
      if (meta.artist) {
        return `${meta.title} (${meta.artist})`;
      }
      return meta.title;
    }
  } catch {}
  try {
    const el = document.querySelector(
      '.jellio-player-topbar-title, .jellio-live-player-title, .jellio-offline-player-title, .jellio-mini-player-title, .videoPlayerTitle, .headerMediaTitle',
    );
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.trim();
    }
  } catch {}
  return null;
}

contextBridge.exposeInMainWorld('jellioNative', {
  platform: 'macos',
  deviceName: 'jellio-macOS',
  appVersion: ipcRenderer.sendSync('jellio:app-version'),
  ...(appPage
    ? {
        connect: (url) => ipcRenderer.invoke('jellio:connect', url),
        retry: () => ipcRenderer.invoke('jellio:retry'),
        changeServer: () => ipcRenderer.send('jellio:change-server'),
        dismissWhatsNew: () => ipcRenderer.send('jellio:dismiss-whatsnew'),
        getChangelogs: () => ipcRenderer.invoke('jellio:get-changelogs'),
      }
    : {
        updates: {
          getState: () => ipcRenderer.invoke('jellio:update-state'),
          check: () => ipcRenderer.invoke('jellio:update-check'),
          install: () => ipcRenderer.invoke('jellio:update-install'),
          setAutomatic: (on) => ipcRenderer.invoke('jellio:update-automatic', !!on),
          onChange: (listener) => {
            const handler = (_event, snapshot) => listener(snapshot);
            ipcRenderer.on('jellio:update-state', handler);
            return () => ipcRenderer.removeListener('jellio:update-state', handler);
          },
        },
        setPlaybackState: (playing, title) => {
          const mediaTitle =
            typeof title === 'string' && title.trim()
              ? title.trim()
              : playing
                ? getActiveMediaTitle()
                : null;
          ipcRenderer.send('jellio:playback-state', !!playing, mediaTitle);
        },
      }),
});

ipcRenderer.on('jellio:navigate', (_event, route) => {
  if (!route || typeof route !== 'string') return;
  const hash = route.startsWith('#') ? route : '#' + route;
  try {
    if (window.Emby && window.Emby.Page && typeof window.Emby.Page.show === 'function') {
      window.Emby.Page.show(hash);
    } else {
      window.location.hash = hash;
    }
  } catch {
    window.location.hash = hash;
  }
});

ipcRenderer.on('jellio:playback-command', (_event, command) => {
  window.dispatchEvent(new CustomEvent('jellio:playback-command', { detail: { command } }));

  const video = document.querySelector('video') || document.querySelector('audio');
  switch (command) {
    case 'play-pause':
    case 'playPause': {
      const handled = !document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'MediaPlayPause', bubbles: true, cancelable: true }),
      );
      if (!handled && video) {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
      break;
    }
    case 'next': {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'MediaTrackNext', bubbles: true, cancelable: true }),
      );
      break;
    }
    case 'previous': {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'MediaTrackPrevious', bubbles: true, cancelable: true }),
      );
      break;
    }
    case 'skip-forward':
    case 'skipForward': {
      const handled = !document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
      if (!handled && video && typeof video.currentTime === 'number') {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
      }
      break;
    }
    case 'skip-backward':
    case 'skipBackward': {
      const handled = !document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
      );
      if (!handled && video && typeof video.currentTime === 'number') {
        video.currentTime = Math.max(0, video.currentTime - 10);
      }
      break;
    }
    case 'volume-up':
    case 'volumeUp': {
      const handled = !document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      );
      if (!handled && video && typeof video.volume === 'number') {
        video.volume = Math.min(1.0, video.volume + 0.1);
      }
      break;
    }
    case 'volume-down':
    case 'volumeDown': {
      const handled = !document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      if (!handled && video && typeof video.volume === 'number') {
        video.volume = Math.max(0.0, video.volume - 0.1);
      }
      break;
    }
    case 'toggle-pip':
    case 'togglePip': {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else if (video && typeof video.requestPictureInPicture === 'function') {
        video.requestPictureInPicture().catch(() => {});
      }
      break;
    }
  }
});

function syncPlaybackState() {
  const video = document.querySelector('video') || document.querySelector('audio');
  const isPlaying = !!(video && !video.paused && !video.ended && video.readyState > 1);
  const title = isPlaying ? getActiveMediaTitle() : null;
  ipcRenderer.send('jellio:playback-state', isPlaying, title);
}

window.addEventListener(
  'play',
  () => {
    syncPlaybackState();
    setTimeout(syncPlaybackState, 500);
    setTimeout(syncPlaybackState, 1500);
  },
  true,
);
window.addEventListener('pause', syncPlaybackState, true);
window.addEventListener('ended', syncPlaybackState, true);

// Counts Jellio's running downloads (runtime/offline.js keeps them in
// IndexedDB) for the Dock badge, progress bar, and quit warning. Never creates the
// database: an open that would have to upgrade is aborted.
function countDownloads() {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open('jellio-offline');
    } catch {
      resolve({ count: 0, progress: -1 });
      return;
    }
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve({ count: 0, progress: -1 });
    request.onblocked = () => resolve({ count: 0, progress: -1 });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains('downloads')) {
        db.close();
        resolve({ count: 0, progress: -1 });
        return;
      }
      let count = 0;
      let totalBytes = 0;
      let doneBytes = 0;
      const tx = db.transaction('downloads', 'readonly');
      tx.objectStore('downloads').openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const val = cursor.value;
        const status = val && val.Status;
        if (status === 'downloading' || status === 'queued') {
          count += 1;
          if (val.TotalBytes && val.TotalBytes > 0) {
            totalBytes += val.TotalBytes;
            doneBytes += Math.min(val.TotalBytes, val.DoneBytes || 0);
          }
        }
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        let progress = -1;
        if (count > 0) {
          progress = totalBytes > 0 ? doneBytes / totalBytes : 0;
        }
        resolve({ count, progress });
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve({ count: 0, progress: -1 });
      };
    };
  });
}

if (!appPage && /^https?:$/.test(location.protocol)) {
  let lastCount = -1;
  let lastProgress = -1;
  const tick = async () => {
    const { count, progress } = await countDownloads();
    if (count !== lastCount || Math.abs(progress - lastProgress) > 0.01) {
      lastCount = count;
      lastProgress = progress;
      ipcRenderer.send('jellio:downloads', count, progress);
    }
  };
  // First count after startup, so it doesn't compete with the page loading.
  setTimeout(tick, 5000);
  setInterval(tick, 4000);
}
