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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getContentRoot } from '../dataRoot';
import {
  cleanupStaleCoolTempDirs,
  closeCoolReaderSession,
  defaultMemoDir,
  isCoolMessengerAvailable,
  readCoolMemberNames,
  readCoolMessage,
  readCoolMessages,
  type CoolMessage,
} from '../coolMessengerReader';
import { initCoolDiag, coolLog, coolWarn, describeError } from '../coolMessengerDiag';

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

/**
 * 설정 파일에서 쿨메신저 가져오기 스위치를 직접 읽는다 — **main 쪽 잠금장치.**
 *
 * 화면(renderer)도 `enabled` 로 가리지만, 그것만 믿으면 renderer 코드 어디선가 실수로
 * (또는 악의로) IPC를 부르는 순간 쪽지함이 읽힌다. 개인 쪽지를 다루는 통로이므로
 * **읽기의 최종 관문은 파일 접근 권한을 쥔 main** 에 둔다(2026-08-24 UltraQA P2).
 *
 * 설정을 못 읽으면 꺼진 것으로 본다 — 이 기능의 기본값이 꺼짐이기 때문이다.
 */
export function readCoolImportEnabled(settingsFile: string): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return (parsed as Record<string, unknown>)['coolMessengerImportEnabled'] === true;
  } catch {
    return false;
  }
}

/** settings.json 위치 — main.ts 의 getDataDir()와 같은 규칙(자료 루트/data). */
function settingsFilePath(): string {
  return join(getContentRoot(), 'data', 'settings.json');
}

function assertImportEnabled(): void {
  if (!readCoolImportEnabled(settingsFilePath())) {
    throw new Error(
      '쿨메신저 가져오기가 설정에서 꺼져 있습니다. 설정 > 실험실 기능에서 켠 뒤 다시 시도해 주세요.',
    );
  }
}

export function registerCoolMessengerHandlers(): void {
  // 실패 원인을 파일에 남긴다 — 화면은 이유가 무엇이든 같은 제목만 보여준다.
  // 진단이 실패해도 가져오기 기능은 살아야 하므로 삼킨다(로그는 콘솔로만 간다).
  try {
    initCoolDiag(app.getPath('userData'));
  } catch {
    // userData 를 못 얻는 환경 — 파일 기록만 포기한다
  }

  // 지난 실행이 강제 종료돼 남은 쪽지 사본(%TEMP%)을 지운다 — 개인정보 청소.
  cleanupStaleCoolTempDirs();

  // 세션 복사본(짧은 재사용 캐시)이 남아 있으면 종료 때 닫고 지운다 — 개인정보 청소.
  app.on('will-quit', () => closeCoolReaderSession());

  ipcMain.handle('cool-messenger:available', (): boolean => {
    // 여기서만은 예외를 삼킨다 — "쓸 수 있나?"라는 질문의 답은 true/false 뿐이다.
    // 설정 스위치도 확인하지 않는다 — 스위치를 **켜기 전에** 켤 수 있는지 묻는 통로라서
    // 게이트를 걸면 영원히 못 켠다. 쪽지 내용은 한 글자도 나가지 않는다(true/false 뿐).
    try {
      const ok = isCoolMessengerAvailable(resolveMemoDir());
      coolLog('쪽지함 사용 가능 확인', { 결과: ok });
      return ok;
    } catch (err) {
      coolWarn('쪽지함 사용 가능 확인 실패', describeError(err));
      return false;
    }
  });

  ipcMain.handle('cool-messenger:list', (): CoolMessage[] => {
    try {
      assertImportEnabled();
      const list = readCoolMessages(requireMemoDir(), LIST_LIMIT);
      coolLog('목록 조회 성공', { 건수: list.length });
      return list;
    } catch (err) {
      // 화면은 "쪽지함을 읽지 못했습니다."만 크게 보여준다 — 진짜 이유는 여기 남는다.
      coolWarn('목록 조회 실패', describeError(err));
      throw err;
    }
  });

  ipcMain.handle('cool-messenger:get', (_event, key: unknown): CoolMessage | null => {
    try {
      assertImportEnabled();
      const messageKey = Number(key);
      if (!Number.isFinite(messageKey)) return null;
      return readCoolMessage(requireMemoDir(), messageKey);
    } catch (err) {
      coolWarn('쪽지 전문 조회 실패', describeError(err));
      throw err;
    }
  });

  ipcMain.handle('cool-messenger:members', (): string[] => {
    try {
      assertImportEnabled();
      return readCoolMemberNames(requireMemoDir());
    } catch (err) {
      coolWarn('교직원 명단 조회 실패', describeError(err));
      return []; // 명단을 못 읽어도 기능은 살아야 한다 — 이름 대조만 못 할 뿐이다
    }
  });
}
