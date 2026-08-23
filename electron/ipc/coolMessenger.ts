/**
 * 쿨메신저 쪽지 읽기 IPC.
 *
 * 채널:
 *  - `cool-messenger:available` : 쪽지함을 읽을 수 있는가 (설정 스위치를 켤 때 확인)
 *  - `cool-messenger:list`      : 최근 쪽지 목록 (본문은 앞부분만)
 *  - `cool-messenger:get`       : 쪽지 한 건의 전문
 *  - `cool-messenger:members`   : 교직원 명단 (개인정보 탐지 사전용)
 *
 * ## renderer 는 경로를 넘기지 않는다
 * 쪽지함 위치는 **메인이 직접 정한다**(`defaultMemoDir()`). renderer 가 경로를 고를 수
 * 있으면 이 통로가 곧 "아무 SQLite 파일이나 읽어주는 구멍"이 된다.
 * `oneclickPortal.ts` 가 실행 경로를 renderer 에게 맡기지 않는 것과 같은 이유다.
 *
 * ## 오류를 삼키지 않는다
 * 쿨메신저가 업데이트로 표 구조를 바꾸면 조용히 빈 목록을 주는 대신 오류를 그대로
 * 올려보낸다. 화면이 "쪽지함을 읽지 못했습니다"와 이유를 보여줘야 하기 때문이다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */
import { app, ipcMain } from 'electron';
import {
  defaultMemoDir,
  isCoolMessengerAvailable,
  readCoolMemberNames,
  readCoolMessage,
  readCoolMessages,
  type CoolMessage,
} from '../coolMessengerReader';

/** 목록에 담을 읽은 쪽지 수 (안읽은 쪽지는 이와 무관하게 전부 들어간다) */
const LIST_LIMIT = 30;

/**
 * 개발 중에만 쓰는 쪽지함 경로 바꿔치기.
 *
 * 쿨메신저가 없는 PC에서도 실제 앱으로 전 과정을 확인하려면 가짜 쪽지함을 읽혀야 한다.
 * `npm run cool:demo` 가 만들어 주는 폴더를 여기로 가리킨다.
 *
 * ⚠️ **배포본(`app.isPackaged`)에서는 무시한다.** 이 값을 실전에서 살려 두면
 * "환경변수만 바꾸면 아무 SQLite나 읽어주는 통로"가 되어 §renderer 규칙이 무너진다.
 */
const DEV_MEMO_DIR_ENV = 'SSAMPIN_COOL_MEMO_DIR';

export function resolveMemoDir(): string | null {
  if (!app.isPackaged) {
    const override = process.env[DEV_MEMO_DIR_ENV];
    if (override && override.trim()) return override.trim();
  }
  return defaultMemoDir();
}

/** 쪽지함 위치를 정한다. 못 정하면 기능을 쓸 수 없다. */
function requireMemoDir(): string {
  const dir = resolveMemoDir();
  if (!dir) {
    throw new Error('쪽지함 위치를 찾을 수 없습니다. 윈도우에서만 쓸 수 있는 기능입니다.');
  }
  return dir;
}

export function registerCoolMessengerHandlers(): void {
  ipcMain.handle('cool-messenger:available', (): boolean => {
    // 여기서만은 예외를 삼킨다 — "쓸 수 있나?"라는 질문의 답은 true/false 뿐이다.
    try {
      return isCoolMessengerAvailable(resolveMemoDir());
    } catch {
      return false;
    }
  });

  ipcMain.handle('cool-messenger:list', (): CoolMessage[] => {
    return readCoolMessages(requireMemoDir(), LIST_LIMIT);
  });

  ipcMain.handle('cool-messenger:get', (_event, key: unknown): CoolMessage | null => {
    const messageKey = Number(key);
    if (!Number.isFinite(messageKey)) return null;
    return readCoolMessage(requireMemoDir(), messageKey);
  });

  ipcMain.handle('cool-messenger:members', (): string[] => {
    try {
      return readCoolMemberNames(requireMemoDir());
    } catch {
      return []; // 명단을 못 읽어도 기능은 살아야 한다 — 이름 대조만 못 할 뿐이다
    }
  });
}
