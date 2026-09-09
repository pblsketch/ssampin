const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * 제출 방식. `selfAssessment` 는 파일도 글도 없이 자기평가 문항만 받는 과제다.
 *
 * ★모르는 값이 올 수 있다(선생님 앱이 더 새 버전일 때). `normalizeSubmitType` 이 모르는 값을
 *   `both` 로 본다 — 입력 칸을 다 보여 주는 쪽이 안전하다. 아무것도 안 보여 주면 학생이 제출할
 *   방법을 잃는다.
 */
export type SubmitType = 'file' | 'text' | 'both' | 'selfAssessment';

const KNOWN_SUBMIT_TYPES: readonly SubmitType[] = ['file', 'text', 'both', 'selfAssessment'];

export function normalizeSubmitType(raw: unknown): SubmitType {
  return typeof raw === 'string' && (KNOWN_SUBMIT_TYPES as readonly string[]).includes(raw)
    ? (raw as SubmitType)
    : 'both';
}

/** 선생님이 만든 자기평가 문항 하나. */
export interface SelfAssessmentQuestion {
  id: string;
  prompt: string;
  maxLength?: number;
  // ★`slot`(관찰 갈래)은 **서버가 안 보낸다**(`get-assignment-public` 이 빼고 내려준다).
  //   담임 갈래 이름이 학생 브라우저에 보일 이유가 없어서다. 여기 선언해 두면 다음 사람이
  //   "오는 값"이라 믿고 쓰게 되므로 타입에서도 뺀다.
}

/** 답변 길이 기본 상한. 서버 `_shared/selfAssessment.ts` 의 MAX_ANSWER_LENGTH 와 같아야 한다. */
export const SELF_ASSESSMENT_MAX_ANSWER_LENGTH = 1000;

export function answerLimitOf(q: SelfAssessmentQuestion): number {
  const raw = q.maxLength;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return SELF_ASSESSMENT_MAX_ANSWER_LENGTH;
  }
  return Math.min(Math.floor(raw), SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
}

/** 글자 수 — 코드 포인트 기준. 서버가 자르는 기준과 같아야 잔여 글자 수가 어긋나지 않는다. */
export function answerLength(text: string): number {
  return Array.from(text).length;
}

export interface AssignmentPublic {
  id: string;
  title: string;
  description?: string;
  deadline: string;
  targetType: 'class' | 'teaching';
  targetName: string;
  submitType: SubmitType;
  fileTypeRestriction: 'all' | 'image' | 'document';
  allowLate: boolean;
  allowResubmit: boolean;
  /** true면 학생이 학년/반/번호 입력 생략, 이름만으로 매칭 */
  identifyByName?: boolean;
  /** 자기평가 문항. 없거나 빈 배열이면 이 과제는 자기평가를 받지 않는다. */
  selfAssessment?: SelfAssessmentQuestion[];
  students: { number: number; name: string; grade?: number; classNum?: number }[];
}

export async function getAssignmentPublic(assignmentId: string): Promise<AssignmentPublic | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-assignment-public`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ assignmentId }),
    });

    if (!res.ok) return null;
    const raw = (await res.json()) as AssignmentPublic;
    // 모르는 제출 방식이 와도 화면이 죽지 않게 여기서 한 번 고른다.
    return { ...raw, submitType: normalizeSubmitType(raw.submitType) };
  } catch {
    return null;
  }
}

export interface SubmitResult {
  success: boolean;
  message: string;
}

export async function submitAssignment(data: {
  assignmentId: string;
  studentGrade: string;
  studentClass: string;
  studentNumber: number;
  studentName: string;
  file?: File;
  textContent?: string;
  /** 자기평가 답변. 문항 원문·갈래는 서버가 과제 정의에서 다시 붙이므로 여기선 id 와 답만 보낸다. */
  selfAssessment?: { questionId: string; answer: string }[];
}): Promise<SubmitResult> {
  const formData = new FormData();
  formData.append('assignmentId', data.assignmentId);
  formData.append('studentGrade', data.studentGrade);
  formData.append('studentClass', data.studentClass);
  formData.append('studentNumber', String(data.studentNumber));
  formData.append('studentName', data.studentName);
  if (data.file) {
    formData.append('file', data.file);
  }
  // 안 보냄 = "그대로 두기". 빈 칸을 "지우기"로 쓰지 않는다(SubmitForm 주석 참고).
  if (data.textContent) {
    formData.append('textContent', data.textContent);
  }
  if (data.selfAssessment && data.selfAssessment.length > 0) {
    formData.append('selfAssessment', JSON.stringify(data.selfAssessment));
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-assignment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    const json = await res.json();

    if (!res.ok) {
      return { success: false, message: json.error ?? '제출에 실패했습니다' };
    }

    return { success: true, message: json.message ?? '제출 완료' };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' };
  }
}
