/**
 * YearTransitionNotice — F8c(RT1): 다른 기기의 학년도 마무리 1회 안내 배너 (모바일).
 *
 * 노출: useMobileDriveSyncStore가 동기화 다운로드에서 settings.currentTerm 전진을 감지하면
 * yearTransitionNoticeTerm이 채워진다(localStorage dedup — 같은 학기는 다시 안내하지 않음).
 * 문구는 모바일 보관함 뷰어 부재 전제의 정직한 안내다(지난 기록 열람은 PC 보관함).
 */

import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { formatTermKo } from '@domain/rules/academicCalendar';

export function YearTransitionNotice() {
  const term = useMobileDriveSyncStore((s) => s.yearTransitionNoticeTerm);
  const dismiss = useMobileDriveSyncStore((s) => s.dismissYearTransitionNotice);

  if (term === null) return null;

  return (
    <div className="mx-4 mt-2 flex items-start gap-2.5 rounded-xl border border-sp-border bg-sp-surface px-3.5 py-3">
      <span aria-hidden className="material-symbols-outlined text-sp-accent text-icon-md shrink-0">
        inventory_2
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-sp-text">
          다른 기기에서 학년도 마무리가 실행됐어요
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-sp-muted">
          {formatTermKo(term)}가 시작됐어요. 지난 기록은 PC의 보관함에서 볼 수 있어요.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="shrink-0 rounded-lg p-1 text-sp-muted transition-colors hover:text-sp-text"
      >
        <span aria-hidden className="material-symbols-outlined text-icon-sm">
          close
        </span>
      </button>
    </div>
  );
}
