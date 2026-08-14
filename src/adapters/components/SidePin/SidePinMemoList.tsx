/**
 * 옆핀 메모 목록 — 최근 메모 몇 개를 훑고 하나를 골라 여는 화면.
 *
 * 손잡이에서 정한 시각 언어를 그대로 잇는다. 색은 면을 통째로 칠하지 않고 **왼쪽 띠**로만
 * 쓴다. 좁은 칸에서 카드 네 장이 각기 다른 색으로 칠해지면, 훑어보라고 만든 목록이
 * 오히려 시끄러워져 읽히지 않는다. 색은 "어느 메모였더라"를 떠올리는 단서일 뿐이다.
 *
 * 메모 색(노랑·분홍·초록·파랑)은 이 앱의 실제 포스트잇 색이라 `sp-*` 주제 색이 아니다.
 * 기존 메모 화면들과 같은 값을 쓴다.
 */
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import type { SidePinMemoListItem } from '@usecases/sidePin/SelectSidePinMemos';
import { SidePinZoneHeader } from './SidePinZoneHeader';

const COLOR_BAR: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

/** 목록·편집 화면이 함께 쓰는 단추 모양 */
export const SIDE_PIN_MEMO_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:-outline-offset-2';

export interface SidePinMemoListProps {
  /**
   * 보여줄 메모 전부. 개수를 자르지 않는다 — 옆핀 안에서 위아래로 훑어
   * 모두 볼 수 있어야 한다. 메모 하나 찾으러 본체를 열게 하면 안 된다.
   */
  readonly items: readonly SidePinMemoListItem[];
  readonly loaded: boolean;
  readonly onOpen: (id: string) => void;
  readonly onAdd: () => void;
}

export function SidePinMemoList({ items, loaded, onOpen, onAdd }: SidePinMemoListProps) {
  return (
    <section aria-label="메모" className="flex h-full flex-col bg-sp-bg">
      <SidePinZoneHeader
        icon="sticky_note_2"
        title="메모"
        action={
          <button
            type="button"
            onClick={onAdd}
            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-caption font-medium text-sp-muted transition-colors duration-sp-quick hover:bg-sp-bg hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
          >
            <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
              add
            </span>
            새 메모
          </button>
        }
      />

      {/*
        min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 머리말이 잘린다.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!loaded ? (
          // 다 불러오기 전에 "없습니다"를 보여주면, 있는데 없다고 말하는 셈이 된다.
          <p className="px-1 py-3 text-caption text-sp-muted">메모를 불러오는 중입니다…</p>
        ) : items.length === 0 ? (
          <EmptyMemos onAdd={onAdd} />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <MemoRow item={item} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MemoRow({
  item,
  onOpen,
}: {
  readonly item: SidePinMemoListItem;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-sp-quick hover:bg-sp-surface ${SIDE_PIN_MEMO_FOCUS}`}
    >
      <span aria-hidden className={`mt-1 h-7 w-1 shrink-0 rounded-full ${COLOR_BAR[item.color]}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-sp-text">
            {item.label}
          </span>
          {item.hasImage && (
            <span
              aria-hidden
              className="material-symbols-outlined shrink-0 text-icon-sm leading-none text-sp-muted"
            >
              image
            </span>
          )}
        </span>
        {item.preview !== '' && (
          // 미리보기는 두 줄까지. 여기서 더 늘리면 목록이 아니라 본문이 된다.
          <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-caption text-sp-muted">
            {item.preview}
          </span>
        )}
      </span>
    </button>
  );
}

function EmptyMemos({ onAdd }: { readonly onAdd: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
        sticky_note_2
      </span>
      <p className="text-sm text-sp-text">아직 메모가 없습니다</p>
      <button
        type="button"
        onClick={onAdd}
        className={`mt-1 rounded-lg bg-sp-accent px-3 py-1.5 text-caption font-medium text-sp-accent-fg transition-colors duration-sp-quick ${SIDE_PIN_MEMO_FOCUS}`}
      >
        첫 메모 쓰기
      </button>
    </div>
  );
}
