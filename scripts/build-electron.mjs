import { build } from 'esbuild';
import { readdirSync } from 'fs';
import path from 'path';

const entryPoints = readdirSync('electron')
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join('electron', f));

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist-electron',
  format: 'cjs',
  external: ['electron', 'electron-updater'],
  sourcemap: false,
});

console.log('Electron build complete');
