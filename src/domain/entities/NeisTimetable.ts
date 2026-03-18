/**
 * 나이스(NEIS) 시간표 API 관련 타입 정의
 */

/** 학교급별 시간표 API 엔드포인트 */
export type SchoolLevel = 'els' | 'mis' | 'his'; // 초등/중학/고등

/** 나이스 학급 정보 */
export interface NeisClassInfo {
  readonly CLASS_NM: string;
  readonly GRADE: string;
}

/** 나이스 시간표 행 (API 원본) */
export interface NeisTimetableRow {
  readonly PERIO: string;        // 교시
  readonly ITRT_CNTNT: string;   // 과목명
  readonly ALL_TI_YMD: string;   // 날짜 (YYYYMMDD)
  readonly GRADE: string;        // 학년
  readonly CLASS_NM: string;     // 반
}

/** 나이스 API 에러 유형 */
export type NeisErrorType =
  | 'NETWORK_ERROR'
  | 'INVALID_KEY'
  | 'NO_DATA'
  | 'RATE_LIMIT'
  | 'UNKNOWN';

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
    case 'INFO-200': return 'NO_DATA';
    case 'INFO-300': return 'UNKNOWN'; // 필수 파라미터 누락
    case 'ERROR-290': return 'INVALID_KEY';
    case 'ERROR-337': return 'RATE_LIMIT';
    default: return 'UNKNOWN';
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
export function settingsLevelToNeisLevel(level: 'elementary' | 'middle' | 'high' | 'custom'): SchoolLevel {
  switch (level) {
    case 'elementary': return 'els';
    case 'middle': return 'mis';
    case 'high': return 'his';
    case 'custom': return 'his';
  }
}

/** SchoolLevel → 학년 범위 */
export function getGradeRange(level: SchoolLevel): number[] {
  if (level === 'els') return [1, 2, 3, 4, 5, 6];
  return [1, 2, 3];
}

/** 현재 학년도 계산 (3월 이후 = 올해, 1~2월 = 작년) */
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return String(year);
}

/** 현재 학기 (3~7월 = 1학기, 8~2월 = 2학기) */
export function getCurrentSemester(): '1' | '2' {
  const month = new Date().getMonth() + 1;
  return month >= 3 && month <= 7 ? '1' : '2';
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
