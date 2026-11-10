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

module.exports = { releaseVersion, zipName, checksumName, findAsset, parseChecksum };
