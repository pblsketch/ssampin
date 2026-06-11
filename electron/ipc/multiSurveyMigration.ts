/**
 * v1 → v2 마이그레이션 IPC 핸들러 (Design §1.1 electron/ipc 레이어, worker-2 영역).
 *
 * Renderer가 'multi-survey:migrate-v1-to-v2' 채널로 v1 배열을 전송하면
 * 백업 → 변환 → MigrationReport 반환.
 *
 * Phase A: 자동 실행 안 함 — Renderer가 IPC로 명시적으로 호출.
 * STUDENT_WAVE / TOGGLE_FOCUS_MODE: Phase B로 DEFERRED (worker-1 open issue #4).
 */

import { ipcMain, BrowserWindow } from 'electron';
import { migrateV1ToV2 } from '../../src/adapters/multiSurvey/migration/v1ToV2';
import { writeBackup } from '../../src/adapters/multiSurvey/migration/backupWriter';
import type { MigrationReport, FailedMigrationItem } from '../../src/domain/entities/multiSurvey';

// ──────────────────────────────────────────────
// Helper: extract sourceId from unknown v1 item
// ──────────────────────────────────────────────

function extractSourceId(item: unknown): string {
  if (typeof item === 'object' && item !== null) {
    const id = (item as Record<string, unknown>)['id'];
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return '(unknown)';
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * 'multi-survey:migrate-v1-to-v2' IPC 핸들러를 등록한다.
 *
 * @param _mainWindow  BrowserWindow (향후 progress event 전송용 — Phase B에서 사용)
 * @param getAppVersion  현재 앱 버전 문자열 반환 함수 (metadata.json에 기록)
 */
export function registerMultiSurveyMigrationHandler(
  _mainWindow: BrowserWindow,
  getAppVersion: () => string,
): void {
  ipcMain.handle(
    'multi-survey:migrate-v1-to-v2',
    async (_event, v1Sessions: unknown[]): Promise<MigrationReport> => {
      const attemptedAt = new Date().toISOString();
      const appVersion = getAppVersion();

      // Step 1: 백업 먼저 (변환 실패해도 원본 보관)
      let backupPath = '';
      try {
        const result = await writeBackup(v1Sessions, appVersion);
        backupPath = result.backupPath;
      } catch (backupErr) {
        // 백업 실패 시에도 변환은 계속 진행하되 backupPath는 빈 문자열
        console.error('[multiSurveyMigration] 백업 실패:', backupErr);
      }

      // Step 2: 각 v1 항목을 v2로 변환
      const successList: ReturnType<typeof migrateV1ToV2>[] = [];
      const failedItems: FailedMigrationItem[] = [];

      for (const original of v1Sessions) {
        try {
          const v2 = migrateV1ToV2(original);
          successList.push(v2);
        } catch (err) {
          failedItems.push({
            sourceId: extractSourceId(original),
            reason: err instanceof Error ? err.message : String(err),
            preservedRaw: original,
          });
        }
      }

      // Step 3: MigrationReport 조립
      const report: MigrationReport = {
        attemptedAt,
        totalCount: v1Sessions.length,
        successCount: successList.length,
        failedCount: failedItems.length,
        failedItems,
        backupPath,
      };

      return report;
    },
  );
}
