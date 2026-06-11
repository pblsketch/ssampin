/**
 * StudentEntryForm — 입장 코드 6자리 입력 폼.
 *
 * - inputmode="numeric" + pattern + maxLength=6 (모바일 숫자 키보드).
 * - 6자리 채워질 때까지 제출 버튼 비활성.
 * - sp-* 토큰만 사용. 학생 페이지이므로 CSS 변수 fallback 패턴 적용.
 */

import { memo, useCallback, useState } from 'react';

interface StudentEntryFormProps {
  readonly onSubmit: (code: string) => void;
  readonly errorMessage?: string;
  readonly isSubmitting?: boolean;
}

function StudentEntryFormImpl({
  onSubmit,
  errorMessage,
  isSubmitting,
}: StudentEntryFormProps): JSX.Element {
  const [code, setCode] = useState<string>('');

  const handleChange = useCallback((value: string): void => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (code.length === 6 && !isSubmitting) {
        onSubmit(code);
      }
    },
    [code, isSubmitting, onSubmit],
  );

  const canSubmit = code.length === 6 && !isSubmitting;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-3xl bg-sp-card p-6"
      style={{ backgroundColor: 'var(--color-card, #1a1f2e)' }}
      aria-label="입장 코드 입력"
    >
      <label className="flex flex-col gap-2">
        <span
          className="font-sp-semibold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 16 }}
        >
          입장 코드 6자리
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="000000"
          aria-label="입장 코드 6자리 숫자"
          className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-4 text-center font-sp-bold tracking-[0.4em] text-sp-text outline-none focus:border-sp-accent"
          style={{
            borderColor: 'var(--color-border, #334155)',
            backgroundColor: 'var(--color-bg, #0a0e17)',
            color: 'var(--color-text, #e2e8f0)',
            fontSize: 32,
          }}
        />
      </label>

      {errorMessage !== undefined && errorMessage.length > 0 ? (
        <p role="alert" className="font-sp-medium text-sp-error" style={{ fontSize: 14 }}>
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-2xl bg-sp-accent px-6 py-4 font-sp-bold text-sp-accent-fg transition-opacity disabled:opacity-40"
        style={{
          backgroundColor: 'var(--color-accent, #60a5fa)',
          color: 'var(--color-bg, #0a0e17)',
          fontSize: 18,
        }}
        aria-disabled={!canSubmit}
      >
        {isSubmitting === true ? '입장 중...' : '입장하기'}
      </button>
    </form>
  );
}

export const StudentEntryForm = memo(StudentEntryFormImpl);
