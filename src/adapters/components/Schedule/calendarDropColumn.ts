/**
 * 달력 드래그 앤 드롭 — 가로 좌표가 몇 번째 요일 칸인지 (순수 계산)
 *
 * 드롭은 주(week) 한 줄 전체가 받으므로 좌표로 요일을 정해야 하는데, 예전에는 줄 너비를
 * 7 등분했다. 날짜 칸 사이에는 `gap-x-1`(4px)이 있어 등분 경계와 실제 칸 경계가 어긋나고,
 * 좁은 창일수록 칸 대비 gap 비중이 커져 **가장자리 근처 드롭이 하루 어긋날 수 있다.**
 *
 * 그래서 추정하지 않고 **실제 칸의 rect 경계**를 받아 판정한다. 실기기 확인이 어려운
 * 조작이라 계산을 이 순수 함수로 분리해 테스트로 잠근다.
 */

/** 칸 하나의 가로 경계 (getBoundingClientRect 의 left/right) */
export interface ColumnBound {
  readonly left: number;
  readonly right: number;
}

/**
 * x 좌표가 몇 번째 칸인지. 판정할 수 없으면 `null`.
 *
 *  - 칸 안이면 그 칸.
 *  - 칸 사이 gap 이면 가까운 쪽 칸 — gap 은 어느 칸의 것도 아니므로 손끝에 가까운 쪽이 의도다.
 *  - 줄 양 끝 바깥이면 첫/마지막 칸 — 드롭을 버리는 것보다 끝 칸으로 붙는 쪽이 기대에 맞는다.
 *  - 경계가 비었거나 0 폭(레이아웃 미확정)이면 `null` — 엉뚱한 칸을 짚느니 드롭을 무시한다.
 *
 * `bounds` 는 왼쪽부터 순서대로라고 가정한다 (DOM 순서 그대로 넘기면 된다).
 */
export function columnIndexFromX(x: number, bounds: readonly ColumnBound[]): number | null {
  if (bounds.length === 0) return null;
  if (bounds.some((b) => !(b.right > b.left))) return null;

  for (let i = 0; i < bounds.length; i++) {
    const cell = bounds[i]!;
    if (x >= cell.left && x <= cell.right) return i;
    const next = bounds[i + 1];
    if (next && x > cell.right && x < next.left) {
      return x - cell.right <= next.left - x ? i : i + 1;
    }
  }
  return x < bounds[0]!.left ? 0 : bounds.length - 1;
}
