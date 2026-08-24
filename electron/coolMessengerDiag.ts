/**
 * 쿨메신저 가져오기 진단 로그 — `userData/coolmessenger-diag.log` 파일 append.
 *
 * **왜 파일인가.** 패키징된 앱에서 main 프로세스의 `console.log` 는 stderr 로 가서
 * 선생님이 볼 수 없다(`electron/notifyDiag.ts` 가 같은 사실을 적어 놓았다).
 * 이 기능은 **화면에 제목만 보여주고 원인을 삼킨다** — 오류 창의 큰 글씨
 * "쪽지함을 읽지 못했습니다."는 실패 이유가 무엇이든 똑같이 뜬다. 실제로
 * 2026-08-24 신고에서 원인을 되물을 수 없어 코드만 보고 추정해야 했다.
 * 그 일이 반복되지 않도록 원인을 이 파일에 남긴다.
 *
 * ## 남기지 않는 것 (절대)
 * 쪽지 본문·제목·보낸사람·교직원 이름은 **한 글자도 남기지 않는다.** 개인 쪽지다.
 * 전체 경로도 남기지 않는다 — 계정명이 들어 있다(`scrub()` 이 지운다).
 * 남기는 것은 표·칸 이름, 건수, 파일 크기, 오류 코드처럼 **구조에 대한 사실**뿐이다.
 *
 * 실패는 전부 삼킨다 — 진단이 실패해도 기능이 멈추면 안 된다.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

let logFilePath: string | null = null;
let sessionStarted = false;

/** `registerCoolMessengerHandlers()` 가 1회 호출한다. 미초기화면 콘솔만 동작한다. */
export function initCoolDiag(userDataPath: string): void {
  logFilePath = join(userDataPath, 'coolmessenger-diag.log');
  sessionStarted = false; // 다음 기록 때 세션 머리글을 남긴다
}

/**
 * 로그에서 전체 경로를 지운다 — `EBUSY: … copyfile 'C:\Users\홍길동\…'` 처럼
 * Node 의 파일 오류 원문에는 **계정명이 들어간 전체 경로**가 붙는다.
 */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z]:[\\/][^\s'"]*/g, '<경로>') // 드라이브 문자로 시작하는 경로
    .replace(/\\{2}[^\s'"]+/g, '<경로>'); // 네트워크 공유 경로
}

function ensureSessionHeader(): void {
  if (sessionStarted || !logFilePath) return;
  sessionStarted = true;
  try {
    appendFileSync(
      logFilePath,
      [
        '',
        '═══════════════════════════════════════════════════════════',
        `[session-start] ${new Date().toISOString()} — pid=${process.pid}`,
        `[session-start] platform=${process.platform} electron=${process.versions.electron ?? 'unknown'}`,
        '═══════════════════════════════════════════════════════════',
        '',
      ].join('\n'),
      { encoding: 'utf8' },
    );
  } catch {
    // 파일 시스템 실패 무시 — 진단이 main 흐름을 막아선 안 된다
  }
}

function append(line: string): void {
  if (!logFilePath) return;
  ensureSessionHeader();
  try {
    appendFileSync(logFilePath, `${new Date().toISOString()} ${line}\n`, { encoding: 'utf8' });
  } catch {
    // 무시
  }
}

function format(message: string, data?: unknown): string {
  if (data === undefined) return scrub(message);
  try {
    return scrub(`${message} ${JSON.stringify(data)}`);
  } catch {
    return `${scrub(message)} [직렬화 실패]`;
  }
}

/** 평상시 진단 한 줄. */
export function coolLog(message: string, data?: unknown): void {
  const line = `[cool] ${format(message, data)}`;
  console.log(line);
  append(line);
}

/** 문제 있는 상황. */
export function coolWarn(message: string, data?: unknown): void {
  const line = `[cool][warn] ${format(message, data)}`;
  console.warn(line);
  append(line);
}

/** 오류에서 로그에 남겨도 되는 부분만 뽑는다 (본문·경로 없음). */
export function describeError(err: unknown): { 종류: string; 코드: string; 내용: string } {
  const e = err as NodeJS.ErrnoException | null;
  return {
    종류: err instanceof Error ? err.name : typeof err,
    코드: e?.code ?? '-',
    내용: scrub(err instanceof Error ? err.message : String(err)).slice(0, 300),
  };
}

/** 테스트에서 초기화 상태를 되돌린다. */
export function __resetCoolDiagForTest(): void {
  logFilePath = null;
  sessionStarted = false;
}
