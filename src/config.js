const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'config.json');

let data = null;

function load() {
  if (data) return data;
  const filePath = file();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(raw) || {};
    } catch (err) {
      console.warn('Jellio: config.json corrupted, backing up', err);
      try {
        const backupPath = filePath + '.corrupted.' + Date.now() + '.bak';
        fs.renameSync(filePath, backupPath);
      } catch (backupErr) {
        console.warn('Jellio: could not backup corrupted config', backupErr);
      }
      data = null;
      // Check if a valid .tmp file exists before falling back to {}
      try {
        const dir = path.dirname(filePath);
        if (fs.existsSync(dir)) {
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
              if (parsed && typeof parsed === 'object') {
                data = parsed;
                break;
              }
            } catch {}
          }
        }
      } catch {}
      if (!data) {
        data = {};
      }
    }
  } else {
    data = {};
  }
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
