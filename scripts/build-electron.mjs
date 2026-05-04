import { build } from 'esbuild';
import { readdirSync, statSync } from 'fs';
import path from 'path';

// 최상위 electron/*.ts + electron/platform/*.ts (native FFI 같은 분리 모듈) 수집.
// 추가 하위 디렉토리는 명시적으로 포함시킨다 (전체 재귀가 아니라 의도된 path 만).
function collectEntryPoints() {
  const entries = [];
  for (const f of readdirSync('electron')) {
    const full = path.join('electron', f);
    if (statSync(full).isFile() && f.endsWith('.ts')) {
      entries.push(full);
    }
  }
  // platform/ — Win32 FFI wrapper (lazy require 대상)
  const platformDir = path.join('electron', 'platform');
  try {
    for (const f of readdirSync(platformDir)) {
      const full = path.join(platformDir, f);
      if (statSync(full).isFile() && f.endsWith('.ts')) {
        entries.push(full);
      }
    }
  } catch {
    // platform/ 디렉토리가 없으면 무시
  }
  return entries;
}

const entryPoints = collectEntryPoints();

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
  // undici: Node 18+ 내장 모듈. 번들 불필요, 런타임에 node의 내장으로 로드.
  // koffi: native FFI 모듈. prebuilt binary (.node) 를 require.resolve 로 동적 로드하므로
  //   번들에 포함하면 Windows DLL 경로가 깨진다. external + asarUnpack 조합 필수.
  external: ['electron', 'electron-updater', 'y-leveldb', 'undici', 'koffi'],
  sourcemap: false,
});

console.log('Electron build complete');
