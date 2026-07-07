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

/**
 * 로컬 시간대 기준 그날의 끝(23:59:59) ISO 유사 문자열 반환.
 * 압핀 파일 수정시각을 "오늘까지"로 비교할 때의 상한으로 쓴다.
 */
export function endOfLocalDayIso(date: Date = new Date()): string {
  return `${toLocalDateString(date)}T23:59:59`;
}
