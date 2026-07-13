/**
 * 나이스 반영 / 서류 제출 완료 상태 토글 배지 (공용).
 *
 * 조회 화면의 날짜별 리스트·학생 타임라인이 같은 배지를 복붙으로 들고 있던 것을
 * 부품으로 통합. 색·아이콘·라벨은 통합 전 두 파일의 JSX와 동일하다.
 * 클릭은 카드 클릭 등 상위 핸들러로 전파되지 않는다(stopPropagation).
 */
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
    completedLabel: '서류',
    pendingLabel: '미제출',
    completedTitle: '서류 제출 완료 (클릭하여 취소)',
    pendingTitle: '서류 미제출 (클릭하여 제출 처리)',
  },
} as const;

export function RecordCompletionBadge({ kind, completed, onToggle }: RecordCompletionBadgeProps) {
  const v = BADGE_VARIANTS[kind];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer flex-shrink-0 ${
        completed ? v.completedClass : v.pendingClass
      }`}
      title={completed ? v.completedTitle : v.pendingTitle}
    >
      <span className="material-symbols-outlined text-icon-xs">
        {completed ? v.completedIcon : v.pendingIcon}
      </span>
      {completed ? v.completedLabel : v.pendingLabel}
    </button>
  );
}
