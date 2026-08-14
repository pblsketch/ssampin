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
