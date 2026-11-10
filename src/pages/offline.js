const params = new URLSearchParams(location.search);
const server = params.get('server');
const reason = params.get('reason');
const detailEl = document.getElementById('detail');
const errorEl = document.getElementById('error');
const retryBtn = document.getElementById('retry');
const changeBtn = document.getElementById('change');

function updateDetail(msg) {
  if (detailEl) detailEl.textContent = msg;
}

if (server) {
  updateDetail('Jellio couldn’t connect to ' + server + '.' + (reason ? ' ' + reason : ''));
}

let retrying = false;
async function doRetry() {
  if (retrying) return;
  retrying = true;
  retryBtn.disabled = true;
  if (errorEl) errorEl.textContent = '';
  const originalText = retryBtn.textContent;
  retryBtn.textContent = 'Checking connection…';
  try {
    const res = await window.jellioNative.retry();
    if (res && res.ok === false) {
      if (errorEl) {
        errorEl.textContent = res.error || 'The server is still unreachable.';
      }
      retryBtn.disabled = false;
      retryBtn.textContent = originalText;
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'The server is still unreachable.';
    }
    retryBtn.disabled = false;
    retryBtn.textContent = originalText;
  } finally {
    retrying = false;
  }
}

retryBtn.addEventListener('click', doRetry);
changeBtn.addEventListener('click', () => window.jellioNative.changeServer());

// Automatically retry when connection returns or window becomes active
window.addEventListener('online', doRetry);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') doRetry();
});

// Periodic auto-retry in the background so reconnection is seamless
setInterval(doRetry, 8000);
