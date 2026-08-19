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

/**
 * 검색 칸을 띄우기 시작하는 메모 개수 — 이보다 적으면 훑는 게 더 빠르다.
 *
 * 처음에는 5였으나 3으로 낮췄다(2026-08-19). 실사용에서 메모 3~4개를 쓰는 사람에게는
 * 검색 기능이 있다는 사실 자체가 보이지 않아, 아낀 한 줄보다 잃는 것이 컸다.
 */
export const SIDE_PIN_SEARCH_MIN_MEMOS = 3;

export interface SidePinMemoListProps {
  /**
   * 보여줄 메모 전부. 개수를 자르지 않는다 — 옆핀 안에서 위아래로 훑어
   * 모두 볼 수 있어야 한다. 메모 하나 찾으러 본체를 열게 하면 안 된다.
   *
   * 찾는 말이 있으면 **이미 걸러진** 목록이다. 거르는 규칙은 화면이 아니라
   * `selectSidePinMemos`가 정한다.
   */
  readonly items: readonly SidePinMemoListItem[];
  readonly loaded: boolean;
  /** 거르기 전 전체 개수 — "아직 없다"와 "검색에 안 걸렸다"를 가른다 */
  readonly total: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /**
   * 검색 칸에 손이 가 있는지 알린다.
   *
   * 이게 없으면 **찾는 말을 치는 도중에 패널이 접힌다.** 옆핀은 마우스가 벗어나면
   * 접히는데, 키보드로 검색어를 치는 동안 마우스는 대개 딴 데 있다. 메모를 쓸 때와
   * 똑같은 문제이고, 똑같이 "쓰는 중"으로 막는다.
   */
  readonly onSearchFocusChange: (focused: boolean) => void;
  readonly onOpen: (id: string) => void;
  readonly onAdd: () => void;
}

export function SidePinMemoList({
  items,
  loaded,
  total,
  query,
  onQueryChange,
  onSearchFocusChange,
  onOpen,
  onAdd,
}: SidePinMemoListProps) {
  const searching = query.trim() !== '';
  // 메모가 몇 개 없으면 검색 칸이 자리만 차지한다. 다만 이미 찾는 중이면
  // 결과가 줄어도 칸이 사라지면 안 된다 — 지울 방법이 없어진다.
  const showSearch = loaded && (total >= SIDE_PIN_SEARCH_MIN_MEMOS || searching);

  return (
    /* 바탕을 칠하지 않는다 — 패널이 깔아 둔 (투명도가 적용된) 배경이 비쳐야 한다 */
    <section aria-label="메모" className="flex h-full flex-col">
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

      {showSearch && (
        <div className="shrink-0 px-2 pt-2">
          <div className="flex items-center gap-1 rounded-lg bg-sp-surface px-2 py-1">
            <span
              aria-hidden
              className="material-symbols-outlined text-icon-sm leading-none text-sp-muted"
            >
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => onSearchFocusChange(true)}
              onBlur={() => onSearchFocusChange(false)}
              onKeyDown={(e) => {
                // Esc는 찾는 말만 지운다. 여기서 멈추지 않으면 패널이 통째로 닫혀
                // 검색하던 흐름에서 튕겨 나간다.
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                onQueryChange('');
              }}
              placeholder="메모 찾기"
              aria-label="메모 찾기"
              className="min-w-0 flex-1 bg-transparent text-caption text-sp-text outline-none placeholder:text-sp-muted"
            />
            {searching && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="찾는 말 지우기"
                className={`flex h-5 w-5 items-center justify-center rounded-full text-sp-muted transition-colors duration-sp-quick hover:bg-sp-bg hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
              >
                <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
                  close
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 머리말이 잘린다.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!loaded ? (
          // 다 불러오기 전에 "없습니다"를 보여주면, 있는데 없다고 말하는 셈이 된다.
          <p className="px-1 py-3 text-caption text-sp-muted">메모를 불러오는 중입니다…</p>
        ) : items.length === 0 && searching ? (
          // 검색 결과가 없을 때 "첫 메모 쓰기"를 내밀면, 있는 메모를 없다고 말하는 셈이 된다.
          <NoSearchResult onClear={() => onQueryChange('')} />
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

/**
 * 찾는 말에 걸린 메모가 없을 때.
 *
 * "아직 메모가 없습니다"와 반드시 달라야 한다. 메모는 있는데 안 걸린 것뿐인데
 * 없다고 말하면, 찾는 말을 지우면 다시 나온다는 사실을 알 길이 없다.
 */
function NoSearchResult({ onClear }: { readonly onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
        search_off
      </span>
      <p className="text-sm text-sp-text">찾는 메모가 없습니다</p>
      <button
        type="button"
        onClick={onClear}
        className={`mt-1 rounded-lg px-3 py-1.5 text-caption font-medium text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
      >
        전체 보기
      </button>
    </div>
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
