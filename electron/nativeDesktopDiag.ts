/**
 * native-desktop / widget 진단 로그 fanout helper.
 *
 * Packaged Electron에서는 main process console.log가 stderr로 가서 cmd 없이는 안 보이고,
 * DevTools 콘솔에는 renderer process 로그만 보인다. 이 헬퍼는 진단 로그를 다음 3곳에
 * 동시에 발사한다:
 *
 *   1. console.log/console.warn (개발자 도구 OS stdout — 기존 동작 유지)
 *   2. 모든 살아있는 BrowserWindow의 webContents → IPC 'native-desktop:diag' →
 *      preload `onNativeDesktopDiag` → renderer `console.log` (DevTools에서 가시)
 *   3. `app.getPath('userData')/native-desktop-diag.log` 파일 append
 *      → 사용자가 메모장으로 열어 그대로 공유 가능
 *
 * **사용 정책**
 *   - 새 진단 로그는 `diagLog`/`diagWarn`을 쓴다.
 *   - 기존 `console.log('[native-desktop][diag] …')` / `console.log('[widget][diag] …')`
 *     호출들은 본 헬퍼로 점진 교체한다. prefix는 헬퍼가 자동 부착한다.
 *   - 디버깅 종료 후 본 모듈 + 호출처를 일괄 제거하거나 verbose flag로 묶는다.
 *
 * **격리 원칙**
 *   - app/BrowserWindow를 직접 import하지 않는다 — circular import + ready 시점 의존
 *     문제를 피하기 위해 main.ts가 init 시 getter 함수를 주입한다.
 *   - 미초기화 상태에서도 console.log는 항상 동작한다 (graceful).
 *   - 파일 쓰기 실패는 silently swallow (진단 자체가 실패해도 main 흐름 영향 없음).
 */

import fs from 'fs';
import path from 'path';

// 인스턴스 의존성 — main.ts가 app.whenReady 후 init으로 주입.
// 명시적 unknown 타입 + 런타임 가드로 처리해 BrowserWindow 직접 import를 피한다.
type WebContentsLike = {
  isDestroyed: () => boolean;
  send: (channel: string, payload: unknown) => void;
};
type WindowLike = {
  isDestroyed: () => boolean;
  webContents: WebContentsLike;
};

let getAllWindowsImpl: (() => readonly WindowLike[]) | null = null;
let logFilePath: string | null = null;
let sessionStarted = false;

/**
 * main.ts가 app.whenReady() 후 1회 호출해야 한다.
 *
 * @param windowsGetter `BrowserWindow.getAllWindows()` 호출을 캡슐화한 함수.
 *   미초기화면 IPC fanout은 skip되고 console.log만 동작한다.
 * @param userDataPath `app.getPath('userData')`. 파일 로깅 경로 베이스.
 *   미초기화면 파일 fanout은 skip된다.
 */
export function initNativeDesktopDiag(
  windowsGetter: () => readonly WindowLike[],
  userDataPath: string,
): void {
  getAllWindowsImpl = windowsGetter;
  logFilePath = path.join(userDataPath, 'native-desktop-diag.log');
  sessionStarted = false; // 다음 diagLog 호출 시 session 헤더 기록
}

function ensureSessionHeader(): void {
  if (sessionStarted || !logFilePath) return;
  sessionStarted = true;
  try {
    const header = [
      '',
      '═══════════════════════════════════════════════════════════',
      `[session-start] ${new Date().toISOString()} — pid=${process.pid}`,
      `[session-start] platform=${process.platform} arch=${process.arch}`,
      `[session-start] electron=${process.versions.electron ?? 'unknown'} node=${process.versions.node}`,
      '═══════════════════════════════════════════════════════════',
      '',
    ].join('\n');
    fs.appendFileSync(logFilePath, header, { encoding: 'utf8' });
  } catch {
    // 파일 시스템 실패 무시 — 진단 자체가 main 흐름을 막아선 안 됨.
  }
}

function appendToFile(line: string): void {
  if (!logFilePath) return;
  ensureSessionHeader();
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(logFilePath, `${ts} ${line}\n`, { encoding: 'utf8' });
  } catch {
    // 무시
  }
}

function broadcastToRenderers(message: string, args: readonly unknown[]): void {
  if (!getAllWindowsImpl) return;
  let wins: readonly WindowLike[];
  try {
    wins = getAllWindowsImpl();
  } catch {
    return;
  }
  for (const win of wins) {
    try {
      if (win.isDestroyed()) continue;
      const wc = win.webContents;
      if (!wc || wc.isDestroyed()) continue;
      wc.send('native-desktop:diag', {
        message,
        args: args.length > 0 ? args : undefined,
      });
    } catch {
      // 윈도우 1개 실패가 다른 윈도우 fanout을 막지 않도록 흡수
    }
  }
}

/**
 * 진단 로그 송출. 콘솔 + IPC + 파일 3-way fanout.
 *
 * @param scope 로그 그룹 prefix. 보통 'native-desktop' 또는 'widget'.
 * @param message 사람이 읽을 메시지 (이미 여기 prefix가 들어있으면 자동으로 정제하지 않음 — 호출자가 깨끗한 본문만 전달할 것).
 * @param args 부가 데이터 (handle 값, 객체 등). console.log에 spread로 전달되며 IPC에는 직렬화되어 함께 송출된다.
 */
export function diagLog(scope: 'native-desktop' | 'widget', message: string, ...args: unknown[]): void {
  const fullMsg = `[${scope}][diag] ${message}`;
  // 1. console (기존 동작)
  console.log(fullMsg, ...args);
  // 2. IPC → renderer DevTools
  broadcastToRenderers(fullMsg, args);
  // 3. 파일
  let extra = '';
  if (args.length > 0) {
    try {
      extra = ' ' + args.map((a) => safeStringify(a)).join(' ');
    } catch {
      extra = ' [args-serialize-failed]';
    }
  }
  appendToFile(fullMsg + extra);
}

/**
 * `diagLog`의 warn 변형. console.warn으로 라우팅 (스타일 구분용).
 */
export function diagWarn(scope: 'native-desktop' | 'widget', message: string, ...args: unknown[]): void {
  const fullMsg = `[${scope}][diag][warn] ${message}`;
  console.warn(fullMsg, ...args);
  broadcastToRenderers(fullMsg, args);
  let extra = '';
  if (args.length > 0) {
    try {
      extra = ' ' + args.map((a) => safeStringify(a)).join(' ');
    } catch {
      extra = ' [args-serialize-failed]';
    }
  }
  appendToFile(fullMsg + extra);
}

function safeStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (value instanceof Error) {
    return `Error(${value.name}: ${value.message})`;
  }
  try {
    return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v));
  } catch {
    return '[unserializable]';
  }
}
