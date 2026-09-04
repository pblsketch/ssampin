export interface StudentInfo {
  readonly id: string;
  /** 출석번호 */
  readonly number: number;
  readonly name: string;
  /** 학년 (수업반: 서로 다른 소속 학생이 섞인 경우) */
  readonly grade?: number;
  /** 반 (수업반: 서로 다른 소속 학생이 섞인 경우) */
  readonly classNum?: number;
}

export interface AssignmentTarget {
  readonly type: 'class' | 'teaching';
  /** 학급 이름 (예: "1학년 2반") 또는 수업반 이름 */
  readonly name: string;
  /**
   * 수업반 UUID (type='teaching'일 때만 의미).
   * 담임반과 수업반 이름이 같아도 이 id로 정확히 구분한다.
   * 수업반 이름이 바뀌어도 과제와의 연결이 끊기지 않는다.
   */
  readonly teachingClassId?: string;
  readonly students: readonly StudentInfo[];
}

export interface DriveFolder {
  /** Google Drive 폴더 ID */
  readonly id: string;
  readonly name: string;
  /** 상위 루트 폴더 ID */
  readonly rootFolderId?: string;
}

/** 제출 방식: 파일만 / 텍스트만 / 둘 다 */
export type SubmitType = 'file' | 'text' | 'both';

export interface Assignment {
  readonly id: string;
  /** 과제 제목 */
  readonly title: string;
  /** 과제 설명 */
  readonly description?: string;
  /** 마감일시 (ISO 8601) */
  readonly deadline: string;
  readonly target: AssignmentTarget;
  readonly driveFolder: DriveFolder;
  /** 제출 방식 */
  readonly submitType: SubmitType;
  /** 허용 파일 형식 */
  readonly fileTypeRestriction: 'all' | 'image' | 'document';
  /** 지각 제출 허용 여부 */
  readonly allowLate: boolean;
  /** 재제출 허용 여부 */
  readonly allowResubmit: boolean;
  /**
   * true면 학생 제출 폼에서 학년/반/번호 입력을 생략하고 이름만으로 매칭.
   * 전학공·동아리 등 번호 체계가 없는 명단용.
   */
  readonly identifyByName?: boolean;
  /** 학생 제출 페이지 공유 URL */
  readonly shareUrl: string;
  /** 축약된 공유 URL (숏링크) */
  readonly shortUrl?: string;
  /** 교사 전용 관리 키 */
  readonly adminKey: string;
  /** 생성일시 (ISO 8601) */
  readonly createdAt: string;
  /**
   * 이 과제를 만든 구글 계정(이메일).
   *
   * 학생이 낸 파일은 서버가 **이 계정의** 토큰으로 드라이브에 올린다. 그래서 선생님이
   * 다른 구글 계정으로 다시 로그인하면, 앱은 "연결됨"이라고 하는데 학생은 계속 막힌다.
   * 그 어긋남을 알아채려고 만든 계정을 남겨 둔다.
   *
   * 이 값이 생기기 전(v2.4.5 이하)에 만든 과제에는 없다 — 없으면 대조를 건너뛴다.
   */
  readonly teacherEmail?: string;
  /**
   * 이 과제가 겨냥한 2022 개정 성취기준 코드. 과제에 코드가 달려 있으면 그 제출물이 같은 학생의
   * 해당 주제(탐구 흐름)에 **산출물 후보**로 자동 표시된다. 선택 — 없어도 과제는 그대로 돈다.
   */
  readonly standardCodes?: readonly string[];
}

export interface Submission {
  readonly id: string;
  readonly assignmentId: string;
  /** 학생 ID (로컬 학생 데이터 연결용, 없을 수 있음) */
  readonly studentId?: string;
  /** 학년 */
  readonly studentGrade?: string;
  /** 반 */
  readonly studentClass?: string;
  /** 출석번호 */
  readonly studentNumber: number;
  readonly studentName: string;
  /** 제출일시 (ISO 8601) */
  readonly submittedAt: string;
  readonly fileName: string | null;
  /** 파일 크기 (bytes) */
  readonly fileSize: number;
  /** Google Drive 파일 ID */
  readonly driveFileId?: string;
  /** 텍스트 제출 내용 */
  readonly textContent?: string;
  /**
   * 제출 **파일**에서 뽑아낸 본문(텍스트·HWP·PDF 등). 지금까지 파일 제출물은 근거 창고에 파일명만
   * 들어갔고 본문은 드라이브에만 있었다 — 같은 파일인데 "첨부"로 올리면 본문이 들어오고 과제수합으로
   * 내면 안 들어오는 비대칭이었다. 추출은 별도 작업(T5)이 채운다. 없으면 추출 전이거나 실패(이미지 등).
   */
  readonly extractedText?: string;
  /** 지각 제출 여부 */
  readonly isLate: boolean;
}

export interface AssignmentsData {
  readonly assignments: readonly Assignment[];
}
