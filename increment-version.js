// increment-version.js
// Increments the patch (subversion) of the version in package.json and updates constants.js
import fs from 'fs';

const pkgPath = './package.json';
const constantsPath = './constants.js';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (!pkg.version) {
  throw new Error('No version field in package.json');
}

const parts = pkg.version.split('.').map(Number);
if (parts.length !== 3) {
  throw new Error('Version is not in semantic versioning format (x.y.z)');
}

parts[2] += 1; // Increment patch
pkg.version = parts.join('.');

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Version bumped to', pkg.version);

// Update GAME_VERSION in constants.js
const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
const newConstantsSrc = constantsSrc.replace(
  /export const GAME_VERSION = '.*?';/,
  `export const GAME_VERSION = '${pkg.version}';`
);
fs.writeFileSync(constantsPath, newConstantsSrc);
console.log('Updated GAME_VERSION in constants.js to', pkg.version);
