import type { Submission } from '../entities/Assignment';

/** 과제 생성 요청 */
export interface CreateAssignmentServiceRequest {
  readonly title: string;
  readonly description?: string;
  readonly deadline: string;
  readonly targetType?: string;
  readonly targetName: string;
  readonly studentList: ReadonlyArray<{
    readonly id: string;
    readonly number: number;
    readonly name: string;
    readonly grade?: number;
    readonly classNum?: number;
  }>;
  readonly driveFolderId: string;
  readonly driveRootFolderId?: string;
  readonly submitType?: string;
  readonly fileTypeRestriction?: string;
  readonly allowLate?: boolean;
  readonly allowResubmit?: boolean;
}

/** 과제수합 서비스 포트 — Supabase Edge Function 연동 */
export interface IAssignmentServicePort {
  /** 과제 생성 (create-assignment Edge Function) */
  createAssignment(
    googleAccessToken: string,
    params: CreateAssignmentServiceRequest,
  ): Promise<{ id: string; adminKey: string }>;

  /** 과제 삭제 */
  deleteAssignment(assignmentId: string, adminKey: string): Promise<void>;

  /** 제출 현황 조회 (get-submissions Edge Function) */
  getSubmissions(assignmentId: string, adminKey: string): Promise<Submission[]>;

  /** 교사 OAuth 토큰 저장 (암호화는 서버에서 수행) */
  saveTeacherToken(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<void>;
}
