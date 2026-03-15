const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
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
  pinProtection: boolean;
}

interface SurveyRow {
  id: string;
  title: string;
  description: string | null;
  questions: unknown;
  due_date: string | null;
  target_count: number;
  is_closed: boolean;
  pin_protection: boolean;
  pin_hashes: Record<string, string> | null;
}

export async function getSurveyPublic(surveyId: string): Promise<SurveyPublic | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/surveys?id=eq.${surveyId}&select=id,title,description,questions,due_date,target_count,is_closed,pin_protection`,
      { headers: headers() },
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
      pinProtection: row.pin_protection ?? false,
    };
  } catch {
    return null;
  }
}

export async function checkAlreadyResponded(
  surveyId: string,
  studentNumber: number,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/survey_responses?survey_id=eq.${surveyId}&student_number=eq.${studentNumber}&select=id`,
      { headers: headers() },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export interface SubmitResult {
  success: boolean;
  message: string;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPin(
  surveyId: string,
  studentNumber: number,
  pin: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/surveys?id=eq.${surveyId}&select=pin_hashes`,
      { headers: headers() },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ pin_hashes: Record<string, string> | null }>;
    if (rows.length === 0) return false;

    const hashes = rows[0]!.pin_hashes;
    if (!hashes) return true; // PIN 없으면 통과

    const expectedHash = hashes[String(studentNumber)];
    if (!expectedHash) return false;

    const inputHash = await hashPin(pin);
    return inputHash === expectedHash;
  } catch {
    return false;
  }
}

export async function submitSurveyResponse(data: {
  surveyId: string;
  studentNumber: number;
  answers: ReadonlyArray<{ questionId: string; value: string | boolean }>;
}): Promise<SubmitResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/survey_responses`, {
      method: 'POST',
      headers: {
        ...headers(),
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        survey_id: data.surveyId,
        student_number: data.studentNumber,
        answers: data.answers,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        return { success: false, message: '이미 응답하셨습니다.' };
      }
      return { success: false, message: '제출에 실패했습니다.' };
    }

    return { success: true, message: '제출이 완료되었습니다!' };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' };
  }
}
