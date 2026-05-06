/**
 * NEIS 학사일정 API 관련 타입 정의
 */

import type { SchoolLevel } from './Settings';

/** 학년별 행사 해당 여부 (최대 6학년) */
export interface GradeYn {
  readonly grade1: boolean;
  readonly grade2: boolean;
  readonly grade3: boolean;
  readonly grade4: boolean;
  readonly grade5: boolean;
  readonly grade6: boolean;
}

/** NEIS 학사일정 API 원본 행 */
export interface NeisScheduleRow {
  readonly AA_YMD: string;                // 학사일자 (YYYYMMDD)
  readonly EVENT_NM: string;              // 행사명
  readonly EVENT_CNTNT: string;           // 행사내용
  readonly ONE_GRADE_EVENT_YN: string;    // 1학년 해당 여부 (Y/N)
  readonly TW_GRADE_EVENT_YN: string;     // 2학년 해당 여부 (Y/N)
  readonly THREE_GRADE_EVENT_YN: string;  // 3학년 해당 여부 (Y/N)
  readonly FR_GRADE_EVENT_YN: string;     // 4학년 해당 여부
  readonly FIV_GRADE_EVENT_YN: string;    // 5학년 해당 여부
  readonly SIX_GRADE_EVENT_YN: string;    // 6학년 해당 여부
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
  readonly gradeYn: GradeYn;
  readonly subtractDayType: string; // 수업공제일 구분
  readonly eventContent: string;    // EVENT_CNTNT
  readonly loadDate: string;        // LOAD_DTM
}

/**
 * NEIS 학사일정 → 구글 캘린더 동기화 그룹 분류.
 *
 * 100~300건의 학사일정 중 사용자가 일일이 체크하지 않고
 * 그룹 단위로 ON/OFF + 그룹내 개별 미세조정을 할 수 있게 한다.
 */
export type NeisGroup = 'holiday' | 'exam' | 'vacation' | 'event' | 'etc';

export const NEIS_GROUP_LABELS: Readonly<Record<NeisGroup, string>> = {
  holiday: '공휴일',
  exam: '시험·평가',
  vacation: '방학·휴업일',
  event: '학교 행사',
  etc: '기타',
};

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

  // 구글 캘린더 동기화 — 그룹/개별 선택 (영구 저장)
  readonly googleSyncGroups: Readonly<Record<NeisGroup, boolean>>;
  readonly googleSyncExcludedIds: readonly string[];  // 그룹은 ON이지만 개별 제외
  readonly googleSyncIncludedIds: readonly string[];  // 그룹은 OFF이지만 개별 포함

  /**
   * 구글 캘린더 동기화 제안 배너를 영구 dismiss했는지.
   * 사용자가 "다시 보지 않기"를 누르면 true. 이후엔 배너 안 뜸.
   * 동기화하려면 설정 → NEIS 카드의 "구글 캘린더로 동기화" 버튼 직접 사용.
   */
  readonly googleSyncSuggestionDismissed: boolean;
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
  googleSyncGroups: {
    holiday: true,
    exam: true,
    vacation: true,
    event: true,
    etc: false,
  },
  googleSyncExcludedIds: [],
  googleSyncIncludedIds: [],
  googleSyncSuggestionDismissed: false,
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

/**
 * NEIS 이벤트 ID를 (날짜, 제목)에서 재계산.
 *
 * `date`는 'YYYY-MM-DD' 또는 'YYYYMMDD' 둘 다 허용. 내부적으로 'YYYYMMDD'로 정규화.
 * 기존 `parseNeisScheduleRow`가 만들어내는 eventId 포맷(`${YYYYMMDD}_${hash}`)과 동일.
 *
 * 용도: events 스토어에 저장된 옛 NEIS 이벤트 중 `neis.eventId` 메타가 없는 것들을
 *       다음 동기화 사이클에서 자동 매칭하기 위해 재계산.
 */
export function computeNeisEventId(date: string, title: string): string {
  const ymd = date.replace(/-/g, '');
  return `${ymd}_${simpleHash(title.trim())}`;
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
      grade4: row.FR_GRADE_EVENT_YN === 'Y',
      grade5: row.FIV_GRADE_EVENT_YN === 'Y',
      grade6: row.SIX_GRADE_EVENT_YN === 'Y',
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

/** 학교급별 최대 학년 */
export const MAX_GRADE_BY_LEVEL: Record<SchoolLevel, number> = {
  elementary: 6,
  middle: 3,
  high: 3,
  custom: 6,
};

/** 학교급별 학년 목록 생성 */
export function getGradeList(schoolLevel: SchoolLevel): number[] {
  const max = MAX_GRADE_BY_LEVEL[schoolLevel];
  return Array.from({ length: max }, (_, i) => i + 1);
}

/** 학교급 변경 시 유효하지 않은 학년 필터 제거 */
export function sanitizeGradeFilter(
  filter: readonly number[],
  schoolLevel: SchoolLevel,
): number[] {
  const maxGrade = MAX_GRADE_BY_LEVEL[schoolLevel];
  return filter.filter((g) => g <= maxGrade);
}

/**
 * NEIS 학사일정을 5개 그룹으로 분류한다 — 도메인 순수 함수.
 *
 * 분류 우선순위:
 *  1. 공휴일 — `subtractDayType === '공휴일'`
 *  2. 시험·평가 — title에 `시험`/`평가`/`고사`
 *  3. 방학·휴업일 — title에 `방학`/`재량휴업`/`개교기념`
 *  4. 학교 행사 — title에 `체험학습`/`수학여행`/`소풍`/`발표회`/`운동회`/`입학식`/`졸업식`/`행사`
 *  5. 기타 — 위에 매칭 안 되는 모든 것
 */
export function classifyNeisEvent(ev: Pick<NeisScheduleEvent, 'title' | 'subtractDayType'>): NeisGroup {
  if (ev.subtractDayType === '공휴일') return 'holiday';
  const t = ev.title;
  if (/시험|평가|고사/.test(t)) return 'exam';
  if (/방학|재량휴업|개교기념/.test(t)) return 'vacation';
  if (/체험학습|수학여행|소풍|발표회|운동회|입학식|졸업식|행사/.test(t)) return 'event';
  return 'etc';
}

/**
 * 본 NEIS 이벤트가 구글 캘린더에 동기화 대상인지 판정 — 도메인 순수 함수.
 *
 * 우선순위:
 *  1. `googleSyncIncludedIds`에 있으면 무조건 ON
 *  2. `googleSyncExcludedIds`에 있으면 무조건 OFF
 *  3. 그 외엔 분류된 그룹의 토글 상태에 따름
 */
export function shouldSyncToGoogle(
  ev: Pick<NeisScheduleEvent, 'eventId' | 'title' | 'subtractDayType'>,
  settings: Pick<NeisScheduleSettings, 'googleSyncGroups' | 'googleSyncExcludedIds' | 'googleSyncIncludedIds'>,
): boolean {
  if (settings.googleSyncIncludedIds.includes(ev.eventId)) return true;
  if (settings.googleSyncExcludedIds.includes(ev.eventId)) return false;
  return settings.googleSyncGroups[classifyNeisEvent(ev)];
}

/** 학년 배지 텍스트 생성 */
export function getGradeBadgeText(gradeYn: GradeYn, schoolLevel?: SchoolLevel): string {
  const maxGrade = schoolLevel ? MAX_GRADE_BY_LEVEL[schoolLevel] : 6;
  const grades: string[] = [];

  for (let i = 1; i <= maxGrade; i++) {
    const key = `grade${i}` as keyof GradeYn;
    if (gradeYn[key]) grades.push(String(i));
  }

  if (grades.length === maxGrade) return '전학년';
  if (grades.length === 0) return '';
  return grades.map((g) => `${g}학년`).join(', ');
}
