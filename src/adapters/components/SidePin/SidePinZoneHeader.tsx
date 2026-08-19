/**
 * 위젯 칸·메모 칸의 머리말 — 두 칸을 눈으로 갈라 주는 장치.
 *
 * 처음에는 흐린 글씨 한 줄만 두었더니 **두 칸이 구분되지 않았다.** 이 제품의 색 토큰은
 * 라이트 모드에서 `sp-surface`와 `sp-card`의 밝기 차이가 1.2뿐이라(손잡이 칩에서 겪은
 * 것과 같은 문제), 배경색만 달리해서는 아무 경계도 생기지 않는다.
 *
 * 그래서 실제로 차이가 나는 두 단계(`sp-bg`↔`sp-surface` 9.0, `sp-surface`↔`sp-border` 13.2)로
 * 층을 만든다. 칸 바탕은 가장 밝은 `sp-bg`, 머리말은 한 단계 어두운 `sp-surface`에
 * 아래 테두리를 두어 **띠**로 읽히게 한다.
 *
 * 아이콘은 손잡이의 두 버튼과 같은 것을 쓴다. 손잡이에서 위쪽을 눌러 들어왔으면
 * 패널에서도 같은 아이콘이 위에 있어야, 어디로 들어왔는지가 한눈에 이어진다.
 */
export interface SidePinZoneHeaderProps {
  readonly icon: string;
  readonly title: string;
  /** 오른쪽에 붙일 것(예: 새 메모 단추) */
  readonly action?: React.ReactNode;
}

/**
 * 두 칸의 아이콘과 이름 — 머리말과 접힌 띠가 같은 것을 써야 한다.
 *
 * 띠는 접힌 칸의 머리말이 그대로 내려앉은 것이므로, 값이 갈라지면 접었다 폈을 때
 * 아이콘이 바뀌는 것처럼 보인다.
 */
export const SIDE_PIN_ZONE_META = {
  widget: { icon: 'dashboard', title: '위젯' },
  memo: { icon: 'sticky_note_2', title: '메모' },
} as const;

export function SidePinZoneHeader({ icon, title, action }: SidePinZoneHeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-sp-border bg-sp-surface px-3 py-1.5">
      <span
        aria-hidden
        className="material-symbols-outlined text-icon-sm leading-none text-sp-muted"
      >
        {icon}
      </span>
      <h2 className="flex-1 text-caption font-semibold text-sp-text">{title}</h2>
      {action}
    </header>
  );
}

/**
 * 접힌 칸의 띠 — 누르면 그 칸으로 넘어간다.
 *
 * 머리말과 같은 높이(48px)·같은 색이라 "접힌 머리말"로 읽힌다. 다른 점은 두 가지다.
 * ①띠 전체가 버튼이다 — 제목 글자만 누르게 하면 표적이 너무 작다.
 * ②**오른쪽 슬롯("새 메모")을 그리지 않는다** — 48px 안에 누를 곳이 둘이면
 *   띠를 펴려다 새 메모가 만들어진다.
 *
 * `expandable`이 거짓이면(편집 때문에 접힌 경우) 누를 수 없는 띠로 그린다.
 * 눌러도 편집이 이겨 그대로이므로, 눌리는 척하면 고장으로 보인다.
 */
export interface SidePinCollapsedZoneBandProps {
  readonly icon: string;
  readonly title: string;
  readonly expandable: boolean;
  readonly onExpand: () => void;
}

export function SidePinCollapsedZoneBand({
  icon,
  title,
  expandable,
  onExpand,
}: SidePinCollapsedZoneBandProps) {
  const body = (
    <>
      <span
        aria-hidden
        className="material-symbols-outlined text-icon-sm leading-none text-sp-muted"
      >
        {icon}
      </span>
      <span className="flex-1 text-left text-caption font-semibold text-sp-text">{title}</span>
      {expandable && (
        <span
          aria-hidden
          className="material-symbols-outlined text-icon-sm leading-none text-sp-muted"
        >
          unfold_more
        </span>
      )}
    </>
  );

  const shared =
    'flex h-12 w-full shrink-0 items-center gap-1.5 border-b border-sp-border bg-sp-surface px-3';

  if (!expandable) {
    return (
      <div aria-hidden className={shared}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`${title} 칸 펼치기`}
      className={`${shared} transition-colors duration-sp-quick hover:bg-sp-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:-outline-offset-2`}
    >
      {body}
    </button>
  );
}
