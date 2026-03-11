const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type SubmitType = 'file' | 'text' | 'both';

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
  students: { number: number; name: string; grade?: number; classNum?: number }[];
}

export async function getAssignmentPublic(
  assignmentId: string,
): Promise<AssignmentPublic | null> {
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
    return (await res.json()) as AssignmentPublic;
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
  if (data.textContent) {
    formData.append('textContent', data.textContent);
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
