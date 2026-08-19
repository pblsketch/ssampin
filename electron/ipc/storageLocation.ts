/**
 * 저장 공간 IPC — 자료 폴더 위치 변경 + 임시 파일 정리
 *
 * 렌더러(설정 > 백업/복원 화면)에서 부르는 창구다. 실제 로직은 `electron/dataRoot.ts`에 있고
 * 여기서는 다이얼로그 표시와 결과 전달만 담당한다.
 *
 * ## 재시작이 필요한 이유
 * 협업 보드·수업 세션 등 일부 모듈은 앱이 켜질 때 저장 경로를 한 번 읽어 기억한다.
 * 그래서 위치를 바꾼 뒤에는 반드시 재시작해야 모든 기능이 새 폴더를 본다.
 * `needsRestart: true`를 돌려주고 화면이 안내하도록 한다.
 */
import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  getContentRootState,
  measureUsage,
  clearCaches,
  moveContentTo,
  resetToDefault,
  validateTarget,
  CONTENT_DIRS,
  type ContentRootReason,
} from '../dataRoot';

export interface StorageStatePayload {
  readonly contentRoot: string;
  readonly defaultRoot: string;
  readonly configuredRoot: string | null;
  readonly reason: ContentRootReason;
  readonly isCustom: boolean;
  readonly contentBytes: number;
  readonly cacheBytes: number;
  readonly contentDirs: readonly { name: string; bytes: number }[];
}

function buildState(): StorageStatePayload {
  const rootState = getContentRootState();
  const usage = measureUsage();
  return {
    contentRoot: rootState.contentRoot,
    defaultRoot: rootState.defaultRoot,
    configuredRoot: rootState.configuredRoot,
    reason: rootState.reason,
    isCustom: rootState.reason === 'custom',
    contentBytes: usage.contentBytes,
    cacheBytes: usage.cacheBytes,
    contentDirs: usage.contentDirs.map((d) => ({ name: d.name, bytes: d.bytes })),
  };
}

export function registerStorageLocationHandlers(getParent: () => BrowserWindow | null): void {
  /** 현재 위치 + 용량. 화면 진입/작업 후 갱신용. */
  ipcMain.handle('storage:getState', (): StorageStatePayload => buildState());

  /** 자료 폴더를 OS 탐색기로 연다. */
  ipcMain.handle(
    'storage:openContentFolder',
    async (): Promise<{ ok: boolean; reason?: string }> => {
      const { contentRoot } = getContentRootState();
      try {
        if (!fs.existsSync(contentRoot)) fs.mkdirSync(contentRoot, { recursive: true });
      } catch {
        return { ok: false, reason: '폴더를 만들 수 없어요.' };
      }
      const errMsg = await shell.openPath(contentRoot);
      if (errMsg) return { ok: false, reason: errMsg };
      return { ok: true };
    },
  );

  /**
   * 폴더 선택 → 검증 → 이사.
   * 사용자가 고른 폴더 바로 아래에 data/·forms/… 를 만들지 않고, 실수를 줄이려고
   * `쌤핀 자료` 하위 폴더를 자동으로 만들어 그 안에 넣는다(예: D:\학교\쌤핀 자료\data).
   */
  ipcMain.handle(
    'storage:chooseAndMove',
    async (): Promise<{
      canceled: boolean;
      ok?: boolean;
      message?: string;
      contentRoot?: string;
      preservedOriginals?: readonly string[];
      needsRestart?: boolean;
      state?: StorageStatePayload;
    }> => {
      const parent = getParent();
      const options = {
        title: '쌤핀 자료를 보관할 폴더 선택',
        buttonLabel: '이 폴더 사용',
        properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      };
      const picked = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);

      if (picked.canceled || picked.filePaths.length === 0) return { canceled: true };
      const chosen = picked.filePaths[0];
      if (chosen === undefined) return { canceled: true };

      // 고른 폴더가 이미 쌤핀 자료 폴더면 그대로, 아니면 하위에 전용 폴더를 만든다.
      const alreadyContent = CONTENT_DIRS.some((n) => fs.existsSync(path.join(chosen, n)));
      const target = alreadyContent ? chosen : path.join(chosen, '쌤핀 자료');

      try {
        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
      } catch {
        return {
          canceled: false,
          ok: false,
          message: '선택한 위치에 폴더를 만들 수 없어요. 다른 곳을 골라 주세요.',
        };
      }

      const check = validateTarget(target);
      if (!check.ok) {
        return {
          canceled: false,
          ok: false,
          message: check.message ?? '이 폴더는 사용할 수 없어요.',
        };
      }

      const result = moveContentTo(target);
      if (!result.ok) {
        return { canceled: false, ok: false, message: result.message ?? '자료를 옮기지 못했어요.' };
      }

      return {
        canceled: false,
        ok: true,
        contentRoot: result.contentRoot,
        preservedOriginals: result.preservedOriginals,
        needsRestart: true,
        state: buildState(),
      };
    },
  );

  /**
   * 기본 위치로 되돌리기 — 자료를 기본 폴더로 되옮긴다.
   * 포인터만 지우면 새 폴더의 자료가 보이지 않게 되므로, 반드시 실제 이사를 먼저 한다.
   */
  ipcMain.handle(
    'storage:resetLocation',
    async (): Promise<{
      ok: boolean;
      message?: string;
      needsRestart?: boolean;
      state?: StorageStatePayload;
    }> => {
      const rootState = getContentRootState();
      if (rootState.reason === 'default') {
        return { ok: true, state: buildState() };
      }

      // 기본 위치에 같은 이름의 폴더가 남아 있으면(이전 이사의 원본) 충돌한다.
      const blocked = CONTENT_DIRS.filter((n) =>
        fs.existsSync(path.join(rootState.defaultRoot, n)),
      );
      if (blocked.length > 0) {
        return {
          ok: false,
          message: `기본 위치에 예전 자료(${blocked.join(', ')})가 남아 있어요. 먼저 정리한 뒤 다시 시도해 주세요.`,
        };
      }

      const result = moveContentTo(rootState.defaultRoot);
      if (!result.ok) {
        return { ok: false, message: result.message ?? '기본 위치로 되돌리지 못했어요.' };
      }
      // 기본 위치로 돌아왔으니 포인터를 지워 '사용자 지정 없음' 상태로 만든다.
      resetToDefault();
      return { ok: true, needsRestart: true, state: buildState() };
    },
  );

  /** 임시 파일 정리 — 화면 캐시만 지운다. 로그인 상태·자료는 건드리지 않는다. */
  ipcMain.handle(
    'storage:clearCache',
    (): {
      ok: boolean;
      freedBytes: number;
      skipped: readonly string[];
      state: StorageStatePayload;
    } => {
      const result = clearCaches();
      return {
        ok: result.ok,
        freedBytes: result.freedBytes,
        skipped: result.skipped,
        state: buildState(),
      };
    },
  );

  /** 재시작 — 위치 변경 후 화면의 '지금 다시 시작' 버튼용. */
  ipcMain.handle('storage:relaunch', (): void => {
    app.relaunch();
    app.exit(0);
  });
}
