const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { app, dialog, net, shell } = require('electron');
const config = require('./config');
const {
  bundleInfoProblem,
  checksumName,
  findAsset,
  isAllowedDownloadUrl,
  isReleaseAssetUrl,
  parseChecksum,
  releasePageUrl,
  releaseVersion,
  zipName,
} = require('./lib/updatePolicy');

const LATEST = 'https://api.github.com/repos/NoahSKipp/Jellio-macOS/releases/latest';
const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000;

let state = { status: 'idle' };
let release = null;
let busy = null;
let installing = false;
const listeners = new Set();

function isInstalling() {
  return installing;
}

function showMessageBox(window, options) {
  const parent = window && !window.isDestroyed() ? window : undefined;
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

function getState() {
  return { ...state, current: app.getVersion(), automatic: isAutomatic(), checkedAt: config.get('lastUpdateCheck') || null };
}

function setState(next) {
  state = next;
  const snapshot = getState();
  listeners.forEach((listener) => listener(snapshot));
}

function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isAutomatic() {
  return config.get('autoUpdateCheck') !== false;
}

function setAutomatic(on) {
  config.set('autoUpdateCheck', !!on);
  setState(state);
  return getState();
}

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
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('GitHub answered ' + response.status);
  return response.json();
}

function notes(found) {
  const text = String(found.body || '').trim();
  return text.length > 600 ? text.slice(0, 600) + '…' : text;
}

// source: 'auto' asks only when there's something new, 'menu' always
// answers with a dialog, 'settings' never shows one (the page does).
async function checkForUpdates(window, source) {
  if (busy) return getState();
  if (source === 'auto') {
    if (!isAutomatic()) return getState();
    const last = config.get('lastUpdateCheck') || 0;
    if (Date.now() - last < AUTO_INTERVAL_MS) return getState();
  }
  setState({ status: 'checking' });
  try {
    release = await latestRelease();
    config.set('lastUpdateCheck', Date.now());
  } catch (err) {
    setState({ status: 'error', error: 'Couldn’t check for updates: ' + String(err.message || err) });
    if (source === 'menu') {
      showMessageBox(window, { type: 'warning', message: 'Could not check for updates', detail: String(err.message || err) });
    }
    return getState();
  }

  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!isNewer(version, app.getVersion())) {
    setState({ status: 'up-to-date', latest: version });
    if (source === 'menu') {
      showMessageBox(window, { type: 'info', message: 'Jellio is up to date', detail: 'You have version ' + app.getVersion() + '.' });
    }
    return getState();
  }

  setState({ status: 'available', latest: version, notes: notes(release), url: releasePageUrl(release.html_url) });
  if (source === 'settings') return getState();
  if (source === 'auto' && config.get('skippedVersion') === version) return getState();
  const { response } = await showMessageBox(window, {
    type: 'info',
    message: 'Jellio ' + version + ' is available',
    detail: 'You have version ' + app.getVersion() + '.' + (notes(release) ? '\n\n' + notes(release) : ''),
    buttons: ['Install and Restart', 'Later', 'Skip This Version'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) installUpdate(window);
  if (response === 2) config.set('skippedVersion', version);
  return getState();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
  });
}

// The running bundle, if Jellio can replace it: not on a disk image and
// not translocated by Gatekeeper (opened straight from Downloads).
function bundlePath() {
  const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
  if (!bundle.endsWith('.app')) return null;
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return null;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
  } catch {
    return null;
  }
  return bundle;
}

const OFF_GITHUB = 'The update download isn’t coming from GitHub, so Jellio stopped it.';

// Every hop, redirects included, has to stay on GitHub's release hosts.
function get(url) {
  return new Promise((resolve, reject) => {
    if (!isAllowedDownloadUrl(url)) {
      reject(new Error(OFF_GITHUB));
      return;
    }
    const request = net.request({ url, redirect: 'manual', cache: 'no-store' });
    request.setHeader('User-Agent', 'Jellio-macOS');
    request.on('redirect', (_status, _method, location) => {
      if (isAllowedDownloadUrl(location)) {
        request.followRedirect();
      } else {
        reject(new Error(OFF_GITHUB));
        request.abort();
      }
    });
    request.on('response', resolve);
    request.on('error', reject);
    request.end();
  });
}

async function download(asset, file, version) {
  const response = await get(asset.browser_download_url);
  if (response.statusCode !== 200) throw new Error('The download answered ' + response.statusCode);
  const total = Number(response.headers['content-length']) || asset.size || 0;
  const out = fs.createWriteStream(file);
  const hash = crypto.createHash('sha256');
  let received = 0;
  let lastSent = 0;
  try {
    for await (const value of response) {
      const chunk = Buffer.from(value);
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      received += chunk.length;
      if (total && Date.now() - lastSent > 250) {
        lastSent = Date.now();
        setState({ status: 'downloading', latest: version, progress: received / total });
      }
    }
  } finally {
    await new Promise((resolve) => out.end(resolve));
  }
  return hash.digest('hex');
}

const CHECKSUM_UNAVAILABLE = 'Jellio couldn’t get the checksum for this update, so it didn’t install it. Try again later.';

async function expectedChecksum(sums, asset) {
  let text = '';
  try {
    const response = await get(sums.browser_download_url);
    if (response.statusCode !== 200) throw new Error('The checksum answered ' + response.statusCode);
    for await (const chunk of response) {
      text += Buffer.from(chunk).toString('utf8');
      if (text.length > 65536) throw new Error('The checksum file is too large');
    }
  } catch {
    throw new Error(CHECKSUM_UNAVAILABLE);
  }
  const expected = parseChecksum(text, asset.name);
  if (!expected) throw new Error(CHECKSUM_UNAVAILABLE);
  return expected;
}

async function verifyBundle(candidate, version) {
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', candidate]);
  const xml = await run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', path.join(candidate, 'Contents', 'Info.plist')]);
  const problem = bundleInfoProblem(xml, version);
  if (problem) throw new Error(problem);
}

// Waits for this process to exit, swaps the bundle (putting the old one
// back if the move fails) and opens the new version.
const SWAP_SCRIPT = `
pid="$1"; old="$2"; new="$3"; work="$4"
for i in $(seq 1 1200); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$pid" 2>/dev/null; then rm -rf "$work"; exit 1; fi
backup="$old.previous"
rm -rf "$backup"
if mv "$old" "$backup" && mv "$new" "$old"; then
  rm -rf "$backup"
else
  [ -d "$backup" ] && [ ! -d "$old" ] && mv "$backup" "$old"
fi
xattr -cr "$old" 2>/dev/null
rm -rf "$work"
open "$old"
`;

async function installUpdate(window) {
  if (busy) return busy;
  busy = (async () => {
    const found = release || (await latestRelease());
    const version = releaseVersion(found);
    if (!version) throw new Error('The latest release has no version Jellio understands.');
    const asset = findAsset(found, zipName(version));
    const sums = findAsset(found, checksumName(version));
    const bundle = bundlePath();
    if (asset && !isReleaseAssetUrl(asset.browser_download_url, found.tag_name, asset.name)) throw new Error(OFF_GITHUB);
    if (sums && !isReleaseAssetUrl(sums.browser_download_url, found.tag_name, sums.name)) throw new Error(OFF_GITHUB);
    if (!asset || !sums || !bundle) {
      const reason = !asset
        ? 'This release has no app download yet. Try again in a few minutes.'
        : !sums
          ? 'This release has no checksum to check the download against, so Jellio won’t install it. Try again in a few minutes, or download it from the release page.'
          : 'Move Jellio to your Applications folder first, then install the update from there.';
      setState({ status: 'error', latest: version, error: reason, url: releasePageUrl(found.html_url) });
      const { response } = await showMessageBox(window, {
        type: 'warning',
        message: 'Jellio can’t update itself here',
        detail: reason,
        buttons: ['Open Release Page', 'OK'],
        defaultId: 1,
      });
      if (response === 0) shell.openExternal(releasePageUrl(found.html_url));
      return;
    }

    let work = null;
    let handedOff = false;
    try {
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'jellio-update-'));
      const zip = path.join(work, asset.name);
      setState({ status: 'downloading', latest: version, progress: 0 });
      const expected = await expectedChecksum(sums, asset);
      const actual = await download(asset, zip, version);
      if (actual !== expected) throw new Error('The download didn’t match its checksum.');

      setState({ status: 'installing', latest: version });
      const unpacked = path.join(work, 'unpacked');
      await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked]);
      const fresh = path.join(unpacked, path.basename(bundle));
      const candidate = fs.existsSync(fresh) ? fresh : path.join(unpacked, 'Jellio.app');
      if (!fs.existsSync(candidate)) throw new Error('The download has no Jellio app in it.');
      await verifyBundle(candidate, version);
      await run('/usr/bin/xattr', ['-cr', candidate]).catch(() => null);

      setState({ status: 'restarting', latest: version });
      const child = spawn('/bin/bash', ['-c', SWAP_SCRIPT, 'jellio-update', String(process.pid), bundle, candidate, work], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      handedOff = true;
      installing = true;
      app.quit();
    } finally {
      if (work && !handedOff) {
        try {
          fs.rmSync(work, { recursive: true, force: true });
        } catch {}
      }
    }
  })()
    .catch((err) => {
      setState({ status: 'error', error: 'Couldn’t install the update: ' + String(err.message || err) });
      showMessageBox(window, { type: 'warning', message: 'Could not install the update', detail: String(err.message || err) });
    })
    .finally(() => {
      busy = null;
    });
  return busy;
}

// Shortly after launch, then every few hours while Jellio runs.
function startAutomaticChecks(getWindow) {
  setTimeout(() => checkForUpdates(getWindow(), 'auto'), 10000);
  setInterval(() => checkForUpdates(getWindow(), 'auto'), AUTO_INTERVAL_MS);
}

module.exports = { checkForUpdates, installUpdate, isInstalling, startAutomaticChecks, getState, setAutomatic, onChange };
