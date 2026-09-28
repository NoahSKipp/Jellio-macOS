const { execFileSync } = require('child_process');
const path = require('path');

// No Developer ID, so the app is signed ad hoc: Apple Silicon refuses to
// run anything unsigned, and electron-builder's Info.plist edits break
// the signature Electron ships with.
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
