/**
 * 컴시간알리미(comcigan) 시간표 관련 타입 정의.
 *
 * 나이스 Open API는 학급 시간표만 제공(교사 필드 없음)하므로, 교사 시간표 자동
 * 불러오기는 컴시간알리미의 공개 데이터를 해석해 구성한다. 비공식 데이터원이라
 * 서비스 개편 시 언제든 깨질 수 있음 — 실패 시 엑셀/수동 입력 폴백이 전제된
 * 부가 기능으로만 설계한다. (해석 공식 실측: 2026-07-02, 온양여자고등학교)
 */

/** 컴시간 학교 검색 결과 */
export interface ComciganSchool {
  readonly code: number;
  readonly name: string;
  readonly regionName: string;
}

/**
 * 학교 전체 시간표 원본 격자 — [학년][반][요일][교시] 4차원, 전부 1-베이스.
 * 각 요일 배열의 [0]은 교시 수 메타값이며, 셀은 수업 코드(숫자) 또는
 * '>' 접두 문자열(변경 표시)이다. 0/빈 값은 공강.
 */
export type ComciganGrid = readonly (readonly (readonly (readonly (number | string)[])[])[])[];

/** 컴시간에서 수신한 학교 데이터 (수업 코드 해석 전) */
export interface ComciganRawSchoolData {
  readonly schoolName: string;
  /** 교사명 목록 — 끝 글자 마스킹(예: '백순*'), 인덱스로 참조 */
  readonly teachers: readonly string[];
  readonly subjects: readonly string[];
  /** 수업 코드 분해 나머지 연산 기준 (자료.분리, 미제공 시 100) */
  readonly separator: number;
  /** 기본 편성표 격자 (자료481 계열 — 일일 변경 미반영 원본) */
  readonly baseGrid: ComciganGrid;
  /**
   * 교시별 시각 문자열 (자료.일과시간 — 예: '5(13:40)' = 5교시 13:40 시작).
   * 학교가 컴시간에 입력하지 않았으면 미제공(undefined). 시작 시각만 담기며,
   * 끝 시각·점심 위치는 parseComciganPeriodTimes에서 추정한다.
   */
  readonly dayTimes?: readonly string[];
}

/** 해석 완료된 수업 1칸 */
export interface ComciganLesson {
  readonly grade: number;
  readonly classNum: number;
  /** 1=월 ~ 5=금 */
  readonly day: number;
  /** 1-베이스 교시 */
  readonly period: number;
  readonly subject: string;
  readonly teacherIndex: number;
  readonly teacherName: string;
}

/** 교사별 주간 수업 요약 (교사 선택 UI용) */
export interface ComciganTeacherSummary {
  readonly index: number;
  readonly name: string;
  readonly weeklyHours: number;
  readonly subjects: readonly string[];
  /** 자율/창체 같은 편성용 더미 항목 여부 (실제 교사 아님) */
  readonly isDummy: boolean;
  /**
   * 같은 마스킹 이름(예: '김민*')을 가진 선택 가능한 교사가 2명 이상일 때 true.
   * 컴시간이 이름 끝 글자를 마스킹해 넘기므로, 서로 다른 교사가 목록에 동일하게 보인다.
   * 데이터 병합은 아니며(인덱스 별개), 선택 UI에서 과목·시수로 구분하도록 표시할 때 쓴다.
   */
  readonly maskedNameCollision: boolean;
}

/** 컴시간 연동 에러 유형 (미등록 학교는 에러가 아니라 검색 0건 UI로 안내) */
export type ComciganErrorType = 'NETWORK_ERROR' | 'SERVICE_CHANGED' | 'NO_DATA';

export class ComciganError extends Error {
  constructor(
    public readonly errorType: ComciganErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'ComciganError';
  }
}

/** 사용자 친화적 에러 메시지 */
export function getComciganErrorMessage(errorType: ComciganErrorType): string {
  switch (errorType) {
    case 'NETWORK_ERROR':
      return '컴시간 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.';
    case 'SERVICE_CHANGED':
      return '컴시간 서비스 구조가 바뀐 것 같아요. 앱 업데이트를 기다리시거나, 엑셀 불러오기·직접 입력을 이용해주세요.';
    case 'NO_DATA':
      return '이 학교의 시간표 데이터가 아직 없어요. 학기 중인지 확인해주세요.';
  }
}
