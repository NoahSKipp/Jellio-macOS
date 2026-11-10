const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { backupsToPrune } = require('./lib/backups');

const file = () => path.join(app.getPath('userData'), 'config.json');

let data = null;

function isPlainObject(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function recoverFromTempFiles(filePath) {
  let recovered = null;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) return null;
    const base = path.basename(filePath);
    const candidates = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(base) && f.endsWith('.tmp'))
      .map((f) => path.join(dir, f));
    candidates.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
    for (const cand of candidates) {
      try {
        const candRaw = fs.readFileSync(cand, 'utf8');
        const parsed = JSON.parse(candRaw);
        if (isPlainObject(parsed)) {
          recovered = parsed;
          break;
        }
      } catch {}
    }
    if (recovered) {
      try {
        const tempPath = filePath + '.' + process.pid + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(recovered, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
        for (const cand of candidates) {
          try {
            if (fs.existsSync(cand)) fs.unlinkSync(cand);
          } catch {}
        }
      } catch (err) {
        console.warn('Jellio: could not persist recovered config', err);
      }
    }
  } catch {}
  return recovered;
}

const KEEP_BACKUPS = 3;

function pruneBackups(filePath) {
  try {
    const dir = path.dirname(filePath);
    for (const name of backupsToPrune(fs.readdirSync(dir), path.basename(filePath), KEEP_BACKUPS)) {
      fs.unlinkSync(path.join(dir, name));
    }
  } catch {}
}

function load() {
  if (data) return data;
  const filePath = file();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) {
        throw new Error('Config root is not a JSON object');
      }
      data = parsed;
    } catch (err) {
      console.warn('Jellio: config.json corrupted, backing up', err);
      try {
        const backupPath = filePath + '.corrupted.' + Date.now() + '.bak';
        fs.renameSync(filePath, backupPath);
      } catch (backupErr) {
        console.warn('Jellio: could not backup corrupted config', backupErr);
      }
      data = recoverFromTempFiles(filePath) || {};
    }
  } else {
    data = recoverFromTempFiles(filePath) || {};
  }
  pruneBackups(filePath);
  return data;
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  const filePath = file();
  const tempPath = filePath + '.' + process.pid + '.tmp';
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.warn('Jellio: could not save settings', err);
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
  }
}

module.exports = { get, set };
