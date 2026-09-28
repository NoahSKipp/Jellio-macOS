const params = new URLSearchParams(location.search);
const server = params.get('server');
const reason = params.get('reason');

if (server) {
  document.getElementById('detail').textContent =
    'Jellio couldn’t connect to ' + server + (reason ? ' (' + reason + ')' : '') + '.';
}

document.getElementById('retry').addEventListener('click', () => window.jellioNative.retry());
document.getElementById('change').addEventListener('click', () => window.jellioNative.changeServer());

// Try again on its own when the Mac's connection comes back.
window.addEventListener('online', () => window.jellioNative.retry());
