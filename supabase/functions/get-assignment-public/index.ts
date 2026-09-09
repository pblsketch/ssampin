/**
 * 학생 제출 페이지용 과제 정보 조회
 * 민감 정보(admin_key, teacher_id, student id) 제외
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { readQuestions } from '../_shared/selfAssessment.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { assignmentId } = await req.json();

    if (!assignmentId) {
      return errorResponse('assignmentId is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: assignment, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (error || !assignment) {
      return errorResponse('과제를 찾을 수 없습니다', 404);
    }

    // 민감 정보 제외, 필요한 필드만 반환
    return jsonResponse({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      deadline: assignment.deadline,
      targetType: assignment.target_type ?? 'class',
      targetName: assignment.target_name ?? '',
      submitType: assignment.submit_type ?? 'file',
      fileTypeRestriction: assignment.file_type_restriction,
      allowLate: assignment.allow_late,
      allowResubmit: assignment.allow_resubmit,
      identifyByName: assignment.identify_by_name ?? false,
      // 자기평가 문항. 학생 화면이 이 배열을 보고 입력 칸을 그린다.
      // 문항이 없으면 빈 배열이라 구버전 학생 화면은 그냥 무시한다.
      // ★`slot`(갈래)은 빼고 보낸다 — 학생 화면이 안 쓰는 값이고, 담임 갈래 이름("인성·관계",
      //   "변화")이 개발자 도구에 그대로 보일 이유가 없다. 안 보낼 수 있는 값은 안 보낸다.
      selfAssessment: readQuestions(assignment.self_assessment).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        ...(q.maxLength !== undefined ? { maxLength: q.maxLength } : {}),
      })),
      // student_list에서 number, name, grade, classNum 반환 (id 제외)
      students: (
        assignment.student_list as Array<{
          number: number;
          name: string;
          grade?: number;
          classNum?: number;
        }>
      ).map((s) => ({ number: s.number, name: s.name, grade: s.grade, classNum: s.classNum })),
    });
  } catch (err) {
    return internalErrorResponse('get-assignment-public', err);
  }
});
