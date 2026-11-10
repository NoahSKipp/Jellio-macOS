const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = ['src', 'scripts', 'test']
  .map((dir) => path.join(root, dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap(sources);

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('Checked ' + files.length + ' files.');
