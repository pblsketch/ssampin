/**
 * 설문/체크리스트 Supabase 클라이언트
 *
 * survey_responses 테이블은 RLS로 Public read/insert가 열려있으므로
 * anon key만으로 직접 REST API 호출이 가능하다.
 */

interface SurveyRow {
  id: string;
  title: string;
  description: string | null;
  mode: string;
  questions: unknown;
  due_date: string | null;
  category_color: string;
  admin_key: string;
  target_count: number;
  is_closed: boolean;
  created_at: string;
}

interface ResponseRow {
  id: string;
  survey_id: string;
  student_number: number;
  answers: unknown;
  submitted_at: string;
}

export interface SurveyPublic {
  id: string;
  title: string;
  description?: string;
  questions: ReadonlyArray<{
    id: string;
    type: 'yesno' | 'choice' | 'text';
    label: string;
    options?: readonly string[];
    required: boolean;
  }>;
  dueDate?: string;
  targetCount: number;
  isClosed: boolean;
}

export interface SurveyResponsePublic {
  id: string;
  surveyId: string;
  studentNumber: number;
  answers: ReadonlyArray<{ questionId: string; value: string | boolean }>;
  submittedAt: string;
}

export class SurveySupabaseClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
    };
  }

  /**
   * 설문을 Supabase에 등록 (학생 응답 모드용)
   */
  async createSurvey(params: {
    id: string;
    title: string;
    description?: string;
    mode: 'teacher' | 'student';
    questions: unknown;
    dueDate?: string;
    adminKey: string;
    targetCount: number;
  }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/rest/v1/surveys`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: params.id,
        title: params.title,
        description: params.description ?? null,
        mode: params.mode,
        questions: params.questions,
        due_date: params.dueDate ?? null,
        admin_key: params.adminKey,
        target_count: params.targetCount,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create survey: ${err}`);
    }
  }

  /**
   * 설문 공개 정보 조회
   */
  async getSurvey(id: string): Promise<SurveyPublic | null> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/surveys?id=eq.${id}&select=id,title,description,questions,due_date,target_count,is_closed`,
      { headers: this.headers() },
    );

    if (!res.ok) return null;
    const rows = (await res.json()) as SurveyRow[];
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      questions: row.questions as SurveyPublic['questions'],
      dueDate: row.due_date ?? undefined,
      targetCount: row.target_count,
      isClosed: row.is_closed,
    };
  }

  /**
   * 응답 목록 조회 (교사용)
   */
  async getResponses(surveyId: string): Promise<SurveyResponsePublic[]> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/survey_responses?survey_id=eq.${surveyId}&order=student_number.asc`,
      { headers: this.headers() },
    );

    if (!res.ok) return [];
    const rows = (await res.json()) as ResponseRow[];

    return rows.map((r) => ({
      id: r.id,
      surveyId: r.survey_id,
      studentNumber: r.student_number,
      answers: r.answers as SurveyResponsePublic['answers'],
      submittedAt: r.submitted_at,
    }));
  }

  /**
   * 학생 응답 제출
   */
  async submitResponse(
    surveyId: string,
    studentNumber: number,
    answers: ReadonlyArray<{ questionId: string; value: string | boolean }>,
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/rest/v1/survey_responses`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        survey_id: surveyId,
        student_number: studentNumber,
        answers,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        return { success: false, message: '이미 응답하셨습니다.' };
      }
      return { success: false, message: '제출에 실패했습니다.' };
    }

    return { success: true, message: '제출이 완료되었습니다.' };
  }

  /**
   * 중복 응답 확인
   */
  async checkAlreadyResponded(
    surveyId: string,
    studentNumber: number,
  ): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/survey_responses?survey_id=eq.${surveyId}&student_number=eq.${studentNumber}&select=id`,
      { headers: this.headers() },
    );

    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  }

  /**
   * 응답 폴링
   */
  startPolling(
    surveyId: string,
    onUpdate: (responses: SurveyResponsePublic[]) => void,
    intervalMs = 30_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const responses = await this.getResponses(surveyId);
        onUpdate(responses);
      } catch {
        // 폴링 에러 무시
      }
    };

    void poll();
    timerId = setInterval(() => { void poll(); }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }
}
