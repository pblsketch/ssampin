/**
 * Cloudflare Quick Tunnel 관리 모듈
 *
 * 무료 Cloudflare Tunnel을 사용하여 로컬 서버를
 * 인터넷에 공개한다 (https://xxx.trycloudflare.com).
 * 학생들이 같은 WiFi 없이도 모바일 데이터로 접속 가능.
 */
import fs from 'fs';
import { app } from 'electron';
import { Tunnel, bin, install, use } from 'cloudflared';

let activeTunnel: Tunnel | null = null;

/**
 * 패키지된 Electron 앱에서는 asar 내부 경로가 실제 파일시스템과 다르다.
 * cloudflared 바이너리는 app.asar.unpacked에 있으므로 경로를 보정한다.
 */
function getActualBinPath(): string {
  if (app.isPackaged) {
    return bin.replace('app.asar', 'app.asar.unpacked');
  }
  return bin;
}

/** cloudflared 바이너리가 설치되어 있는지 확인 */
export function isTunnelAvailable(): boolean {
  const actualBin = getActualBinPath();
  return fs.existsSync(actualBin);
}

/** 바이너리 설치 (첫 사용 시, ~40MB 다운로드) */
export async function installTunnel(): Promise<void> {
  const actualBin = getActualBinPath();
  if (!fs.existsSync(actualBin)) {
    await install(actualBin);
  }
}

/** 터널 시작 → 공개 URL 반환 */
export async function openTunnel(localPort: number): Promise<string> {
  await installTunnel();
  closeTunnel();

  // 패키지된 앱에서 바이너리 경로 보정
  use(getActualBinPath());

  const t = Tunnel.quick(`http://localhost:${localPort}`);

  activeTunnel = t;

  // stderr 로그 수집 (디버깅용)
  let lastStderr = '';
  t.on('stderr', (data: string) => {
    lastStderr = data;
  });

  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`터널 연결 시간 초과 (30초). ${lastStderr}`));
    }, 30000);

    t.once('url', (url: string) => {
      clearTimeout(timeout);
      resolve(url);
    });

    t.once('error', (err: Error) => {
      clearTimeout(timeout);
      reject(new Error(`터널 오류: ${err.message}`));
    });

    t.once('exit', (code: number | null) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`cloudflared 종료 (코드: ${code}). ${lastStderr}`));
      }
    });
  });

  return publicUrl;
}

/** 터널 종료 */
export function closeTunnel(): void {
  if (activeTunnel) {
    activeTunnel.stop();
    activeTunnel = null;
  }
}
