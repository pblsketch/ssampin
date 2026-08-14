/**
 * 설문/체크리스트 Supabase 클라이언트
 *
 * survey_responses 테이블은 RLS로 Public read/insert가 열려있으므로
 * anon key만으로 직접 REST API 호출이 가능하다.
 *
 * ⚠️ 위 "Public read" 는 정리 대상이다(계획서 P0-3). 응답 내용이 평문이라
 *    상담 예약보다 우선순위가 높다.
 */

import { throwIfPermissionError } from './supabaseAccessError';

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

  private ensureConfigured(): void {
    if (!this.baseUrl || !this.anonKey) {
      throw new Error('Supabase is not configured');
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
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
    pinProtection?: boolean;
    studentPinHashes?: Record<string, string>;
  }): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/surveys`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'return=minimal',
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
        pin_protection: params.pinProtection ?? false,
        pin_hashes: params.studentPinHashes ?? null,
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
    this.ensureConfigured();
    const res = await fetch(
      `${this.baseUrl}/rest/v1/surveys?id=eq.${id}&select=id,title,description,questions,due_date,target_count,is_closed`,
      { headers: this.headers() },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(
        `[SurveySupabaseClient.getSurvey] HTTP ${res.status} ${res.statusText} | id=${id} | body=${body.slice(0, 200)}`,
      );
      throw new Error(`Supabase getSurvey failed: ${res.status} ${res.statusText}`);
    }
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
   *
   * 실패 시 빈 배열로 silent fail 하면 사용자가 "응답 0건"으로 오인하고
   * 동기화 문제로 신고하게 된다(2026-05-14 사용자 신고 사례). 실패는 throw 한다.
   */
  /**
   * 예전에는 survey_responses 를 직접 조회했다. PostgREST 는 클라이언트가 보낸 필터를
   * 신뢰할 뿐이라 필터를 뺀 요청으로 전 행이 나왔다(2026-08-14 실측 129행, answers 평문).
   * 지금은 adminKey 를 함께 보내 **그 설문의 응답만** 받는다 — 마이그레이션 046.
   */
  async getResponses(surveyId: string, adminKey: string): Promise<SurveyResponsePublic[]> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/get_survey_responses`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_survey_id: surveyId, p_admin_key: adminKey }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 권한 오류는 "무엇을 해야 하는지" 알려준다 (관리 키 불일치와 구분)
      throwIfPermissionError(res.status, '설문 응답', body);
      console.error(
        `[SurveySupabaseClient.getResponses] HTTP ${res.status} ${res.statusText} | surveyId=${surveyId} | body=${body.slice(0, 200)}`,
      );
      throw new Error(`Supabase getResponses failed: ${res.status} ${res.statusText}`);
    }
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
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/survey_responses`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'return=minimal',
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
  async checkAlreadyResponded(surveyId: string, studentNumber: number): Promise<boolean> {
    this.ensureConfigured();
    // 여부만 필요하므로 boolean RPC 사용 — 남의 응답 내용은 나가지 않는다 (마이그레이션 046)
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/has_survey_response`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_survey_id: surveyId, p_student_number: studentNumber }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(
        `[SurveySupabaseClient.checkAlreadyResponded] HTTP ${res.status} ${res.statusText} | surveyId=${surveyId} number=${studentNumber} | body=${body.slice(0, 200)}`,
      );
      throw new Error(`Supabase checkAlreadyResponded failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) === true;
  }

  /**
   * 응답 폴링
   */
  startPolling(
    surveyId: string,
    adminKey: string,
    onUpdate: (responses: SurveyResponsePublic[]) => void,
    intervalMs = 30_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const responses = await this.getResponses(surveyId, adminKey);
        onUpdate(responses);
      } catch {
        // 폴링 에러 무시
      }
    };

    void poll();
    timerId = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }
}
