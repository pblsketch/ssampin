export interface StudentInfo {
  readonly id: string;
  /** 출석번호 */
  readonly number: number;
  readonly name: string;
}

export interface AssignmentTarget {
  readonly type: 'class';
  /** 학급 이름 (예: "1학년 2반") */
  readonly name: string;
  readonly students: readonly StudentInfo[];
}

export interface DriveFolder {
  /** Google Drive 폴더 ID */
  readonly id: string;
  readonly name: string;
  /** 상위 루트 폴더 ID */
  readonly rootFolderId?: string;
}

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
  /** 허용 파일 형식 */
  readonly fileTypeRestriction: 'all' | 'image' | 'document';
  /** 지각 제출 허용 여부 */
  readonly allowLate: boolean;
  /** 재제출 허용 여부 */
  readonly allowResubmit: boolean;
  /** 학생 제출 페이지 공유 URL */
  readonly shareUrl: string;
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
  /** 출석번호 */
  readonly studentNumber: number;
  readonly studentName: string;
  /** 제출일시 (ISO 8601) */
  readonly submittedAt: string;
  readonly fileName: string;
  /** 파일 크기 (bytes) */
  readonly fileSize: number;
  /** Google Drive 파일 ID */
  readonly driveFileId?: string;
  /** 지각 제출 여부 */
  readonly isLate: boolean;
}

export interface AssignmentsData {
  readonly assignments: readonly Assignment[];
}
