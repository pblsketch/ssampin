import { useState, useEffect } from 'react';

interface FeedbackWallCardProps {
  readonly submissionId: string;
  readonly text: string;
  readonly index: number;
  readonly highlighted: boolean;
  readonly pinned: boolean;
  readonly onToggleHighlight: () => void;
  readonly onTogglePin: () => void;
  readonly onExpand: () => void;
}

// 부드러운 파스텔 톤 — light 테마에서도 대비 확보
const CARD_COLORS = [
  'bg-amber-100 border-amber-300',
  'bg-sky-100 border-sky-300',
  'bg-rose-100 border-rose-300',
  'bg-emerald-100 border-emerald-300',
  'bg-violet-100 border-violet-300',
  'bg-orange-100 border-orange-300',
  'bg-teal-100 border-teal-300',
  'bg-fuchsia-100 border-fuchsia-300',
] as const;

export function FeedbackWallCard({
  submissionId,
  text,
  index,
  highlighted,
  pinned,
  onToggleHighlight,
  onTogglePin,
  onExpand,
}: FeedbackWallCardProps) {
  const color = CARD_COLORS[index % CARD_COLORS.length];
  const [entered, setEntered] = useState(false);

  // fade-in 애니메이션
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(t);
  }, []);

  const isLong = text.length > 80;

  return (
    <div
      className={`
        group relative flex flex-col gap-2 rounded-xl border-2 p-4 shadow-sm
        transition-all duration-500
        ${color}
        ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
        ${highlighted ? 'ring-4 ring-amber-400 scale-105' : ''}
        ${pinned ? 'ring-2 ring-blue-500' : ''}
      `}
      data-submission-id={submissionId}
    >
      <p
        className={`text-gray-900 break-words ${isLong ? 'text-sm' : 'text-base'} font-medium`}
      >
        {isLong ? text.slice(0, 80) + '…' : text}
      </p>

      {/* 액션 버튼들 — 호버 시 노출 */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggleHighlight}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-sm shadow-sm transition
            ${highlighted ? 'bg-amber-500 text-white' : 'bg-white/80 text-gray-600 hover:bg-white'}`}
          title={highlighted ? '하이라이트 해제' : '하이라이트'}
          aria-pressed={highlighted}
        >
          ⭐
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-sm shadow-sm transition
            ${pinned ? 'bg-blue-500 text-white' : 'bg-white/80 text-gray-600 hover:bg-white'}`}
          title={pinned ? '고정 해제' : '고정'}
          aria-pressed={pinned}
        >
          📌
        </button>
        {isLong && (
          <button
            type="button"
            onClick={onExpand}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/80 text-sm text-gray-600 shadow-sm transition hover:bg-white"
            title="전체 보기"
          >
            🔍
          </button>
        )}
      </div>
    </div>
  );
}
