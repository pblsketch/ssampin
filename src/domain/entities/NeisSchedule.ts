/**
 * NEIS 학사일정 API 관련 타입 정의
 */

/** NEIS 학사일정 API 원본 행 */
export interface NeisScheduleRow {
  readonly AA_YMD: string;                // 학사일자 (YYYYMMDD)
  readonly EVENT_NM: string;              // 행사명
  readonly EVENT_CNTNT: string;           // 행사내용
  readonly ONE_GRADE_EVENT_YN: string;    // 1학년 해당 여부 (Y/N)
  readonly TW_GRADE_EVENT_YN: string;     // 2학년 해당 여부 (Y/N)
  readonly THREE_GRADE_EVENT_YN: string;  // 3학년 해당 여부 (Y/N)
  readonly SBTR_DD_SC_NM: string;         // 수업공제일 구분 (공휴일/해당없음)
  readonly AY: string;                    // 학년도
  readonly LOAD_DTM: string;              // 데이터 적재일
}

/** 파싱된 NEIS 학사일정 이벤트 */
export interface NeisScheduleEvent {
  readonly eventId: string;       // `${AA_YMD}_${hash(EVENT_NM)}` 고유 키
  readonly title: string;         // EVENT_NM
  readonly date: string;          // YYYY-MM-DD
  readonly schoolYear: string;    // AY
  readonly gradeYn: {
    readonly grade1: boolean;
    readonly grade2: boolean;
    readonly grade3: boolean;
  };
  readonly subtractDayType: string; // 수업공제일 구분
  readonly eventContent: string;    // EVENT_CNTNT
  readonly loadDate: string;        // LOAD_DTM
}

/** NEIS 학사일정 설정 */
export interface NeisScheduleSettings {
  readonly enabled: boolean;
  readonly autoSync: boolean;
  readonly syncIntervalHours: number;   // 기본 24
  readonly lastSyncAt: string | null;
  readonly categoryId: string;          // 학사일정 카테고리 ID
  readonly categoryColor: string;       // 기본 '#8B5CF6' (보라)
  readonly gradeFilter: readonly number[]; // 빈 배열 = 전체
  readonly showHolidays: boolean;       // 공휴일 표시 (기본 true)
  readonly syncedCount: number;         // 동기화된 일정 건수
}

/** 기본 NEIS 학사일정 설정 */
export const DEFAULT_NEIS_SCHEDULE_SETTINGS: NeisScheduleSettings = {
  enabled: false,
  autoSync: true,
  syncIntervalHours: 24,
  lastSyncAt: null,
  categoryId: 'neis-schedule',
  categoryColor: 'purple',
  gradeFilter: [],
  showHolidays: true,
  syncedCount: 0,
};

/** NEIS 학사일정 카테고리 (자동 생성용) */
export const NEIS_SCHEDULE_CATEGORY = {
  id: 'neis-schedule',
  name: '학사일정(NEIS)',
  color: 'purple',
} as const;

/* ── 유틸리티 함수 ── */

/** YYYYMMDD → YYYY-MM-DD 변환 */
export function formatNeisDate(yyyymmdd: string): string {
  return `${yyyymmdd.substring(0, 4)}-${yyyymmdd.substring(4, 6)}-${yyyymmdd.substring(6, 8)}`;
}

/** 간단한 문자열 해시 (eventId 생성용) */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** NEIS API 행 → NeisScheduleEvent 변환 */
export function parseNeisScheduleRow(row: NeisScheduleRow): NeisScheduleEvent {
  const date = formatNeisDate(row.AA_YMD);
  const title = row.EVENT_NM.trim();

  return {
    eventId: `${row.AA_YMD}_${simpleHash(title)}`,
    title,
    date,
    schoolYear: row.AY,
    gradeYn: {
      grade1: row.ONE_GRADE_EVENT_YN === 'Y',
      grade2: row.TW_GRADE_EVENT_YN === 'Y',
      grade3: row.THREE_GRADE_EVENT_YN === 'Y',
    },
    subtractDayType: row.SBTR_DD_SC_NM?.trim() ?? '',
    eventContent: row.EVENT_CNTNT?.trim() ?? '',
    loadDate: row.LOAD_DTM ?? '',
  };
}

/** 불필요한 NEIS 일정 필터링 (토요휴업일 등) */
const EXCLUDED_EVENT_NAMES = ['토요휴업일'] as const;

export function filterExcludedNeisEvents(events: readonly NeisScheduleEvent[]): readonly NeisScheduleEvent[] {
  return events.filter((e) => !EXCLUDED_EVENT_NAMES.includes(e.title as typeof EXCLUDED_EVENT_NAMES[number]));
}

/** 같은 날짜 + 같은 제목 중복 제거 */
export function deduplicateNeisEvents(events: readonly NeisScheduleEvent[]): readonly NeisScheduleEvent[] {
  const seen = new Set<string>();
  const result: NeisScheduleEvent[] = [];

  for (const e of events) {
    const key = `${e.date}_${e.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }

  return result;
}

/**
 * 현재 날짜 기반 학년도 범위 반환 (YYYYMMDD 형식)
 *
 * NEIS 학년도(AY)는 시작 연도 기준:
 *   - 2025학년도 = 2025.03.01 ~ 2026.02.28
 *   - 2026학년도 = 2026.03.01 ~ 2027.02.28
 *
 * 3월 학년도 전환기에 새 학년도 데이터가 Open API에 아직 없을 수 있으므로,
 * 이전 학년도 + 현재 학년도 2년치를 조회하여 빈 결과를 방지한다.
 */
export function getAcademicYearRange(): { fromDate: string; toDate: string; academicYear: string } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // 현재 학년도: 3월 이후면 올해, 1~2월이면 전년도
  const academicYear = month >= 3 ? currentYear : currentYear - 1;

  // 이전 학년도 시작 ~ 현재 학년도 끝 (2년치)
  // 예: 2026년 3월 → 20250301 ~ 20270228
  const fromDate = `${academicYear - 1}0301`;
  const toDate = `${academicYear + 1}0228`;

  return { fromDate, toDate, academicYear: String(academicYear) };
}

/** 학년 배지 텍스트 생성 */
export function getGradeBadgeText(gradeYn: { grade1: boolean; grade2: boolean; grade3: boolean }): string {
  const grades: string[] = [];
  if (gradeYn.grade1) grades.push('1');
  if (gradeYn.grade2) grades.push('2');
  if (gradeYn.grade3) grades.push('3');

  if (grades.length === 3) return '전학년';
  if (grades.length === 0) return '';
  return grades.map((g) => `${g}학년`).join(', ');
}
