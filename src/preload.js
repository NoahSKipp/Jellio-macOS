const { contextBridge, ipcRenderer } = require('electron');

const appPage = location.protocol === 'file:';

contextBridge.exposeInMainWorld('jellioNative', {
  platform: 'macos',
  ...(appPage
    ? {
        connect: (url) => ipcRenderer.invoke('jellio:connect', url),
        retry: () => ipcRenderer.send('jellio:retry'),
        changeServer: () => ipcRenderer.send('jellio:change-server'),
      }
    : {}),
});

// Counts Jellio's running downloads (runtime/offline.js keeps them in
// IndexedDB) for the Dock badge and the quit warning. Never creates the
// database: an open that would have to upgrade is aborted.
function countDownloads() {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open('jellio-offline');
    } catch {
      resolve(0);
      return;
    }
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(0);
    request.onblocked = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains('downloads')) {
        db.close();
        resolve(0);
        return;
      }
      let count = 0;
      const tx = db.transaction('downloads', 'readonly');
      tx.objectStore('downloads').openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const status = cursor.value && cursor.value.Status;
        if (status === 'downloading' || status === 'queued') count += 1;
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve(count);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(0);
      };
    };
  });
}

if (!appPage && /^https?:$/.test(location.protocol)) {
  let last = -1;
  const tick = async () => {
    const count = await countDownloads();
    if (count !== last) {
      last = count;
      ipcRenderer.send('jellio:downloads', count);
    }
  };
  window.addEventListener('DOMContentLoaded', tick);
  setInterval(tick, 4000);
}
