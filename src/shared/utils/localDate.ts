/**
 * 로컬 시간대 기준 YYYY-MM-DD 문자열 반환.
 *
 * ⚠️ `new Date().toISOString().slice(0, 10)`은 UTC 기준이므로
 * KST 00:00~08:59 사이에 전날 날짜를 반환한다.
 * 항상 이 함수를 사용할 것.
 */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
