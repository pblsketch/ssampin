/**
 * StudentProfileForm — 닉네임 + pin4 4자리 + 아바타 선택 (DN-04).
 *
 * - pin4: "한 번 더" 재실행 시 동일 신원 유지용 4자리 비번. 교사 화면에 노출 금지.
 * - 닉네임: trim 후 1~20자.
 * - 아바타: AvatarPicker에서 12종 중 1개 필수 선택.
 *
 * 학생 페이지 컨텍스트 — CSS 변수 fallback HEX 허용.
 */

import { memo, useCallback, useState } from 'react';
import { AvatarPicker } from './AvatarPicker';

interface StudentProfileSubmit {
  readonly nickname: string;
  readonly pin4: string;
  readonly avatarKey: string;
  readonly isRealName: boolean;
}

interface StudentProfileFormProps {
  readonly onSubmit: (profile: StudentProfileSubmit) => void;
  readonly errorMessage?: string;
  readonly isSubmitting?: boolean;
  /** 실명 모드 안내 표시 여부 */
  readonly requireRealName?: boolean;
}

function StudentProfileFormImpl({
  onSubmit,
  errorMessage,
  isSubmitting,
  requireRealName,
}: StudentProfileFormProps): JSX.Element {
  const [nickname, setNickname] = useState<string>('');
  const [pin4, setPin4] = useState<string>('');
  const [avatarKey, setAvatarKey] = useState<string | null>(null);

  const trimmed = nickname.trim();
  const canSubmit =
    trimmed.length >= 1 &&
    trimmed.length <= 20 &&
    pin4.length === 4 &&
    avatarKey !== null &&
    isSubmitting !== true;

  const handlePin4 = useCallback((value: string): void => {
    setPin4(value.replace(/\D/g, '').slice(0, 4));
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (!canSubmit || avatarKey === null) return;
      onSubmit({
        nickname: trimmed,
        pin4,
        avatarKey,
        isRealName: requireRealName === true,
      });
    },
    [canSubmit, avatarKey, trimmed, pin4, requireRealName, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-3xl bg-sp-card p-6"
      style={{ backgroundColor: 'var(--color-card, #1a1f2e)' }}
      aria-label="프로필 입력"
    >
      <label className="flex flex-col gap-2">
        <span
          className="font-sp-semibold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 16 }}
        >
          {requireRealName === true ? '이름 (실명)' : '닉네임'}
        </span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder={requireRealName === true ? '이름을 입력하세요' : '닉네임 (1~20자)'}
          aria-label="닉네임 입력 (1~20자)"
          className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-3 font-sp-medium text-sp-text outline-none focus:border-sp-accent"
          style={{
            borderColor: 'var(--color-border, #334155)',
            backgroundColor: 'var(--color-bg, #0a0e17)',
            color: 'var(--color-text, #e2e8f0)',
            fontSize: 18,
          }}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span
          className="font-sp-semibold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 16 }}
        >
          비밀번호 4자리
        </span>
        <span
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
        >
          다시 입장할 때 같은 번호를 입력하세요. 선생님께는 보이지 않습니다.
        </span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          value={pin4}
          onChange={(e) => handlePin4(e.target.value)}
          placeholder="0000"
          aria-label="비밀번호 4자리 숫자"
          className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-3 text-center font-sp-bold tracking-[0.6em] text-sp-text outline-none focus:border-sp-accent"
          style={{
            borderColor: 'var(--color-border, #334155)',
            backgroundColor: 'var(--color-bg, #0a0e17)',
            color: 'var(--color-text, #e2e8f0)',
            fontSize: 28,
          }}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span
          className="font-sp-semibold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 16 }}
        >
          아바타 선택
        </span>
        <AvatarPicker selectedKey={avatarKey} onSelect={setAvatarKey} />
      </div>

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
        {isSubmitting === true ? '준비 중...' : '준비 완료'}
      </button>
    </form>
  );
}

export const StudentProfileForm = memo(StudentProfileFormImpl);
export type { StudentProfileSubmit };
