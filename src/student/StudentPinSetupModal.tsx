import { useEffect, useState } from 'react';

/**
 * v2.1 Phase D — 학기 영속 PIN 입력 모달 (Plan FR-D6 / Design v2.1 §5.14).
 *
 * 4자리 숫자 PIN 입력 → SHA-256 hash → localStorage 저장 + 서버 ack.
 *
 * 보안 (회귀 위험 #9):
 *   - PIN 평문은 useState에만 (메모리 휘발)
 *   - onSetPin 콜백 내에서 hashStudentPin 호출 → hex string만 외부 전달
 *   - 어디에도 평문 영속 X
 *
 * 사용 흐름:
 *   - mode='setup': 신규 PIN 등록 (4자리 입력 → 한번 더 입력 → 저장)
 *   - mode='change': 기존 PIN 변경 (현재 PIN 입력 → 새 PIN 입력 → 저장)
 *   - mode='verify': 기존 PIN 확인 (저장된 학생이 같은 PC 다른 탭에서 PIN으로 본인 확인)
 */

interface StudentPinSetupModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** 신규 등록 또는 변경 — 4자리 PIN 입력 + 확인 */
  readonly mode: 'setup' | 'verify';
  /** PIN 입력 후 호출. 부모가 hashStudentPin → setPin/verifyPin 처리 */
  readonly onSubmit: (pin: string) => Promise<void>;
  /** 입력 중 외부 에러 (PIN 불일치 등) */
  readonly externalError?: string | null;
}

export function StudentPinSetupModal({
  open,
  onClose,
  mode,
  onSubmit,
  externalError,
}: StudentPinSetupModalProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 모달 열림/닫힘 시 state 초기화 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    setPin('');
    setConfirm('');
    setStep('enter');
    setError(null);
    setBusy(false);

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const sanitize = (raw: string): string => raw.replace(/\D/g, '').slice(0, 4);

  const handleNext = () => {
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN은 4자리 숫자여야 해요.');
      return;
    }
    if (mode === 'verify') {
      // verify는 한 번만 입력 (확인 단계 X)
      void doSubmit(pin);
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = () => {
    setError(null);
    if (pin !== confirm) {
      setError('두 번 입력한 PIN이 달라요. 다시 입력해 주세요.');
      return;
    }
    void doSubmit(pin);
  };

  const doSubmit = async (value: string) => {
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PIN 처리에 실패했어요.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const heading = mode === 'setup' ? '학기 PIN 설정' : 'PIN 확인';
  const description =
    mode === 'setup'
      ? '4자리 PIN을 정해두면 다른 PC/탭에서도 같은 PIN으로 자기 카드를 관리할 수 있어요. 잊으면 복구할 수 없으니 잘 기억해 주세요.'
      : '이전에 설정한 4자리 PIN을 입력해 주세요.';

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-pin-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-sp-border bg-sp-card p-5 shadow-2xl">
        <header>
          <h2 id="student-pin-title" className="text-base font-bold text-sp-text">
            {heading}
          </h2>
          <p className="mt-1 text-xs text-sp-muted">{description}</p>
        </header>

        {step === 'enter' && (
          <>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(sanitize(e.target.value))}
              placeholder="4자리 숫자"
              autoFocus
              disabled={busy}
              aria-label="PIN 입력"
              className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-center text-2xl tracking-widest text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
            />
            {(error || externalError) && (
              <p className="text-xs text-rose-400" role="alert">
                {error || externalError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:opacity-50"
              >
                {mode === 'setup' ? '건너뛰기' : '취소'}
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={busy || pin.length !== 4}
                className="flex-1 rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mode === 'setup' ? '다음' : busy ? '확인 중...' : '확인'}
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p className="text-xs text-sp-muted">한 번 더 입력해 주세요.</p>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(sanitize(e.target.value))}
              placeholder="4자리 숫자"
              autoFocus
              disabled={busy}
              aria-label="PIN 확인"
              className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-center text-2xl tracking-widest text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
            />
            {error && (
              <p className="text-xs text-rose-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('enter');
                  setConfirm('');
                  setError(null);
                }}
                disabled={busy}
                className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:opacity-50"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || confirm.length !== 4}
                className="flex-1 rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? '저장 중...' : 'PIN 저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
