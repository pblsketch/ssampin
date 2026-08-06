/**
 * 학사 달력 규칙 — 학기(term) 라벨 `'YYYY-S'`(예: '2026-1')의 단일 정본.
 *
 * 한국 학사 기준(초·중등교육법 제24조: 학년도 = 3월 1일 ~ 다음 해 2월 말일):
 * 3~8월 = 1학기, 9~12월 = 2학기, 1~2월 = 직전 학년도의 2학기(겨울방학은 학사상 직전 2학기).
 *
 * 이 파일은 라벨 계산·표시 전용이다. 시즌 배너 게이팅 같은 날짜 구간 판정 함수는
 * 의도적으로 두지 않는다(ADR-037 — 학교마다 개학일이 달라 단일 구간을 정의할 수 없음).
 */

/** 학기 라벨의 형식: 4자리 연도-학기(1|2). */
const TERM_RE = /^(\d{4})-([12])$/;

/**
 * 주어진 날짜가 속한 학사 학기 키(예: '2026-1').
 * useAiBridgeConsentStore에서 승격 — 동작은 기존과 동일해야 한다(ackKey 호환).
 */
export function academicTerm(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1~12
  if (m >= 3 && m <= 8) return `${y}-1`;
  if (m >= 9) return `${y}-2`;
  return `${y - 1}-2`;
}

/** 학기 라벨을 분해한다. 형식이 아니면 null. */
export function parseTerm(term: string): { year: number; semester: 1 | 2 } | null {
  const match = TERM_RE.exec(term);
  if (!match) return null;
  return { year: Number(match[1]), semester: Number(match[2]) as 1 | 2 };
}

/** 학기 라벨이 속한 학년도(예: '2026-2' → 2026). 형식이 아니면 null. */
export function schoolYearOf(term: string): number | null {
  return parseTerm(term)?.year ?? null;
}

/** 학년도 표시 문자열(예: 2026 → '2026학년도'). */
export function formatSchoolYearKo(year: number): string {
  return `${year}학년도`;
}

/** 학기 라벨 표시 문자열(예: '2026-2' → '2026학년도 2학기'). 형식이 아니면 원문 그대로. */
export function formatTermKo(term: string): string {
  const parsed = parseTerm(term);
  if (!parsed) return term;
  return `${formatSchoolYearKo(parsed.year)} ${parsed.semester}학기`;
}
