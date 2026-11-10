const { app } = require('electron');
const { isServerUrl } = require('./navigation');
const { state } = require('./state');

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
  const win = state.win;
  if (!win || win.isDestroyed()) {
    state.pendingRoute = route;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  if (win.webContents.isLoading() || !isServerUrl(win.webContents.getURL())) {
    state.pendingRoute = route;
  } else {
    win.webContents.send('jellio:navigate', route);
  }
}

function openDeepLink(url) {
  const route = parseDeepLink(url);
  if (route) navigateRoute(route);
}

function registerDeepLinks() {
  app.setAsDefaultProtocolClient('jellio');
  app.setAsDefaultProtocolClient('jellyfin');
  app.on('open-url', (event, url) => {
    event.preventDefault();
    openDeepLink(url);
  });
}

module.exports = { openDeepLink, registerDeepLinks };
