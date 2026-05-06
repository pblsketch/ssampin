import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';

/**
 * NEIS 학사일정 → 구글 캘린더 동기화 제안 배너.
 *
 * 노출 조건은 `checkNeisSyncSuggestion` 액션이 결정하며,
 * - 구글 캘린더 연결됨
 * - `neis-schedule` 카테고리에 매핑이 아예 없음
 * - NEIS 학사일정 이벤트가 1개 이상 존재
 * - 같은 세션에서 dismiss 한 적 없음
 * 의 모든 조건을 만족할 때만 표시된다.
 *
 * dismiss는 inProgress 중에도 허용 — 백그라운드 작업은 계속 진행하되 UI에서 배너만 치움.
 */
export function NeisSyncSuggestionBanner() {
  const show = useCalendarSyncStore((s) => s.showNeisSyncSuggestion);
  const inProgress = useCalendarSyncStore((s) => s.neisSyncInProgress);
  const progress = useCalendarSyncStore((s) => s.neisSyncProgress);
  const dismiss = useCalendarSyncStore((s) => s.dismissNeisSyncSuggestion);
  const accept = useCalendarSyncStore((s) => s.acceptNeisSyncSuggestion);

  if (!show) return null;

  const buttonLabel = inProgress
    ? progress.total > 0
      ? `동기화 중... ${progress.current}/${progress.total}`
      : '동기화 중...'
    : '구글 캘린더에 동기화';

  return (
    <div
      role="region"
      aria-label="NEIS 학사일정 동기화 제안"
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-sp-border bg-sp-card shadow-lg p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
          <span className="material-symbols-outlined">event_available</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sp-text">
            학사일정을 구글 캘린더에서도 확인하시겠어요?
          </h3>
          <p className="mt-1 text-sm text-sp-muted">
            NEIS 학사일정이 구글 캘린더에 자동으로 동기화됩니다. 휴대폰에서도 학사일정을 바로 확인할 수 있어요.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void accept()}
              disabled={inProgress}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {inProgress && (
                <span className="material-symbols-outlined animate-spin text-base">
                  progress_activity
                </span>
              )}
              {buttonLabel}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
            >
              {inProgress ? '백그라운드로' : '나중에'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="배너 닫기"
          className="shrink-0 -mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
        >
          <span className="material-symbols-outlined text-icon">close</span>
        </button>
      </div>
    </div>
  );
}
