/**
 * useMigrationReport — MigrationReportModal 트리거 Hook (Plan §5.1 B.1, Design §3.3)
 *
 * 책임:
 *  - v1 → v2 마이그레이션 IPC(`multi-survey:migrate-v1-to-v2`) 호출
 *  - 결과 MigrationReport를 메모리 캐시 (모달이 열릴 때까지)
 *  - "다시 안 보기" 토글 (localStorage 키 분리)
 *  - 마이그레이션 진행 중 상태를 `useMultiSurveyV2Store.migrationStatus`로 동기화
 *
 * NOT 책임:
 *  - 자동 트리거 결정: `MultiSurveyToolEntry`가 `useRealtimeToolFlag().enabled === true`일 때 본 hook의 `runMigration`을 호출
 *  - UI 렌더: MigrationReportModal 컴포넌트가 본 hook의 report/dismiss를 구독해 표시 (B.6 worker)
 */

import { useCallback, useState } from 'react';
import type { MigrationReport } from '@domain/entities/multiSurvey/MigrationReport';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';

const DISMISS_KEY = 'ssampin-multi-survey-v2-migration-report-dismissed';

interface ElectronAPIWithMigration {
  multiSurvey?: {
    migrateV1ToV2?: (v1Sessions: unknown[]) => Promise<MigrationReport>;
  };
}

function getMigrationApi(): ((items: unknown[]) => Promise<MigrationReport>) | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: ElectronAPIWithMigration }).electronAPI;
  const fn = api?.multiSurvey?.migrateV1ToV2;
  return typeof fn === 'function' ? fn : null;
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (v) {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } else {
      window.localStorage.removeItem(DISMISS_KEY);
    }
  } catch {
    // localStorage 사용 불가 환경(Electron 일부 컨텍스트)은 무시
  }
}

export interface MigrationReportApi {
  /** 마지막 마이그레이션 결과 (없으면 null) */
  readonly report: MigrationReport | null;
  /** 모달 표시 가능 여부 (report 존재 + 사용자가 "다시 안 보기" 안 누름) */
  readonly shouldShow: boolean;
  /** IPC 호출해 마이그레이션 실행. 결과를 캐시 + migrationStatus 동기화 */
  readonly runMigration: (v1Sessions: unknown[]) => Promise<MigrationReport | null>;
  /** 모달 닫기 (보고서는 유지) */
  readonly dismiss: () => void;
  /** "다시 안 보기" 체크 — 영구 닫기 */
  readonly dismissForever: () => void;
  /** 영구 닫기 해제 (테스트/디버깅용) */
  readonly resetDismissal: () => void;
}

/**
 * Hook 본체. 컴포넌트당 1회만 호출하는 게 안전 (IPC 핸들러 중복 호출 방지).
 */
export function useMigrationReport(): MigrationReportApi {
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [open, setOpen] = useState<boolean>(true);
  const [dismissedForever, setDismissedForever] = useState<boolean>(readDismissed());

  const setMigrationStatus = useMultiSurveyV2Store((s) => s.setMigrationStatus);

  const runMigration = useCallback<MigrationReportApi['runMigration']>(
    async (v1Sessions) => {
      const api = getMigrationApi();
      if (!api) {
        setMigrationStatus('failed');
        return null;
      }
      setMigrationStatus('in_progress');
      try {
        const result = await api(v1Sessions);
        setReport(result);
        setOpen(true);
        setMigrationStatus(result.failedCount === 0 ? 'completed' : 'completed');
        return result;
      } catch (err) {
        setMigrationStatus('failed');
        console.error('[useMigrationReport] 마이그레이션 실패:', err);
        return null;
      }
    },
    [setMigrationStatus],
  );

  const dismiss = useCallback(() => {
    setOpen(false);
  }, []);

  const dismissForever = useCallback(() => {
    setOpen(false);
    setDismissedForever(true);
    writeDismissed(true);
  }, []);

  const resetDismissal = useCallback(() => {
    setDismissedForever(false);
    writeDismissed(false);
  }, []);

  const shouldShow = report !== null && open && !dismissedForever;

  return {
    report,
    shouldShow,
    runMigration,
    dismiss,
    dismissForever,
    resetDismissal,
  };
}
