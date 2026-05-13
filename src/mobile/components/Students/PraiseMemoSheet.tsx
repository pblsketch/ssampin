import { useEffect, useRef, useState } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';

interface PraiseMemoSheetProps {
  studentName: string;
  studentNumber?: number;
  /** 한 줄 칭찬 메모 저장. 빈 문자열이면 호출되지 않는다. */
  onSave: (memo: string) => void | Promise<void>;
  onClose: () => void;
}

/**
 * 학생 명단에서 오른쪽 스와이프 → "칭찬 메모" 탭 시 뜨는 한 줄 입력 바텀시트.
 * 한 줄만 받아서 담임 기록(life/칭찬)으로 저장한다. 길게 쓰려면 학생 시트의 기록 탭을 쓰면 된다.
 */
export function PraiseMemoSheet({
  studentName,
  studentNumber,
  onSave,
  onClose,
}: PraiseMemoSheetProps) {
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useBottomSheet();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSave = async () => {
    const trimmed = memo.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full glass-card rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="칭찬 메모"
      >
        <div className="mx-auto mb-3 mt-3 h-1 w-10 rounded-full bg-sp-border" />
        <div className="flex items-center gap-2 px-5 pb-2">
          <span className="material-symbols-outlined text-yellow-500">favorite</span>
          <span className="text-sm font-bold text-sp-text">
            {studentNumber != null ? `${studentNumber}번 ` : ''}
            {studentName} 칭찬 메모
          </span>
        </div>
        <div className="flex items-center gap-2 px-5 pb-5 pt-1">
          <input
            ref={inputRef}
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
            }}
            maxLength={120}
            placeholder="예: 청소 시간에 친구를 도와줌"
            className="glass-input min-h-[44px] flex-1 rounded-xl px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/50"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!memo.trim() || saving}
            className="min-h-[44px] shrink-0 rounded-xl bg-sp-accent px-4 text-sm font-bold text-sp-accent-fg transition-transform active:scale-95 disabled:opacity-50"
          >
            {saving ? '저장 중' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
