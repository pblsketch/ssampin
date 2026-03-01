import { useState, useEffect, useCallback, useRef } from 'react';
import { usePinStore } from '@adapters/stores/usePinStore';

interface PinOverlayProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

export function PinOverlay({ onSuccess, onCancel }: PinOverlayProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const verify = usePinStore((s) => s.verify);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 잠금 대기 카운트다운
  useEffect(() => {
    if (lockoutEnd === null) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutEnd(null);
        setLockoutRemaining(0);
        setAttempts(0);
        setError('');
      } else {
        setLockoutRemaining(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutEnd]);

  const handleSubmit = useCallback((pin: string) => {
    if (lockoutEnd !== null) return;

    const ok = verify(pin);
    if (ok) {
      setSuccess(true);
      setTimeout(() => onSuccess(), 400);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setError('PIN이 일치하지 않습니다');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setDigits([]);
      }, 500);

      if (next >= MAX_ATTEMPTS) {
        setLockoutEnd(Date.now() + LOCKOUT_SECONDS * 1000);
        setError('');
      }
    }
  }, [verify, onSuccess, attempts, lockoutEnd]);

  const addDigit = useCallback((d: string) => {
    if (lockoutEnd !== null || success) return;
    setError('');
    setDigits((prev) => {
      const next = [...prev, d];
      if (next.length === 4) {
        setTimeout(() => handleSubmit(next.join('')), 100);
      }
      return next.length <= 4 ? next : prev;
    });
  }, [handleSubmit, lockoutEnd, success]);

  const removeDigit = useCallback(() => {
    if (lockoutEnd !== null || success) return;
    setError('');
    setDigits((prev) => prev.slice(0, -1));
  }, [lockoutEnd, success]);

  // 키보드 입력 지원
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        addDigit(e.key);
      } else if (e.key === 'Backspace') {
        removeDigit();
      } else if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addDigit, removeDigit, onCancel]);

  const isLocked = lockoutEnd !== null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
    >
      <div
        className={`w-[320px] rounded-2xl bg-sp-card ring-1 ring-sp-border/50 p-8 shadow-2xl ${
          shake ? 'animate-pin-shake' : ''
        } ${success ? 'animate-pin-success' : ''}`}
      >
        {/* 아이콘 */}
        <div className="flex justify-center mb-4">
          {success ? (
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-green-400 text-4xl">
                check_circle
              </span>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-sp-accent/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-sp-accent text-4xl">
                lock
              </span>
            </div>
          )}
        </div>

        {/* 제목 */}
        <h3 className="text-center text-lg font-bold text-sp-text mb-2">
          {success ? '인증 완료' : 'PIN을 입력하세요'}
        </h3>

        {/* 에러 메시지 */}
        {error && (
          <p className="text-center text-xs text-red-400 mb-3">{error}</p>
        )}

        {/* 잠금 대기 메시지 */}
        {isLocked && (
          <p className="text-center text-xs text-amber-400 mb-3">
            잠시 후 다시 시도해주세요 ({lockoutRemaining}초)
          </p>
        )}

        {/* PIN 표시 (●○ 형태) */}
        <div className="flex justify-center gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < digits.length
                  ? 'bg-sp-accent scale-110 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  : 'bg-sp-border/50 ring-1 ring-sp-border'
              }`}
            />
          ))}
        </div>

        {/* 숫자 키패드 */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addDigit(d)}
              disabled={isLocked || success}
              className="h-14 rounded-full bg-sp-surface hover:bg-sp-text/10 active:scale-95 text-sp-text text-xl font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-sp-border/30"
            >
              {d}
            </button>
          ))}

          {/* 하단 행: [←] [0] [빈칸] */}
          <button
            type="button"
            onClick={removeDigit}
            disabled={isLocked || success || digits.length === 0}
            className="h-14 rounded-full bg-sp-surface hover:bg-sp-text/10 active:scale-95 text-sp-muted transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center ring-1 ring-sp-border/30"
          >
            <span className="material-symbols-outlined text-xl">backspace</span>
          </button>
          <button
            type="button"
            onClick={() => addDigit('0')}
            disabled={isLocked || success}
            className="h-14 rounded-full bg-sp-surface hover:bg-sp-text/10 active:scale-95 text-sp-text text-xl font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-sp-border/30"
          >
            0
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-14 rounded-full bg-sp-surface hover:bg-sp-text/10 active:scale-95 text-sp-muted text-xs font-medium transition-all flex items-center justify-center ring-1 ring-sp-border/30"
            >
              취소
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}
