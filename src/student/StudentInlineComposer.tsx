import { useCallback, useMemo } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import {
  RealtimeWallInlineComposer,
  type RealtimeWallInlineComposerSubmitInput,
} from '@adapters/components/Tools/RealtimeWall/RealtimeWallInlineComposer';

/**
 * StudentInlineComposer — β-Step6 / β-Step8 학생 래퍼.
 *
 * 책임:
 *   - `useRealtimeWallSyncStore.submitCard` 호출 (학생 WebSocket 경로)
 *   - sessionStorage nickname 자동 주입 (`ssampin-realtime-wall-nickname`)
 *   - `studentFormLocked` 잠금 시 disabled (회귀 #1 무관 — submit 전 단계 차단)
 *   - β-Step8 부모(StudentRealtimeWallApp / StudentBoardView) 가 마운트 결정
 *     (`boardSettings.studentInlineComposerEnabled` & `tab.permission='write'`)
 *
 * 회귀 보호:
 *   - 회귀 #4 prevSubmittingRef 무관 — 인라인 컴포저는 submit ack 후 모달 close
 *     로직 미사용 (즉시 cancel 트리거로 부모가 컴포저 unmount)
 *   - 회귀 #11 viewerRole 비대칭 0 — 학생 전용 래퍼이므로 teacher 분기 없음
 *
 * 폰트크기는 UI state only (도메인 미저장). 향후 store 의 카드 표시 설정 또는
 * 학생 로컬 preferences 로 확장 가능 — 현 단계는 ack-and-discard (컴포저 unmount 시 폐기).
 */

interface StudentInlineComposerProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  /** 제출 성공 콜백 — 부모가 컴포저 unmount + 후속 UX 처리 */
  readonly onSubmitted: () => void;
  /** 현재 활성 탭 ID — β-Step8 tab-aware filter 가 주입 */
  readonly tabId?: string;
  /** Kanban 컬럼별 + 버튼 진입 시 columnId */
  readonly columnId?: string;
  /** Freeform 빈영역 더블클릭 좌표 (anchorPosition 으로 popup 위치) */
  readonly anchorPosition?: { readonly x: number; readonly y: number };
}

const NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';

function readDefaultNickname(): string {
  try {
    return window.sessionStorage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function StudentInlineComposer({
  open,
  onCancel,
  onSubmitted,
  tabId,
  columnId,
  anchorPosition,
}: StudentInlineComposerProps) {
  const submitCard = useRealtimeWallSyncStore((s) => s.submitCard);
  const studentFormLocked = useRealtimeWallSyncStore((s) => s.studentFormLocked);
  const currentPinHash = useRealtimeWallSyncStore((s) => s.currentPinHash);

  // sessionStorage 닉네임 1회 캡쳐 — 컴포저 mount 동안 변하지 않음
  const nickname = useMemo(() => readDefaultNickname().trim(), []);

  const handleSubmit = useCallback(
    (input: RealtimeWallInlineComposerSubmitInput) => {
      if (studentFormLocked) return;
      // 닉네임 부재 시 (sessionStorage 차단/장애) — 부모가 비활성 처리해야 하지만
      // 방어적으로 한 번 더 가드. 빈 닉네임 송신은 서버측에서도 거절될 가능성.
      if (nickname.length === 0) return;
      const { normalized } = input;
      submitCard({
        nickname,
        text: normalized.text,
        color: normalized.color,
        ...(columnId ? { columnId } : {}),
        ...(currentPinHash ? { pinHash: currentPinHash } : {}),
      });
      onSubmitted();
    },
    [studentFormLocked, nickname, submitCard, columnId, currentPinHash, onSubmitted],
  );

  return (
    <RealtimeWallInlineComposer
      open={open}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      tabId={tabId}
      anchorPosition={anchorPosition}
      placeholder={
        nickname.length === 0
          ? '닉네임이 비어 있어요. 새로 입장해 주세요.'
          : '내용을 입력하고 Enter 또는 추가 버튼을 누르세요'
      }
      disabled={studentFormLocked || nickname.length === 0}
    />
  );
}
