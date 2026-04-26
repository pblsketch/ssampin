/**
 * v2.1 Phase D — 같은 작성자 카드 추적 패널 (Plan FR-D7 / Design v2.1 §11.1).
 *
 * 교사가 카드 우클릭 → "이 작성자의 다른 카드 보기" 클릭 시 화면 우상단에 표시.
 * 같은 sessionToken/PIN hash로 매칭된 카드 개수 + 작성자 일괄 hidden 옵션.
 */

interface RealtimeWallTeacherStudentTrackerPanelProps {
  readonly open: boolean;
  /** 매칭된 카드 개수 (강조 ring + filter) */
  readonly matchCount: number;
  /** 추적 중인 작성자 라벨 (대표 닉네임 등) */
  readonly authorLabel?: string;
  readonly onClose: () => void;
  readonly onBulkHide?: () => void;
}

export function RealtimeWallTeacherStudentTrackerPanel({
  open,
  matchCount,
  authorLabel,
  onClose,
  onBulkHide,
}: RealtimeWallTeacherStudentTrackerPanelProps) {
  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-20 z-[55] flex w-72 flex-col gap-2 rounded-xl border border-sky-400/40 bg-sp-card p-3 shadow-xl"
    >
      <header className="flex items-start gap-2">
        <span className="material-symbols-outlined text-lg text-sky-400">
          person_search
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-sp-text">
            작성자 추적
          </p>
          <p className="text-xs text-sp-muted">
            {authorLabel ? `${authorLabel} · ` : ''}
            <span className="font-semibold text-sky-300">{matchCount}</span>장 일치
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-md p-0.5 text-sp-muted transition hover:bg-sp-surface hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </header>

      <p className="text-detail text-sp-muted">
        보드에서 같은 작성자의 카드가 sky 테두리로 강조됩니다.
      </p>

      {onBulkHide && matchCount > 0 && (
        <button
          type="button"
          onClick={onBulkHide}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
        >
          <span className="material-symbols-outlined text-sm">visibility_off</span>
          이 학생 카드 모두 숨김 ({matchCount}장)
        </button>
      )}
    </div>
  );
}
