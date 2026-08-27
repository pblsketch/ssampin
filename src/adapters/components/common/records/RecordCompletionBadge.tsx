/**
 * 나이스 반영 / 증빙서류 제출 완료 상태 토글 배지 (공용).
 *
 * 조회 화면의 날짜별 리스트·학생 타임라인이 같은 배지를 복붙으로 들고 있던 것을 부품으로 통합.
 * 클릭은 카드 클릭 등 상위 핸들러로 전파되지 않는다(stopPropagation).
 *
 * **상태별 표현 차등(2026-08-27)** — 증빙서류 배지가 정책 게이트 없이 상시 노출되면서
 * 출결 행마다 알약이 둘씩 붙어 밀도가 올라갔다. 같은 행의 후속조치 표시가 이미 쓰던 언어
 * ("끝난 일은 맨 아이콘, 남은 일만 알약")를 따라간다:
 *
 * - 완료 → 초록 **아이콘만**. 라벨이 사라지므로 `aria-label`/`title`로 의미를 보존한다.
 * - 미완료 → 알약 + 라벨. 목록에서 **할 일만 눈에 띄게** 남는다.
 *
 * 완료 상태도 클릭 토글을 유지한다 — 오조작 되돌리기 경로를 없애지 않는다.
 * (설계: docs/02-design/features/attendance-document-discoverability.design.md §4-1)
 */
import type { MouseEvent } from 'react';

interface RecordCompletionBadgeProps {
  kind: 'neis' | 'document';
  completed: boolean;
  onToggle: () => void;
}

const BADGE_VARIANTS = {
  neis: {
    completedClass: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
    pendingClass: 'bg-red-500/10 text-red-400/70 hover:bg-red-500/20',
    completedIcon: 'check_circle',
    pendingIcon: 'pending',
    completedLabel: '나이스',
    pendingLabel: '미반영',
    completedTitle: '나이스 반영 완료 (클릭하여 취소)',
    pendingTitle: '나이스 미반영 (클릭하여 반영 처리)',
  },
  document: {
    completedClass: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
    pendingClass: 'bg-orange-500/10 text-orange-400/70 hover:bg-orange-500/20',
    completedIcon: 'description',
    pendingIcon: 'draft',
    completedLabel: '증빙서류',
    pendingLabel: '미제출',
    completedTitle: '증빙서류 제출 완료 (클릭하여 취소)',
    pendingTitle: '증빙서류 미제출 (클릭하여 제출 처리)',
  },
} as const;

const BASE_CLASS =
  'inline-flex items-center rounded-full transition-colors cursor-pointer flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent';

export function RecordCompletionBadge({ kind, completed, onToggle }: RecordCompletionBadgeProps) {
  const v = BADGE_VARIANTS[kind];
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onToggle();
  };

  // 완료 — 조용한 확인 표식. 라벨 대신 aria-label로 의미를 남긴다.
  if (completed) {
    return (
      <button
        onClick={handleClick}
        className={`${BASE_CLASS} justify-center w-6 h-6 text-green-400 hover:bg-green-500/20`}
        title={v.completedTitle}
        aria-label={v.completedTitle}
      >
        <span className="material-symbols-outlined text-icon-xs" aria-hidden="true">
          {v.completedIcon}
        </span>
      </button>
    );
  }

  // 미완료 — 목록에서 유일하게 외치는 요소.
  return (
    <button
      onClick={handleClick}
      className={`${BASE_CLASS} gap-1 px-2 py-0.5 text-xs font-medium ${v.pendingClass}`}
      title={v.pendingTitle}
      aria-label={v.pendingTitle}
    >
      <span className="material-symbols-outlined text-icon-xs" aria-hidden="true">
        {v.pendingIcon}
      </span>
      {v.pendingLabel}
    </button>
  );
}
