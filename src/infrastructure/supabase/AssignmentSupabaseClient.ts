/**
 * 과제수합 Supabase Edge Function 클라이언트
 *
 * RLS가 모든 테이블 직접 접근을 차단하므로,
 * 모든 데이터 조작은 Edge Function을 경유한다.
 */
import type { Submission } from '@domain/entities/Assignment';

/** 과제 생성 요청 파라미터 */
export interface CreateAssignmentRequest {
  readonly title: string;
  readonly description?: string;
  readonly deadline: string;
  readonly targetType?: string;
  readonly targetName: string;
  readonly studentList: ReadonlyArray<{
    readonly id: string;
    readonly number: number;
    readonly name: string;
  }>;
  readonly driveFolderId: string;
  readonly driveRootFolderId?: string;
  readonly submitType?: string;
  readonly fileTypeRestriction?: string;
  readonly allowLate?: boolean;
  readonly allowResubmit?: boolean;
}

/** Edge Function 에러 응답 */
interface ErrorResponse {
  error: string;
}

export class AssignmentSupabaseClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  /**
   * Edge Function 호출 헬퍼
   */
  private async invoke<T>(
    functionName: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}/functions/v1/${functionName}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as ErrorResponse;
      throw new Error(err.error ?? `Edge Function error: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * 과제 생성 (create-assignment Edge Function)
   * @param googleAccessToken 교사의 Google OAuth access token
   * @param params 과제 생성 파라미터
   */
  async createAssignment(
    googleAccessToken: string,
    params: CreateAssignmentRequest,
  ): Promise<{ id: string; adminKey: string }> {
    return this.invoke<{ id: string; adminKey: string }>(
      'create-assignment',
      params,
      { Authorization: `Bearer ${googleAccessToken}` },
    );
  }

  /**
   * 과제 삭제
   * Note: MVP에서는 DB에서만 삭제 (드라이브 파일은 유지)
   */
  async deleteAssignment(
    assignmentId: string,
    adminKey: string,
  ): Promise<void> {
    await this.invoke<{ message: string }>(
      'delete-assignment',
      { assignmentId, adminKey },
    );
  }

  /**
   * 제출 현황 조회 (get-submissions Edge Function)
   */
  async getSubmissions(
    assignmentId: string,
    adminKey: string,
  ): Promise<Submission[]> {
    const raw = await this.invoke<Array<{
      id: string;
      assignment_id: string;
      student_id: string | null;
      student_number: number;
      student_name: string;
      submitted_at: string;
      file_name: string | null;
      file_size: number;
      drive_file_id: string | null;
      text_content: string | null;
      is_late: boolean;
    }>>(
      'get-submissions',
      { assignmentId, adminKey },
    );

    // DB snake_case → domain camelCase 변환
    return raw.map((s) => ({
      id: s.id,
      assignmentId: s.assignment_id,
      studentId: s.student_id ?? undefined,
      studentNumber: s.student_number,
      studentName: s.student_name,
      submittedAt: s.submitted_at,
      fileName: s.file_name,
      fileSize: s.file_size,
      driveFileId: s.drive_file_id ?? undefined,
      textContent: s.text_content ?? undefined,
      isLate: s.is_late,
    }));
  }

  /**
   * 제출 현황 폴링 (MVP: 30초 간격)
   * @returns stopPolling 함수
   */
  startPolling(
    assignmentId: string,
    adminKey: string,
    onUpdate: (submissions: Submission[]) => void,
    intervalMs = 30_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const submissions = await this.getSubmissions(assignmentId, adminKey);
        onUpdate(submissions);
      } catch {
        // 폴링 에러는 무시 (다음 폴링에서 재시도)
      }
    };

    // 즉시 1회 호출 후 반복
    void poll();
    timerId = setInterval(() => { void poll(); }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }

  /**
   * 교사 OAuth 토큰 저장 (save-teacher-token Edge Function)
   * 암호화는 Edge Function 서버 사이드에서 수행
   */
  async saveTeacherToken(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<void> {
    await this.invoke<{ message: string; teacherId: string }>(
      'save-teacher-token',
      tokens,
    );
  }
}
