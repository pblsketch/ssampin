/**
 * 나이스(NEIS) 시간표 API 관련 타입 정의
 */
import { academicTerm, academicTermForDate, parseTerm } from '@domain/rules/academicCalendar';

/** 학교급별 시간표 API 엔드포인트 */
export type SchoolLevel = 'els' | 'mis' | 'his'; // 초등/중학/고등

/** 나이스 학급 정보 */
export interface NeisClassInfo {
  readonly CLASS_NM: string;
  readonly GRADE: string;
}

/** 나이스 시간표 행 (API 원본) */
export interface NeisTimetableRow {
  readonly PERIO: string; // 교시
  readonly ITRT_CNTNT: string; // 과목명
  readonly ALL_TI_YMD: string; // 날짜 (YYYYMMDD)
  readonly GRADE: string; // 학년
  readonly CLASS_NM: string; // 반
}

/** 나이스 API 에러 유형 */
export type NeisErrorType = 'NETWORK_ERROR' | 'INVALID_KEY' | 'NO_DATA' | 'RATE_LIMIT' | 'UNKNOWN';

/** 나이스 API 에러 */
export class NeisApiError extends Error {
  constructor(
    public readonly errorType: NeisErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'NeisApiError';
  }
}

/** 나이스 에러 코드 → NeisErrorType 매핑 */
export function mapNeisErrorCode(code: string): NeisErrorType {
  switch (code) {
    case 'INFO-200':
      return 'NO_DATA';
    case 'INFO-300':
      return 'UNKNOWN'; // 필수 파라미터 누락
    case 'ERROR-290':
      return 'INVALID_KEY';
    case 'ERROR-337':
      return 'RATE_LIMIT';
    default:
      return 'UNKNOWN';
  }
}

/** 사용자 친화적 에러 메시지 */
export function getNeisErrorMessage(errorType: NeisErrorType): string {
  switch (errorType) {
    case 'NETWORK_ERROR':
      return '인터넷 연결을 확인해주세요. 오프라인 상태에서는 마지막으로 저장된 시간표를 사용합니다.';
    case 'INVALID_KEY':
      return 'API 키가 올바르지 않습니다. 설정에서 확인해주세요.';
    case 'NO_DATA':
      return '해당 기간의 시간표 데이터가 없습니다. 학기 중인지 확인해주세요.';
    case 'RATE_LIMIT':
      return '일일 호출 횟수를 초과했습니다. API 키를 등록하면 제한 없이 사용할 수 있습니다.';
    case 'UNKNOWN':
      return '시간표를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
}

/* ── 유틸리티 함수 ── */

/** 학교급 문자열 → SchoolLevel 변환 */
export function getSchoolLevel(schoolKind: string): SchoolLevel | null {
  if (schoolKind.includes('초등')) return 'els';
  if (schoolKind.includes('중학')) return 'mis';
  if (schoolKind.includes('고등')) return 'his';
  return null;
}

/** Settings schoolLevel → SchoolLevel 변환 */
export function settingsLevelToNeisLevel(
  level: 'elementary' | 'middle' | 'high' | 'custom',
): SchoolLevel {
  switch (level) {
    case 'elementary':
      return 'els';
    case 'middle':
      return 'mis';
    case 'high':
      return 'his';
    case 'custom':
      return 'his';
  }
}

/** SchoolLevel → 학년 범위 */
export function getGradeRange(level: SchoolLevel): number[] {
  if (level === 'els') return [1, 2, 3, 4, 5, 6];
  return [1, 2, 3];
}

/** 나이스 조회 축 — 학년도(AY)와 학기(SEM)는 항상 한 쌍으로 움직인다. */
export interface NeisTermAxis {
  readonly academicYear: string;
  readonly semester: '1' | '2';
}

/**
 * YYYYMMDD → YYYY-MM-DD (형식이 아니면 null).
 * 나이스 조회는 YYYYMMDD, 앱 내부 날짜는 YYYY-MM-DD라 경계마다 이 변환이 필요하다 —
 * 화면에서 각자 정규식을 다시 쓰지 않도록 여기서 내보낸다.
 */
export function toIsoDate(yyyymmdd: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(yyyymmdd);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * **조회할 날짜**가 속한 나이스 조회 축(학년도 + 학기).
 *
 * 학사 달력 정본(`academicCalendar.academicTermForDate`)에서 파생한다 — 앱 안에 학기 규칙이
 * 두 벌 생기면 경계 달(8월·1~2월)에만 답이 갈려서, 하필 그때 조용히 0건이 된다.
 *
 * ⚠️ "오늘"이 아니라 **조회 기간의 시작일**을 넣어야 한다. 방학 중에 개학 주를 조회하는 것이
 * 정상 사용이며, 그때 필요한 학기는 오늘이 아니라 그 주의 학기다.
 *
 * 형식이 아니면 null(추측 금지) — 호출자가 폴백 축을 정한다.
 */
export function neisTermAxisForDate(yyyymmdd: string): NeisTermAxis | null {
  const iso = toIsoDate(yyyymmdd);
  if (iso === null) return null;
  const parsed = parseTerm(academicTermForDate(iso) ?? '');
  if (parsed === null) return null;
  return { academicYear: String(parsed.year), semester: String(parsed.semester) as '1' | '2' };
}

/**
 * 같은 학년도의 반대 학기 축 — 학기 경계가 학교마다 다른 문제의 폴백.
 *
 * 학사 달력은 8월을 1학기로 보지만 8월 중순에 2학기를 개학하는 학교가 실제로 많고, 그런 학교의
 * 나이스에는 8월 수업이 2학기로 등록돼 있다. 어느 쪽이 맞는지는 학교만 알기 때문에(ADR-037 —
 * 개학일로 구간을 단정하지 않는다) 한쪽으로 조회해 비면 반대쪽도 한 번 조회한다.
 */
export function otherNeisTermAxis(axis: NeisTermAxis): NeisTermAxis {
  return { academicYear: axis.academicYear, semester: axis.semester === '1' ? '2' : '1' };
}

/** 오늘이 속한 학년도 (학사 달력 정본에서 파생 — 3월 이후 = 올해, 1~2월 = 작년) */
export function getCurrentAcademicYear(): string {
  return String(parseTerm(academicTerm())?.year ?? new Date().getFullYear());
}

/** 현재 주의 월~금 범위 (YYYYMMDD) */
export function getCurrentWeekRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, ... 6=토
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    fromDate: formatDate(monday),
    toDate: formatDate(friday),
  };
}

/**
 * 다음 주의 월~금 범위 (YYYYMMDD).
 *
 * 방학 마지막 주에 개학 주를 미리 불러오는 정상 흐름을 위해 필요하다 — 이게 없으면
 * 개학 직전 사용자는 "직접 선택"으로 날짜를 손수 계산해 넣는 수밖에 없었다.
 */
export function getNextWeekRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + mondayOffset + 7);

  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);

  return {
    fromDate: formatDate(nextMonday),
    toDate: formatDate(nextFriday),
  };
}

/** 지난 주의 월~금 범위 (YYYYMMDD) */
export function getLastWeekRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastFriday = new Date(lastMonday);
  lastFriday.setDate(lastMonday.getDate() + 4);

  return {
    fromDate: formatDate(lastMonday),
    toDate: formatDate(lastFriday),
  };
}

/** Date → YYYYMMDD */
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** YYYYMMDD → 표시용 문자열 (M/D) */
export function formatDateDisplay(yyyymmdd: string): string {
  const m = parseInt(yyyymmdd.substring(4, 6), 10);
  const d = parseInt(yyyymmdd.substring(6, 8), 10);
  return `${m}/${d}`;
}
