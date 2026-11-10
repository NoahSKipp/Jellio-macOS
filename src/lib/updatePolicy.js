const BUNDLE_ID = 'com.noahskipp.jellio';
const REPO_PATH = '/NoahSKipp/Jellio-macOS';
const DOWNLOAD_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function isAllowedDownloadUrl(value) {
  const url = httpsUrl(value);
  return Boolean(url && DOWNLOAD_HOSTS.has(url.hostname));
}

function isReleaseAssetUrl(value, tag, name) {
  const url = httpsUrl(value);
  if (!url || url.hostname !== 'github.com' || url.search || url.hash) return false;
  return url.pathname === REPO_PATH + '/releases/download/' + encodeURIComponent(tag) + '/' + encodeURIComponent(name);
}

function releaseVersion(release) {
  const version = String((release && release.tag_name) || '').replace(/^v/, '');
  return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

function zipName(version) {
  return 'Jellio-' + version + '-arm64.zip';
}

function checksumName(version) {
  return 'Jellio-' + version + '-arm64.sha256';
}

function findAsset(release, name) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  return assets.find((asset) => asset && asset.name === name) || null;
}

// shasum output: "<hex>  <name>" or "<hex> *<name>" (binary mode).
function parseChecksum(text, name) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (match && match[2] === name) return match[1].toLowerCase();
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function plistString(xml, key) {
  const match = new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>').exec(String(xml || ''));
  return match ? match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_m, name) => ENTITIES[name]) : null;
}

// Info.plist of the unpacked update, as XML (plutil -convert xml1).
function bundleInfoProblem(xml, version) {
  const id = plistString(xml, 'CFBundleIdentifier');
  if (id !== BUNDLE_ID) return 'The download is not Jellio (bundle id ' + (id || 'missing') + ').';
  const found = plistString(xml, 'CFBundleShortVersionString');
  if (found !== version) return 'The download is version ' + (found || 'unknown') + ', not ' + version + '.';
  return null;
}

module.exports = {
  BUNDLE_ID,
  bundleInfoProblem,
  plistString,
  isAllowedDownloadUrl,
  isReleaseAssetUrl,
  releaseVersion,
  zipName,
  checksumName,
  findAsset,
  parseChecksum,
};
