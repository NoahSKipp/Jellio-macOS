const { app, dialog, net, shell } = require('electron');
const config = require('./config');

const LATEST = 'https://api.github.com/repos/NoahSKipp/Jellio-macOS/releases/latest';
const DAY_MS = 24 * 60 * 60 * 1000;

function parse(version) {
  return String(version || '')
    .replace(/^v/, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
}

function isNewer(candidate, current) {
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function latestRelease() {
  const response = await net.fetch(LATEST, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Jellio-macOS' },
  });
  if (!response.ok) throw new Error('GitHub answered ' + response.status);
  return response.json();
}

// Ad-hoc signed builds can't update themselves in place (Squirrel needs a
// Developer ID), so this only points at the release page.
async function checkForUpdates(window, { quiet }) {
  if (quiet) {
    const last = config.get('lastUpdateCheck') || 0;
    if (Date.now() - last < DAY_MS) return;
  }
  config.set('lastUpdateCheck', Date.now());
  let release;
  try {
    release = await latestRelease();
  } catch (err) {
    if (!quiet) {
      dialog.showMessageBox(window, {
        type: 'warning',
        message: 'Could not check for updates',
        detail: String(err.message || err),
      });
    }
    return;
  }
  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!isNewer(version, app.getVersion())) {
    if (!quiet) {
      dialog.showMessageBox(window, {
        type: 'info',
        message: 'Jellio is up to date',
        detail: 'You have version ' + app.getVersion() + '.',
      });
    }
    return;
  }
  if (quiet && config.get('skippedVersion') === version) return;
  const { response } = await dialog.showMessageBox(window, {
    type: 'info',
    message: 'Jellio ' + version + ' is available',
    detail: 'You have version ' + app.getVersion() + '. Download the new version and drag it into Applications to replace this one.',
    buttons: ['Download', 'Later', 'Skip This Version'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.openExternal(release.html_url);
  if (response === 2) config.set('skippedVersion', version);
}

module.exports = { checkForUpdates };
