import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (file) => readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const notes = JSON.parse(read('public/release-notes.json'));
const checks = [
  ['package-lock root', lock.version],
  ['package-lock package', lock.packages[''].version],
  ['mobile', read('src/mobile/version.ts').match(/MOBILE_APP_VERSION\s*=\s*['"]v?([^'"]+)/)?.[1]],
  ['landing', read('landing/src/config.ts').match(/export const VERSION\s*=\s*['"]([^'"]+)/)?.[1]],
  ['release notes', notes.versions[0]?.version],
];
let failures = 0;
for (const [name, value] of checks) {
  try {
    assert.equal(value?.replace(/^v/, ''), pkg.version);
    console.log(`OK ${name}: ${value}`);
  } catch {
    console.error(`FAIL ${name}: expected ${pkg.version}, got ${value}`);
    failures++;
  }
}
const sidebarVersions = [
  ...read('src/adapters/components/Layout/Sidebar.tsx').matchAll(/^\s+v(\d+\.\d+\.\d+)\s*$/gm),
].map((match) => match[1]);
if (sidebarVersions.length !== 1 || sidebarVersions[0] !== pkg.version) {
  console.error('FAIL sidebar: inspect visible version text');
  failures++;
} else console.log(`OK sidebar: ${sidebarVersions[0]}`);
console.log(
  `Release version preparation: ${6 - failures}/6 passed. This does not authorize publishing or verify deployed servers.`,
);
process.exitCode = failures ? 1 : 0;
