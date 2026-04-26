import { useCallback, useEffect, useState } from 'react';

/**
 * v2.1 Phase C-C5 — Freeform 자기 카드 잠금 토글 상태 훅 (Plan FR-C8 / Design v2.1 §5.1).
 *
 * 페1 critical 실수 방지: Freeform 학생 자기 카드는 **기본 locked**.
 * 학생이 명시적으로 "✏️ 위치 바꾸기" 토글을 ON 했을 때만 react-rnd 활성.
 *
 * - 보드 단위 분리 (boardKey) — 다보드 동시 작성 시 각 보드의 잠금 상태 독립
 * - sessionStorage에 영속 (탭 닫으면 초기화 — 다음 진입 시 다시 locked로 시작)
 * - localStorage 사용 X (학기 영속 PIN과 다른 정책 — 토글은 임시 의도)
 *
 * 회귀 위험 #6 무관 — 키보드 단축키 코드 절대 추가 X.
 */
const STORAGE_KEY_PREFIX = 'ssampin-realtime-wall-freeform-lock:';

interface UseStudentFreeformLockStateArgs {
  readonly boardKey: string;
  /** SSR 또는 lock 상태 무효 시 기본값 (default: false = locked) */
  readonly defaultEnabled?: boolean;
}

interface UseStudentFreeformLockStateResult {
  /** true이면 자기 카드 드래그 활성, false이면 locked (기본) */
  readonly enabled: boolean;
  readonly setEnabled: (next: boolean) => void;
  readonly toggle: () => void;
}

function readStoredLockState(boardKey: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || !boardKey) return fallback;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${boardKey}`);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeStoredLockState(boardKey: string, enabled: boolean): void {
  if (typeof window === 'undefined' || !boardKey) return;
  try {
    window.sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${boardKey}`, enabled ? '1' : '0');
  } catch {
    // noop — privacy mode 등
  }
}

export function useStudentFreeformLockState(
  args: UseStudentFreeformLockStateArgs,
): UseStudentFreeformLockStateResult {
  const fallback = args.defaultEnabled ?? false;
  const [enabled, setEnabledState] = useState<boolean>(() =>
    readStoredLockState(args.boardKey, fallback),
  );

  // boardKey 변경 시 재로딩 (다보드 동시 작성 — 보드 전환 시)
  useEffect(() => {
    setEnabledState(readStoredLockState(args.boardKey, fallback));
    // fallback은 의도적으로 deps 제외 (boardKey 변경 시만 재로드 — 무한 루프 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.boardKey]);

  const setEnabled = useCallback(
    (next: boolean) => {
      writeStoredLockState(args.boardKey, next);
      setEnabledState(next);
    },
    [args.boardKey],
  );

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      writeStoredLockState(args.boardKey, next);
      return next;
    });
  }, [args.boardKey]);

  return { enabled, setEnabled, toggle };
}
