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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolMultiSurvey } from '@adapters/components/Tools/ToolMultiSurvey';
import { useRealtimeToolFlag } from '@adapters/hooks/useRealtimeToolFlag';
import { useMigrationReport } from '@adapters/hooks/useMigrationReport';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { useToolTemplateStore } from '@adapters/stores/useToolTemplateStore';
import { MigrationReportModal } from './v2/Migration/MigrationReportModal';
import { MakerLayout } from './v2/Maker/MakerLayout';
import { LiveConsoleContainer } from './v2/Console/LiveConsoleContainer';

interface MultiSurveyToolEntryProps {
  /** V1 ToolMultiSurvey가 받는 onBack — 도구 목록으로 복귀 */
  readonly onBack: () => void;
  /** V1 ToolMultiSurvey가 받는 isFullscreen — 풀스크린 모드 여부 */
  readonly isFullscreen: boolean;
}

/**
 * v1 데이터 수집 hook (Phase C C.4 — Q4 ADR-010 분리 채택 후 구현).
 *
 * `useToolTemplateStore`의 `multi-survey` 타입 템플릿을 v1ToV2 어댑터가 기대하는
 * V1Survey shape로 변환해 반환한다.
 *
 * V1Survey shape (src/adapters/multiSurvey/migration/v1ToV2.ts §V1Survey 참조):
 *  - id: string (non-empty)
 *  - title: string
 *  - questions: V1Question[]
 *  - submissions: readonly unknown[]  ← 템플릿엔 없음 → []
 *  - isOpen: boolean                  ← 템플릿엔 없음 → false
 *  - createdAt: number (epoch ms)     ← ToolTemplate.createdAt(ISO 8601) → Date.parse()
 *
 * 분리 이유:
 *  - 보호 파일(useSettingsStore 등) 회피 — useToolTemplateStore만 의존
 *  - V1 데이터 1차 진실 원천이 다른 곳(예: 별도 영속 store)으로 옮길 때 본 어댑터만 교체
 *  - 빈 배열 시 마이그레이션 트리거 자체를 건너뛰므로 미가입 사용자 비용 0
 */
function useV1MultiSurveyData(): unknown[] {
  const loaded = useToolTemplateStore((s) => s.loaded);
  const templates = useToolTemplateStore((s) => s.templates);
  const load = useToolTemplateStore((s) => s.load);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  return useMemo(() => {
    if (!loaded) return [];
    return templates
      .filter((t) => t.toolType === 'multi-survey' && t.config.type === 'multi-survey')
      .map((t) => {
        // type narrowing — filter에서 이미 확인했지만 TS는 모름
        const cfg = t.config as Extract<typeof t.config, { type: 'multi-survey' }>;
        const parsed = Date.parse(t.createdAt);
        const createdAtMs = Number.isFinite(parsed) ? parsed : Date.now();
        return {
          id: t.id,
          title: cfg.title,
          questions: cfg.questions.map((q) => ({
            id: q.id,
            type: q.type,
            question: q.question,
            required: q.required,
            options: q.options.map((o) => ({ id: o.id, text: o.text })),
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            scaleMinLabel: q.scaleMinLabel,
            scaleMaxLabel: q.scaleMaxLabel,
            maxLength: q.maxLength,
          })),
          submissions: [],
          isOpen: false,
          createdAt: createdAtMs,
        };
      });
  }, [loaded, templates]);
}

export function MultiSurveyToolEntry({
  onBack,
  isFullscreen,
}: MultiSurveyToolEntryProps): JSX.Element {
  // 3번째 (마지막) 약속된 flag 호출 위치 — Plan §5.2 D5, check-flag-usage 가드 3/3
  const flag = useRealtimeToolFlag();
  const migrationReport = useMigrationReport();
  const v1Sessions = useV1MultiSurveyData();
  // Phase C C.4 — opt-in/opt-out + 마이그레이션 결과 로깅 채널.
  // useAnalytics는 보호 파일 useSettingsStore를 내부에서 *읽기만* 함 → 본 파일은 보호 파일 비-수정.
  // trackRaw 사용: AnalyticsEvent enum(보호 파일) 확장 없이 v2 전용 이벤트 게재.
  const { trackRaw } = useAnalytics();

  const selectedSessionId = useMultiSurveyV2Store((s) => s.selectedSessionId);
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const createSession = useMultiSurveyV2Store((s) => s.createSession);
  const selectSession = useMultiSurveyV2Store((s) => s.selectSession);
  const loadSessions = useMultiSurveyV2Store((s) => s.loadSessions);
  const liveActive = useMultiSurveyV2Store((s) => s.liveSession !== null);
  const exitLive = useMultiSurveyV2Store((s) => s.exitLive);

  // 마이그레이션 자동 트리거 — opt-in 시점 1회만
  const migrationAttemptedRef = useRef(false);

  useEffect(() => {
    if (!flag.enabled) return;
    if (migrationAttemptedRef.current) return;
    if (flag.migrationStatus !== 'idle') return;

    // v2 세션 로드는 항상 시도 (idempotent — 다중 호출 안전)
    void loadSessions();

    // 빈 배열이면 아직 템플릿 로드 전이거나 변환 대상이 없음.
    // ref를 세팅하지 않아 템플릿 로드 완료 후 재진입 시 자동 트리거.
    if (v1Sessions.length === 0) return;

    migrationAttemptedRef.current = true;
    void migrationReport.runMigration(v1Sessions).then((result) => {
      if (result) {
        trackRaw('multi_survey_v2_migration_completed', {
          total_count: result.totalCount,
          success_count: result.successCount,
          failed_count: result.failedCount,
        });
      } else {
        trackRaw('multi_survey_v2_migration_failed', {});
      }
    });
  }, [flag.enabled, flag.migrationStatus, loadSessions, migrationReport, v1Sessions, trackRaw]);

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

  // Phase C C.4 — 사용자가 명시적으로 V2를 켜는 시점 (배너 버튼). v1Sessions 개수도 함께 보고.
  const handleOptIn = useCallback(() => {
    trackRaw('multi_survey_v2_opt_in', {
      source: 'entry-banner',
      v1_templates_count: v1Sessions.length,
    });
    flag.setEnabled(true);
  }, [flag, trackRaw, v1Sessions.length]);

  // Phase C C.4 — 사용자가 V2에서 V1으로 돌아가는 시점 (헤더 "이전 도구로 돌아가기").
  const handleRollbackToV1 = useCallback(() => {
    trackRaw('multi_survey_v2_opt_out', { source: 'entry-header' });
    flag.setEnabled(false);
  }, [flag, trackRaw]);

  // flag OFF — V1 ToolMultiSurvey 그대로 렌더 (분기 위치 ②)
  if (!flag.enabled) {
    return (
      <div className="relative h-full w-full">
        <V2OptInBanner onOptIn={handleOptIn} />
        <ToolMultiSurvey onBack={onBack} isFullscreen={isFullscreen} />
      </div>
    );
  }

  // flag ON — V2 진입
  const activeSessionId = selectedSessionId ?? sessions[0]?.id ?? null;

  // 라이브 진행 중 — 교사 콘솔 전체 화면 (헤더 액션은 콘솔 자체 컨트롤로 대체)
  if (liveActive) {
    return (
      <div className="relative h-full w-full">
        <LiveConsoleContainer onExit={exitLive} />
      </div>
    );
  }

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
