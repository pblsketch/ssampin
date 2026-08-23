/**
 * 요약 함수들이 공유하는 날짜 셈 (순수 함수).
 *
 * ★`new Date('2026-08-24')` 는 UTC 로 해석되고 `new Date(y, m, d)` 는 로컬로 해석된다.
 * 두 방식을 한 파일 안에서 섞으면 시간대에 따라 **하루가 어긋난다.** 여기서는 YYYY-MM-DD
 * 문자열만 다루고 셈은 전부 `Date.UTC` 로 한다 — 문자열이 곧 결과이므로 시간대가 개입할
 * 여지 자체가 없다.
 */

const DAY_NAMES: readonly string[] = ['일', '월', '화', '수', '목', '금', '토'];

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** YYYY-MM-DD 에 일수를 더한다. */
export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** YYYY-MM-DD 의 요일 한 글자('월'~'일'). 모델이 "무슨 요일"을 묻는 자리에 쓴다. */
export function dayName(date: string): string {
  return DAY_NAMES[new Date(toUtc(date)).getUTCDay()] ?? '';
}

/**
 * from~to(포함)의 날짜를 차례로 준다. `maxDays` 를 넘으면 거기서 멈추고 `truncated: true`.
 *
 * 기간 자체에는 상한을 두지 않는다는 오너 결정 ④ 를 지키되, 한 번에 **담아 보낼 수 있는 양**
 * 에는 한계가 있으므로 잘린 사실을 드러낸다.
 */
export function eachDate(
  from: string,
  to: string,
  maxDays: number,
): { readonly dates: readonly string[]; readonly truncated: boolean } {
  const dates: string[] = [];
  const end = toUtc(to);
  let cursor = toUtc(from);
  while (cursor <= end) {
    if (dates.length >= maxDays) return { dates, truncated: true };
    dates.push(fromUtc(cursor));
    cursor += 86_400_000;
  }
  return { dates, truncated: false };
}
