import { useRef } from 'react';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';

const STATUS_BADGE_TW: Record<ProgressStatus, string> = {
  planned: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-amber-500/20 text-amber-400',
};

const STATUS_LABEL: Record<ProgressStatus, string> = {
  planned: '예정',
  completed: '완료',
  skipped: '미실시',
};

interface ClassProgressEntryItemProps {
  entry: ProgressEntry;
  /** 시간표 매칭 교시 여부 — true면 ✦ 표시 */
  isMatchingPeriod?: boolean;
  /** 상태 배지 탭 → 사이클 핸들러 (planned → completed → skipped → planned) */
  onCycleStatus: (entry: ProgressEntry) => void;
  /** 카드 길게 누름(500ms) → 액션시트 오픈 */
  onLongPress: () => void;
  /** 카드 우측 ⋯ 버튼 클릭 → 액션시트 오픈 (보조 진입로, Design §2.4) */
  onActionMenu: () => void;
}

/**
 * 진도 한 항목 카드.
 * Design §3.5 — hit area 44px 보장, PC ProgressTab과 동일한 상태 사이클 + 액션시트 진입로.
 */
export function ClassProgressEntryItem({
  entry,
  isMatchingPeriod = false,
  onCycleStatus,
  onLongPress,
  onActionMenu,
}: ClassProgressEntryItemProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const startLongPress = () => {
    longPressFiredRef.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // 햅틱 피드백 (지원 기기)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      onLongPress();
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const borderClass =
    entry.status === 'completed'
      ? 'border-green-500/30 bg-green-500/5'
      : entry.status === 'skipped'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-sp-border bg-sp-card';

  return (
    <div
      className={`rounded-xl p-3 border ${borderClass} select-none`}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
    >
      <div className="flex items-start gap-3">
        {/* 교시 + ✦ */}
        <div className="flex flex-col items-center justify-center min-w-12 pt-0.5">
          <div className="text-sp-text font-bold text-sm tabular-nums">{entry.period}교시</div>
          {isMatchingPeriod && (
            <span className="text-sp-accent text-xs mt-0.5" aria-label="시간표 매칭">
              ✦
            </span>
          )}
        </div>

        {/* 단원/차시/메모 */}
        <div className="flex-1 min-w-0">
          <div className="text-sp-text text-sm font-medium truncate">{entry.unit}</div>
          <div className="text-sp-muted text-xs mt-0.5 truncate">{entry.lesson}</div>
          {entry.note && (
            <div className="text-sp-muted text-xs mt-1 line-clamp-2">{entry.note}</div>
          )}
        </div>

        {/* 상태 배지 + ⋯ 메뉴 */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onCycleStatus(entry)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium active:scale-95 transition-transform ${STATUS_BADGE_TW[entry.status]}`}
            style={{ minHeight: 36 }}
            aria-label={`상태: ${STATUS_LABEL[entry.status]} — 탭하여 다음 상태로 변경`}
          >
            {STATUS_LABEL[entry.status]}
          </button>
          <button
            onClick={onActionMenu}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-sp-muted hover:text-sp-text active:scale-95 transition-transform"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="더 보기 메뉴 (편집/삭제)"
          >
            <span className="material-symbols-outlined text-icon-md">more_vert</span>
          </button>
        </div>
      </div>
    </div>
  );
}
