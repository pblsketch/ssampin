/**
 * Cloudflare Quick Tunnel 관리 모듈
 *
 * 무료 Cloudflare Tunnel을 사용하여 로컬 서버를
 * 인터넷에 공개한다 (https://xxx.trycloudflare.com).
 * 학생들이 같은 WiFi 없이도 모바일 데이터로 접속 가능.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Tunnel, bin, install, use } from 'cloudflared';

let activeTunnel: Tunnel | null = null;

/**
 * 패키지된 앱에서 asar.unpacked 경로(C:\Program Files\...)는 쓰기 권한이 없어
 * 첫 설치 시 EPERM 오류가 난다. 쓰기 가능한 userData 경로로 설치/다운로드한다.
 *
 * 호환성: 이전 버전에서 이미 asar.unpacked에 바이너리가 설치된 사용자는
 * 그 경로를 그대로 사용한다(재다운로드 방지).
 */
function getUnpackedBinPath(): string {
  return bin.replace('app.asar', 'app.asar.unpacked');
}

function getUserDataBinPath(): string {
  const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(app.getPath('userData'), 'bin', binName);
}

/**
 * 실제 사용할 바이너리 경로를 결정한다.
 * - 개발 모드: cloudflared 패키지 기본 경로
 * - 패키지 모드: userData 우선, 이전 버전 호환을 위해 asar.unpacked 도 체크
 */
function getActualBinPath(): string {
  if (!app.isPackaged) {
    return bin;
  }
  const userDataBin = getUserDataBinPath();
  if (fs.existsSync(userDataBin)) {
    return userDataBin;
  }
  // 이전 버전 호환: 이미 asar.unpacked에 설치된 사용자는 그 경로 유지
  const unpackedBin = getUnpackedBinPath();
  if (fs.existsSync(unpackedBin)) {
    return unpackedBin;
  }
  // 신규 설치 대상 경로 (쓰기 가능한 userData)
  return userDataBin;
}

/** cloudflared 바이너리가 설치되어 있는지 확인 */
export function isTunnelAvailable(): boolean {
  if (!app.isPackaged) {
    return fs.existsSync(bin);
  }
  return fs.existsSync(getUserDataBinPath()) || fs.existsSync(getUnpackedBinPath());
}

/** 바이너리 설치 (첫 사용 시, ~40MB 다운로드) */
export async function installTunnel(): Promise<void> {
  if (isTunnelAvailable()) {
    return;
  }
  const targetBin = app.isPackaged ? getUserDataBinPath() : bin;
  fs.mkdirSync(path.dirname(targetBin), { recursive: true });
  await install(targetBin);
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
