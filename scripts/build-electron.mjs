import { build } from 'esbuild';
import { readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

// electron/ 1단계 + 하위 디렉토리(예: ipc/, platform/) .ts 파일을 모두 entry로 포함.
// outdir 구조는 dist-electron/{filename}.js 또는 dist-electron/{subdir}/{filename}.js
function collectEntries(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      entries.push(...collectEntries(full));
    } else if (
      st.isFile()
      && full.endsWith('.ts')
      && !full.endsWith('.d.ts')
      && !full.endsWith('.test.ts')
      && !full.endsWith('.spec.ts')
    ) {
      entries.push(full);
    }
  }
  return entries;
}

const entryPoints = collectEntries('electron');

// outbase로 electron/을 지정해 dist-electron/platform/win32Desktop.js 같은 구조를 유지.
await build({
  entryPoints,
  outbase: 'electron',
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: 'dist-electron',
  format: 'cjs',
  // y-leveldb: y-websocket/bin/utils.cjs가 optional require하지만
  // YPERSISTENCE 환경변수 없으면 런타임에 호출되지 않음. fresh npm ci 환경
  // (GitHub Actions macOS)에서 resolve 실패 방지를 위해 external 처리.
  // undici: Node 18+ 내장 모듈. 번들 불필요, 런타임에 node의 내장으로 로드.
  // koffi: native FFI 바인딩. .node 바이너리는 dlopen으로 로드되며, asar 내부에서
  //        require하면 packaged 환경에서 실패한다. asarUnpack과 함께 external 처리.
  external: ['electron', 'electron-updater', 'y-leveldb', 'undici', 'koffi'],
  sourcemap: false,
});

// Sanity check: WAV/EFM 등으로 누락 가능성 차단
const expectedFiles = ['main.js', 'platform/win32Desktop.js'];
for (const f of expectedFiles) {
  if (!existsSync(path.join('dist-electron', f))) {
    console.error(`[build-electron] FAIL: dist-electron/${f} missing`);
    process.exit(1);
  }
}

console.log('Electron build complete');
