/**
 * 압핀(유원테크, sgpap.com) 시간표 관련 타입 정의.
 *
 * 나이스 Open API는 학급 시간표만 제공하고, 압핀을 쓰는 학교는 별도 시스템을 쓴다.
 * 압핀 인터넷 서버(www.sgpap.com)의 공개 데이터를 해석해 학급/교사 시간표를 구성한다.
 * 비공식 데이터원이라 서비스 개편 시 언제든 깨질 수 있음 — 실패 시 나이스/직접 입력
 * 폴백이 전제된 부가 기능으로만 설계한다. (프로토콜 실측: docs/압핀-시간표-연동-가능성-조사.md)
 *
 * 인코딩: 정적 시간표 파일(h/g/t)은 EUC-KR, php 응답(getupdir/dnele)은 UTF-8 — 혼재.
 * 디코딩은 infrastructure(AppinApiClient)가 담당하고, 여기서는 디코딩된 문자열만 다룬다.
 */

/** 압핀 학교 (getupdir 조회 결과) */
export interface AppinSchool {
  /** 학교 식별자 (예: '0650') */
  readonly webdir: string;
  /** 조회에 사용한 학교명 */
  readonly name: string;
  /** 조회에 사용한 시/군 */
  readonly city: string;
  /** getupdir 응답의 날짜 필드(yyyymmdd) — 대략 마지막 주차의 기준일. 현재 주차 추정에 사용. */
  readonly date?: string;
}

/**
 * 압핀 원소표 (dnele.php 응답 `<status>&<학급>&<교사번호>&<특별실>&<버전>`).
 * 교차검증(gstime.php/hbtime.php 대조)으로 확정: field1=학급, field2=교사번호, field3=특별실.
 */
export interface AppinElements {
  /** 학급 라벨 목록(dnele field1). 학교 설정에 따라 '1-1' 또는 교실코드일 수 있다. */
  readonly elements: readonly string[];
  /** 교사 번호 목록(dnele field2). 예: ['1','2',…,'54'] — 교사 시간표 조회 번호 범위. */
  readonly teacherNumbers: readonly string[];
  /** 특별실 이름 목록(dnele field3). 예: ['정보실']. */
  readonly movementRooms: readonly string[];
}

/**
 * 학급 참조 — 원소 목록에서 'G-C'(학년-반) 형식만 파생한다.
 * 시간표 파일의 index번째 줄이 이 학급의 주간 시간표에 대응한다(실측 확인).
 */
export interface AppinClassRef {
  readonly grade: number;
  readonly classNum: number;
  /** 원본 라벨 (예: '1-1') */
  readonly label: string;
  /** 원소 목록에서의 0-기반 줄 인덱스 (시간표 파일의 줄 번호와 동일) */
  readonly index: number;
}

/** 파싱된 시간표 한 칸. 빈 시간은 null. */
export interface AppinCell {
  readonly subject: string;
  /**
   * '과목/뒤' 의 뒷부분(없으면 null).
   * - 교사 파일(g)·특별실 파일(t): 학급 라벨(예 '1-7') — 교사가 가는 반.
   * - 학급 이동수업: 이동교실(예 '1음악실1').
   */
  readonly room: string | null;
}

/** 한 대상의 주간 격자 — [요일][교시] = 셀 | null */
export type AppinDayGrid = readonly (readonly (AppinCell | null)[])[];

/** 학교 폴더의 파일 메타 (디렉터리 인덱스 — 현재 주차 판정용) */
export interface AppinFileMeta {
  readonly name: string;
  /** 수정 시각 (ISO 문자열, 파싱 실패 시 null). 사전식 비교로 최신 파일 판별 가능. */
  readonly modified: string | null;
  readonly size: string;
}

/** 압핀 연동 에러 유형 (미등록 학교는 SCHOOL_NOT_FOUND 로 안내) */
export type AppinErrorType = 'NETWORK_ERROR' | 'SERVICE_CHANGED' | 'NO_DATA' | 'SCHOOL_NOT_FOUND';

export class AppinError extends Error {
  constructor(
    public readonly errorType: AppinErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'AppinError';
  }
}

/** 사용자 친화적 에러 메시지 */
export function getAppinErrorMessage(errorType: AppinErrorType): string {
  switch (errorType) {
    case 'NETWORK_ERROR':
      return '압핀 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.';
    case 'SERVICE_CHANGED':
      return '압핀 서비스 구조가 바뀐 것 같아요. 앱 업데이트를 기다리시거나, 나이스 불러오기·직접 입력을 이용해주세요.';
    case 'NO_DATA':
      return '이 학교의 시간표 데이터가 아직 없어요. 학기 중인지 확인해주세요.';
    case 'SCHOOL_NOT_FOUND':
      return '압핀에 등록된 학교를 찾지 못했어요. 시/군과 학교명을 압핀 앱에 표시되는 그대로 정확히 입력했는지 확인해주세요.';
  }
}
