/**
 * 교사 제출 현황 조회 — admin_key 인증
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { assignmentId, adminKey } = await req.json();

    if (!assignmentId || !adminKey) {
      return errorResponse('assignmentId와 adminKey가 필요합니다', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // admin_key 검증
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('admin_key')
      .eq('id', assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return errorResponse('과제를 찾을 수 없습니다', 404);
    }

    if (assignment.admin_key !== adminKey) {
      return errorResponse('접근 권한이 없습니다', 403);
    }

    // 제출 현황 조회
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('student_number', { ascending: true });

    if (submissionsError) {
      return errorResponse(`조회 실패: ${submissionsError.message}`, 500);
    }

    return jsonResponse(submissions ?? []);
  } catch (err) {
    return errorResponse(`서버 오류: ${(err as Error).message}`, 500);
  }
});
