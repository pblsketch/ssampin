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
  /** 학생 제출 페이지 공유 URL */
  readonly shareUrl: string;
  /** 축약된 공유 URL (숏링크) */
  readonly shortUrl?: string;
  /** 교사 전용 관리 키 */
  readonly adminKey: string;
  /** 생성일시 (ISO 8601) */
  readonly createdAt: string;
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
  /** 지각 제출 여부 */
  readonly isLate: boolean;
}

export interface AssignmentsData {
  readonly assignments: readonly Assignment[];
}
