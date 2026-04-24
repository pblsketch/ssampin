import { useEffect, useRef, useState } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

interface Props {
  onClose: () => void;
}

const COLOR_SWATCH: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

const COLOR_LABEL: Record<MemoColor, string> = {
  yellow: '노랑',
  pink: '분홍',
  green: '초록',
  blue: '파랑',
};

export function QuickAddMemoForm({ onClose }: Props): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const [color, setColor] = useState<MemoColor>('yellow');
  const [saving, setSaving] = useState(false);
  const addMemo = useMemoStore((s) => s.addMemo);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, []);

  const handleSubmit = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      await addMemo(content, color);
      showToast('메모가 추가되었습니다.', 'success');
      onClose();
    } catch {
      showToast('메모 추가에 실패했습니다.', 'error');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      className="space-y-3"
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="메모 내용 (비워둬도 됨)"
        rows={4}
        className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2.5 text-[15px] font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors resize-none"
      />

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-sp-muted mr-1">색상</span>
        {MEMO_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={COLOR_LABEL[c]}
            aria-pressed={color === c}
            className={`w-7 h-7 rounded-lg ${COLOR_SWATCH[c]} transition-all ${
              color === c ? 'ring-2 ring-sp-text scale-110' : 'opacity-70 hover:opacity-100'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'memo' })); }); }}
          className="text-[12px] text-sp-muted hover:text-sp-accent transition-colors"
        >
          → 상세 편집
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-sp-accent text-white rounded-lg text-sm font-sp-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
