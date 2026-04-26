import { useEffect, useState } from 'react';

/**
 * v2.1 Phase D — 교사 닉네임 변경 broadcast 1회 토스트 (Plan FR-D7 / Design v2.1 §11.1).
 *
 * 학생 화면에서 nickname-changed broadcast 수신 시 본인 카드가 변경되었으면 1회 안내.
 * (다른 학생 카드 닉네임 변경은 별도 안내 없음 — UI 갱신만)
 *
 * 표시 조건: postIds 중 자기 sessionToken/PIN 카드가 포함된 경우만 부모가 트리거.
 * 자동 사라짐: 4초 후 dismiss.
 */

interface StudentNicknameChangedToastProps {
  readonly newNickname: string | null;
  readonly onDismiss: () => void;
  readonly visible: boolean;
}

export function StudentNicknameChangedToast({
  newNickname,
  onDismiss,
  visible,
}: StudentNicknameChangedToastProps) {
  const [internalVisible, setInternalVisible] = useState(visible);

  useEffect(() => {
    setInternalVisible(visible);
    if (!visible) return;
    const t = setTimeout(() => {
      setInternalVisible(false);
      onDismiss();
    }, 4000);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  if (!internalVisible || !newNickname) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-full border border-amber-400/40 bg-sp-card px-4 py-2 text-xs text-sp-text shadow-lg"
    >
      선생님이 닉네임을 <span className="font-bold text-amber-300">{newNickname}</span>으로 바꾸었어요
    </div>
  );
}
