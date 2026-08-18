import React, { useState } from 'react';
import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';

// ============================================================
// 공용 기간(범위) 직접 설정 바텀시트 — design §7.2
// 출결 통계 '직접 설정' 칩 + 반 전체 기록 '기간' 칩에서 함께 재사용한다.
// ============================================================

interface DateRangePickerSheetProps {
  initialStart?: string;
  initialEnd?: string;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
}

/**
 * 다른 오버레이 시트(§4.5, z-[60]) 위에서도 뜰 수 있어(예: 반 전체 기록 페이지의 필터 칩)
 * 한 단계 더 높은 `z-[70]`을 쓴다. 본문은 `MultiDatePicker`의 `mode="range"`를 그대로
 * 위임하고, 이 컴포넌트는 진행 중인 선택을 로컬 state로 들고 있다가 "적용" 시에만
 * 상위로 반영한다(취소/닫기 시 상위 상태는 변하지 않음).
 */
export function DateRangePickerSheet({
  initialStart,
  initialEnd,
  onApply,
  onClose,
}: DateRangePickerSheetProps) {
  useBottomSheet(true, onClose);
  const [start, setStart] = useState<string | undefined>(initialStart);
  const [end, setEnd] = useState<string | undefined>(initialEnd);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleApply = () => {
    if (!start || !end) return;
    onApply(start, end);
    onClose();
  };

  const handleReset = () => {
    setStart(undefined);
    setEnd(undefined);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end" onClick={handleBackdropClick}>
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 시트 */}
      <div
        className="relative w-full max-h-[85dvh] glass-card rounded-t-2xl pb-safe flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="기간 선택"
      >
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-sp-border shrink-0">
          <p className="text-sp-text font-bold text-base">기간 선택</p>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 달력 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <MultiDatePicker
            mode="range"
            rangeStart={start}
            rangeEnd={end}
            onRangeChange={(s, e) => {
              setStart(s);
              setEnd(e);
            }}
            maxCount={366}
            mobileSheet
            inline
          />
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-sp-border shrink-0">
          <button
            type="button"
            onClick={handleReset}
            disabled={!start && !end}
            className="min-h-[44px] flex-1 rounded-xl border border-sp-border text-sp-muted text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!start || !end}
            className="min-h-[44px] flex-1 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
