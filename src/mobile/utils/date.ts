/**
 * 모바일 공용 날짜 유틸.
 * 여러 스토어·페이지에 동일하게 복사돼 있던 구현을 단일 소스로 통합한다.
 *
 * ⚠️ `useMobileMealStore` 의 하이픈 없는 `YYYYMMDD`(NEIS API 포맷)는 여기에 포함하지 않는다.
 */

/** 오늘 날짜를 로컬 기준 `YYYY-MM-DD` 문자열로 반환. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 요일 라벨 (0=일 ~ 6=토). */
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** `YYYY-MM-DD` 문자열을 `M월 D일 (요일)` 형태로 포맷. */
export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}
