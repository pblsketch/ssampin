import { spawn } from 'child_process';
import { createRequire } from 'module';
import http from 'http';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const DEV_SERVER_URL = 'http://localhost:5173';

// Wait for Vite dev server to be ready
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeout) {
            reject(new Error('Vite dev server did not start in time'));
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

await waitForServer(DEV_SERVER_URL);

// Remove ELECTRON_RUN_AS_NODE (set by VS Code) so Electron runs in browser mode
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.VITE_DEV_SERVER_URL = DEV_SERVER_URL;

// 별도 데이터 폴더로 실행 옵션 (본인 데이터 보호용).
// 우선순위: process.argv (--user-data-dir=...) > env (SSAMPIN_USER_DATA_DIR).
// 사용 예: npm run electron:dev:fresh
//        또는 SSAMPIN_USER_DATA_DIR=.dev-data npm run electron:dev
const electronArgs = ['.'];
const argvUserDataDir = process.argv.find((a) => a.startsWith('--user-data-dir='));
const userDataDir = argvUserDataDir
  ? argvUserDataDir.slice('--user-data-dir='.length)
  : process.env.SSAMPIN_USER_DATA_DIR;
if (userDataDir) {
  electronArgs.push(`--user-data-dir=${userDataDir}`);
  console.log(`\n[ssampin-dev] 별도 데이터 폴더로 실행: ${userDataDir}\n`);
}

spawn(electronPath, electronArgs, { stdio: 'inherit', env }).on('close', (code) =>
  process.exit(code ?? 1),
);
