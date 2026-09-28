const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'config.json');

let data = null;

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(file(), 'utf8')) || {};
  } catch {
    data = {};
  }
  return data;
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Jellio: could not save settings', err);
  }
}

module.exports = { get, set };
