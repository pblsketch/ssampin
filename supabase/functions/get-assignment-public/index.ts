/**
 * 학생 제출 페이지용 과제 정보 조회
 * 민감 정보(admin_key, teacher_id, student id) 제외
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';

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
      submitType: assignment.submit_type ?? 'file',
      fileTypeRestriction: assignment.file_type_restriction,
      allowLate: assignment.allow_late,
      allowResubmit: assignment.allow_resubmit,
      // student_list에서 number, name만 반환 (id 제외)
      students: (assignment.student_list as Array<{ number: number; name: string }>).map(
        (s) => ({ number: s.number, name: s.name }),
      ),
    });
  } catch (err) {
    return errorResponse(`서버 오류: ${(err as Error).message}`, 500);
  }
});
