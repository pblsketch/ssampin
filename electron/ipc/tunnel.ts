/**
 * Cloudflare Quick Tunnel 관리 모듈
 *
 * 무료 Cloudflare Tunnel을 사용하여 로컬 서버를
 * 인터넷에 공개한다 (https://xxx.trycloudflare.com).
 * 학생들이 같은 WiFi 없이도 모바일 데이터로 접속 가능.
 */
import fs from 'fs';
import { Tunnel, bin, install } from 'cloudflared';

let activeTunnel: Tunnel | null = null;

/** cloudflared 바이너리가 설치되어 있는지 확인 */
export function isTunnelAvailable(): boolean {
  return fs.existsSync(bin);
}

/** 바이너리 설치 (첫 사용 시, ~40MB 다운로드) */
export async function installTunnel(): Promise<void> {
  if (!fs.existsSync(bin)) {
    await install(bin);
  }
}

/** 터널 시작 → 공개 URL 반환 */
export async function openTunnel(localPort: number): Promise<string> {
  await installTunnel();
  closeTunnel();

  const t = Tunnel.quick(`http://localhost:${localPort}`, {
    '--no-autoupdate': true,
  });

  activeTunnel = t;

  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('터널 연결 시간 초과 (30초)'));
    }, 30000);

    t.once('url', (url: string) => {
      clearTimeout(timeout);
      resolve(url);
    });

    t.once('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
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
