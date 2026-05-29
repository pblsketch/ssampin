/**
 * MultiSurveyToolEntry — V1 ↔ V2 라우팅 진입점 (Plan §5.2 D5, Design §3.2, Phase C C.0)
 *
 * 책임:
 *  - flag.enabled 기준 V1/V2 분기 (useRealtimeToolFlag — flag 호출 ≤3 약속의 **3번째 위치**)
 *  - v2 첫 진입 시 v1 데이터 감지 → 자동 마이그레이션 트리거
 *  - V2 진입 시 MigrationReportModal 렌더
 *  - opt-in 토글 UI 노출 (Phase C C.4 — "새 도구 사용해보기")
 *
 * NOT 책임:
 *  - V2 메이커/콘솔/공유 화면 자체 라우팅 — `MakerLayout` 등 sub-route는 본 진입점 하위에서 결정 (후속 작업)
 *  - V1 데이터 영속 로드 — `useToolTemplateStore` 등 기존 V1 store가 그대로 담당
 *  - flag 영속 — `useMultiSurveyV2Store`가 zustand persist로 처리
 *
 * 보호 파일 가드: useSettingsStore / useModalCoordinatorStore 절대 import 금지.
 * Phase D(v2.1.1) flag 제거 시 본 컴포넌트 삭제 + ToolMultiSurvey 직접 라우팅 복귀.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolMultiSurvey } from '@adapters/components/Tools/ToolMultiSurvey';
import { useRealtimeToolFlag } from '@adapters/hooks/useRealtimeToolFlag';
import { useMigrationReport } from '@adapters/hooks/useMigrationReport';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { MigrationReportModal } from './v2/Migration/MigrationReportModal';
import { MakerLayout } from './v2/Maker/MakerLayout';

interface MultiSurveyToolEntryProps {
  /** V1 ToolMultiSurvey가 받는 onBack — 도구 목록으로 복귀 */
  readonly onBack: () => void;
  /** V1 ToolMultiSurvey가 받는 isFullscreen — 풀스크린 모드 여부 */
  readonly isFullscreen: boolean;
}

/**
 * v1 데이터 수집 hook.
 *
 * Phase C 초기 구현: 빈 배열 반환 (자동 마이그레이션 대상 없음 = 신규 사용자 시뮬레이션).
 * 후속 PDCA에서 `useToolTemplateStore`의 `'tool-multi-survey'` 키 템플릿을 변환 대상으로 추출.
 *
 * 분리 이유: V1 store 의존을 본 진입점에 직접 박지 않아 보호 파일 가드 + 테스트 격리 단순화.
 */
function useV1MultiSurveyData(): unknown[] {
  // TODO(C.4-followup): useToolTemplateStore에서 tool-multi-survey 템플릿 추출
  return [];
}

export function MultiSurveyToolEntry({
  onBack,
  isFullscreen,
}: MultiSurveyToolEntryProps): JSX.Element {
  // 3번째 (마지막) 약속된 flag 호출 위치 — Plan §5.2 D5, check-flag-usage 가드 3/3
  const flag = useRealtimeToolFlag();
  const migrationReport = useMigrationReport();
  const v1Sessions = useV1MultiSurveyData();

  const selectedSessionId = useMultiSurveyV2Store((s) => s.selectedSessionId);
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const createSession = useMultiSurveyV2Store((s) => s.createSession);
  const selectSession = useMultiSurveyV2Store((s) => s.selectSession);
  const loadSessions = useMultiSurveyV2Store((s) => s.loadSessions);

  // 마이그레이션 자동 트리거 — opt-in 시점 1회만
  const migrationAttemptedRef = useRef(false);

  useEffect(() => {
    if (!flag.enabled) return;
    if (migrationAttemptedRef.current) return;
    if (flag.migrationStatus !== 'idle') return;

    migrationAttemptedRef.current = true;
    void loadSessions();

    if (v1Sessions.length > 0) {
      void migrationReport.runMigration(v1Sessions);
    }
  }, [flag.enabled, flag.migrationStatus, loadSessions, migrationReport, v1Sessions]);

  // V2 첫 진입 시 빈 세션 1개 자동 생성 (메이커가 sessionId 필수)
  const [provisionalSessionEnsured, setProvisionalSessionEnsured] = useState(false);
  useEffect(() => {
    if (!flag.enabled) return;
    if (provisionalSessionEnsured) return;
    if (sessions.length === 0) {
      const created = createSession({ title: '새 설문' });
      selectSession(created.id);
    } else if (!selectedSessionId) {
      selectSession(sessions[0]!.id);
    }
    setProvisionalSessionEnsured(true);
  }, [
    flag.enabled,
    sessions,
    selectedSessionId,
    provisionalSessionEnsured,
    createSession,
    selectSession,
  ]);

  const handleRollbackToV1 = useCallback(() => {
    flag.setEnabled(false);
  }, [flag]);

  // flag OFF — V1 ToolMultiSurvey 그대로 렌더 (분기 위치 ②)
  if (!flag.enabled) {
    return (
      <div className="relative h-full w-full">
        <V2OptInBanner onOptIn={() => flag.setEnabled(true)} />
        <ToolMultiSurvey onBack={onBack} isFullscreen={isFullscreen} />
      </div>
    );
  }

  // flag ON — V2 진입
  const activeSessionId = selectedSessionId ?? sessions[0]?.id ?? null;

  return (
    <div className="relative h-full w-full flex flex-col">
      <V2HeaderActions onBack={onBack} onRollback={handleRollbackToV1} />
      {activeSessionId ? (
        <div className="flex-1 min-h-0">
          <MakerLayout sessionId={activeSessionId} />
        </div>
      ) : (
        <V2LoadingState />
      )}
      {/* MigrationReportModal은 자체 hook 또는 api prop 주입을 받음.
         본 entry에서 이미 useMigrationReport()를 호출했으므로 hook 중복 호출 방지 위해 api prop 주입. */}
      <MigrationReportModal api={migrationReport} />
    </div>
  );
}

// ────────────────────────────────────────────────
// 보조 컴포넌트 (Phase C C.4 opt-in UI MVP)
// ────────────────────────────────────────────────

interface V2OptInBannerProps {
  readonly onOptIn: () => void;
}

function V2OptInBanner({ onOptIn }: V2OptInBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-sp-accent/10 border-b border-sp-accent/30 px-4 py-2 text-sm text-sp-text"
      role="status"
      aria-live="polite"
    >
      <span>
        ✨ <strong>새 복합 유형 설문 도구</strong>가 준비됐어요. 미리 사용해 보시겠어요?
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOptIn}
          className="rounded-md bg-sp-accent text-sp-bg px-3 py-1 text-sm font-medium hover:bg-sp-accent/80"
        >
          새 도구 사용해보기
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md text-sp-muted hover:text-sp-text px-2 py-1 text-sm"
          aria-label="배너 닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

interface V2HeaderActionsProps {
  readonly onBack: () => void;
  readonly onRollback: () => void;
}

function V2HeaderActions({ onBack, onRollback }: V2HeaderActionsProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sp-border bg-sp-bg px-4 py-2 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md text-sp-muted hover:text-sp-text px-2 py-1"
      >
        ← 도구 목록으로
      </button>
      <div className="flex items-center gap-2">
        <span className="text-sp-muted text-xs">새 도구 (베타)</span>
        <button
          type="button"
          onClick={onRollback}
          className="rounded-md border border-sp-border text-sp-muted hover:text-sp-text px-3 py-1 text-xs"
          title="이전 도구로 일시 복귀 (설정에서 다시 켤 수 있어요)"
        >
          이전 도구로 돌아가기
        </button>
      </div>
    </div>
  );
}

function V2LoadingState(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center text-sp-muted" role="status">
      준비 중...
    </div>
  );
}
