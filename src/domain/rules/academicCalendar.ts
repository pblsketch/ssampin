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

/**
 * 레코드의 `date`(YYYY-MM-DD, **사건 발생일**)에서 학기 라벨을 파생한다 — S2.2 term 스탬프의 정본.
 * (ADR-034: epoch = 레코드 단위 term 스탬프)
 *
 * ⚠️ `createdAt`/`updatedAt`(기록 시각) 사용 금지 — 8/10 수업을 9/2에 기록하면 date→'2026-1',
 * createdAt→'2026-2'로 갈리고, 하필 가드가 작동하는 유일한 시점(학기 경계)에 답이 갈린다.
 * 방학 중 밀린 기록은 정상 업무이며 그 기록은 지난 학기 것이어야 한다.
 *
 * 형식이 아니거나 date 부재면 **null(추측 금지)** — 호출자는 term을 붙이지 않는다
 * (부재 = 현행 병합 폴백, 업그레이드 첫날 데이터가 스스로를 격리하지 않게 하는 규칙).
 * 뒤에 시간이 붙은 값('2026-08-10T09:00')도 앞의 날짜만 취해 파생한다.
 */
export function academicTermForDate(date: string | null | undefined): string | null {
  if (typeof date !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  if (month >= 3 && month <= 8) return `${year}-1`;
  if (month >= 9) return `${year}-2`;
  return `${year - 1}-2`;
}

/**
 * 저장 직전 term 스탬프(S2.2) — `date`에서 파생한 학기를 레코드에 부착한다.
 * 병합 3도메인(attendance/observations/student-records)의 build* 저장 조립 함수만 호출한다.
 *
 * 규칙:
 *  - 파생 가능 → `term`을 파생값으로 부착/교정(이미 같으면 원본 객체 그대로 — 참조 보존).
 *  - 파생 불가(date 부재·형식 불일치) → **아무것도 바꾸지 않는다.** 기존 term이 있어도
 *    지우지 않고(정보 보존), 없다고 지어내지도 않는다(추측 금지 — ADR-034 Consequences).
 */
export function withDerivedTerm<T extends { readonly date?: string; readonly term?: string }>(
  record: T,
): T {
  const derived = academicTermForDate(record.date);
  if (derived === null) return record;
  if (record.term === derived) return record;
  return { ...record, term: derived };
}
