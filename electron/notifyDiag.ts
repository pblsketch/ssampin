/**
 * 알림 진단 로그 — `userData/notify-diag.log` 파일 append.
 *
 * **왜 파일인가.** 패키징된 앱에서 main 프로세스의 `console.log` 는 stderr 로 가서
 * 사용자가 볼 수 없다(`electron/nativeDesktopDiag.ts` 머리 주석이 같은 사실을 적어 놓았다).
 * 게다가 알림은 **조용히 실패하는 기능**이라 — 안 울린 알림은 아무도 신고하지 않는다 —
 * "울렸어야 했는데 안 울렸다"를 나중에 확인할 수단이 없으면 사고를 영원히 못 찾는다.
 *
 * ★ **여기서 화면(진단 패널)은 판정 수단이 될 수 없다.** 콜드 부팅이 잘 됐는지 보려고
 *   설정 화면을 여는 순간 메인 렌더러가 살아나 `'todo'` 칸을 자기 계산으로 덮어쓴다.
 *   **확인하는 행위가 증거를 지운다.** 그래서 이 파일이 정본이다.
 *
 * 실패는 전부 삼킨다 — 진단이 실패해도 앱이 멈추면 안 된다.
 */

import fs from 'fs';
import path from 'path';

let logFilePath: string | null = null;
let sessionStarted = false;

/** main.ts 가 `app.whenReady()` 후 1회 호출한다. 미초기화면 콘솔만 동작한다. */
export function initNotifyDiag(userDataPath: string): void {
  logFilePath = path.join(userDataPath, 'notify-diag.log');
  sessionStarted = false; // 다음 기록 때 세션 헤더를 남긴다
}

function ensureSessionHeader(): void {
  if (sessionStarted || !logFilePath) return;
  sessionStarted = true;
  try {
    const header = [
      '',
      '═══════════════════════════════════════════════════════════',
      `[session-start] ${new Date().toISOString()} — pid=${process.pid}`,
      `[session-start] platform=${process.platform} electron=${process.versions.electron ?? 'unknown'}`,
      '═══════════════════════════════════════════════════════════',
      '',
    ].join('\n');
    fs.appendFileSync(logFilePath, header, { encoding: 'utf8' });
  } catch {
    // 파일 시스템 실패 무시 — 진단이 main 흐름을 막아선 안 된다.
  }
}

function append(line: string): void {
  if (!logFilePath) return;
  ensureSessionHeader();
  try {
    fs.appendFileSync(logFilePath, `${new Date().toISOString()} ${line}\n`, { encoding: 'utf8' });
  } catch {
    // 무시
  }
}

function format(message: string, data?: unknown): string {
  if (data === undefined) return message;
  try {
    return `${message} ${JSON.stringify(data)}`;
  } catch {
    return `${message} [직렬화 실패]`;
  }
}

/** 평상시 진단 한 줄. 콘솔 + 파일. */
export function notifyLog(message: string, data?: unknown): void {
  const line = `[notify] ${format(message, data)}`;
  console.log(line);
  append(line);
}

/** 문제 있는 상황. 콘솔은 warn 으로 갈라 놓는다. */
export function notifyWarn(message: string, data?: unknown): void {
  const line = `[notify][warn] ${format(message, data)}`;
  console.warn(line);
  append(line);
}

/** 테스트에서 초기화 상태를 되돌린다. */
export function __resetNotifyDiagForTest(): void {
  logFilePath = null;
  sessionStarted = false;
}
