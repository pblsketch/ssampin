/**
 * StudentLikeButton — 학생 좋아요 버튼.
 *
 * v1.14 Phase P2 (padlet mode). Design §5.5 + §12 Q5.
 *
 * 시각:
 *   - hasLiked=true: red-400 filled heart (`bg-red-400` 배경 + filled 아이콘)
 *   - hasLiked=false: red-400 outline (border + transparent 배경 + outline 아이콘)
 *
 * 교사 하트(rose-200 outline)와 색상+형태 이중 구분으로 오인 방지.
 *
 * onClick이 없으면 read-only (교사 화면에서 학생 좋아요 카운트만 표시).
 */
export interface StudentLikeButtonProps {
  readonly count: number;
  readonly hasLiked: boolean;
  readonly onClick?: () => void;
}

export function StudentLikeButton({ count, hasLiked, onClick }: StudentLikeButtonProps) {
  const readOnly = !onClick;
  const iconClass = hasLiked
    ? 'material-symbols-outlined text-[13px]'
    : 'material-symbols-outlined text-[13px]';
  // filled vs outlined heart 구분: filled는 fill 채움, outline은 fill 비움.
  // material-symbols는 font-variation-settings 'FILL'로 토글.
  const iconStyle: React.CSSProperties = hasLiked
    ? { fontVariationSettings: '"FILL" 1' }
    : { fontVariationSettings: '"FILL" 0' };

  return (
    <button
      type="button"
      aria-disabled={readOnly}
      onClick={readOnly ? undefined : onClick}
      title={readOnly ? `학생 좋아요 ${count}` : '학생 좋아요'}
      aria-pressed={hasLiked}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-detail font-semibold transition ${
        hasLiked
          ? 'border-red-400 bg-red-400 text-white'
          : 'border-red-400/40 bg-transparent text-red-300 hover:border-red-400 hover:text-red-200'
      } ${readOnly ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
    >
      <span className={iconClass} style={iconStyle}>favorite</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
