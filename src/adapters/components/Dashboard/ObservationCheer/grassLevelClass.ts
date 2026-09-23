/**
 * 잔디 칸 진하기(ADR-135) — 내 잔디·학기 돌아보기·위젯 카드 주 줄이 같이 쓴다.
 *
 * ★진하기는 `bg-sp-accent` + `opacity-*`로 낸다 — `bg-sp-accent/40` 같은 색 뒤 투명도는 CSS 가 만들어지지 않는다.
 */
export const GRASS_LEVEL_CLASS: Record<0 | 1 | 2 | 3, string> = {
  0: 'border border-sp-border',
  1: 'bg-sp-accent opacity-30',
  2: 'bg-sp-accent opacity-70',
  3: 'bg-sp-accent',
};
