import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_TIMER_SECONDS } from '@domain/rules/timerRules';

/**
 * 시간 직접 입력 창(spec 3-5).
 *
 * - 열면 분 칸에 커서가 있다. Enter 는 확인, Esc 는 취소.
 * - 앱 화면 전체를 덮도록 화면 최상위(body)에 붙인다. 도구 영역의 변형(transform)·유리 효과
 *   안에 두면 `position: fixed` 가 그 안에 갇힌다(과거 실사고).
 */
export function CustomTimeModal({
  onConfirm,
  onClose,
  title = '시간 직접 입력',
  confirmLabel = '확인',
  minSeconds = 1,
  initialSeconds = 300,
}: {
  onConfirm: (seconds: number) => void;
  onClose: () => void;
  title?: string;
  confirmLabel?: string;
  minSeconds?: number;
  initialSeconds?: number;
}) {
  const [min, setMin] = useState(String(Math.floor(initialSeconds / 60)));
  const [sec, setSec] = useState(String(initialSeconds % 60));
  const minRef = useRef<HTMLInputElement>(null);

  const total = (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
  const valid = total >= minSeconds && total <= MAX_TIMER_SECONDS;

  useEffect(() => {
    minRef.current?.focus();
    minRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const confirm = (): void => {
    if (valid) onConfirm(total);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  };

  const inputClass =
    'w-20 h-14 bg-sp-bg border border-sp-border rounded-lg text-center text-2xl font-mono text-sp-text focus:border-sp-accent focus:outline-none';

  const modal = (
    <div
      className="fixed inset-0 z-sp-modal flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-sp-overlay-surface
        className="bg-sp-card border border-sp-border rounded-2xl p-6 w-80 max-w-full"
      >
        <h3 className="text-lg font-bold text-sp-text mb-4">{title}</h3>
        <div className="flex items-center gap-3 justify-center mb-2">
          <label className="flex flex-col items-center gap-1">
            <input
              ref={minRef}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              onKeyDown={onInputKey}
              className={inputClass}
            />
            <span className="text-xs text-sp-muted">분</span>
          </label>
          <span className="text-2xl font-bold text-sp-muted -mt-5">:</span>
          <label className="flex flex-col items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={sec}
              onChange={(e) => setSec(e.target.value)}
              onKeyDown={onInputKey}
              className={inputClass}
            />
            <span className="text-xs text-sp-muted">초</span>
          </label>
        </div>
        <p className={`text-xs text-center mb-4 ${valid ? 'text-sp-muted' : 'text-sp-error'}`}>
          {minSeconds >= 60 ? `${minSeconds / 60}분` : `${minSeconds}초`}부터 99분 59초까지
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!valid}
            className="flex-1 py-2.5 rounded-lg bg-sp-accent text-sp-accent-fg font-medium hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
