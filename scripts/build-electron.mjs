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
  // y-leveldb: y-websocket/bin/utils.cjs가 optional require하지만
  // YPERSISTENCE 환경변수 없으면 런타임에 호출되지 않음. fresh npm ci 환경
  // (GitHub Actions macOS)에서 resolve 실패 방지를 위해 external 처리.
  external: ['electron', 'electron-updater', 'y-leveldb'],
  sourcemap: false,
});

console.log('Electron build complete');
