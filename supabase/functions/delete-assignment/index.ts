/**
 * 교사 과제 삭제 — admin_key로 권한 검증
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 요청 본문 파싱
    const body = await req.json();
    const { assignmentId, adminKey } = body;

    if (!assignmentId || !adminKey) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    // 2. Supabase 클라이언트 생성
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 3. 과제 존재 확인 및 admin_key 검증
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, admin_key')
      .eq('id', assignmentId)
      .single();

    if (fetchError || !assignment) {
      return errorResponse('과제를 찾을 수 없습니다', 404);
    }

    if (assignment.admin_key !== adminKey) {
      return errorResponse('권한이 없습니다', 403);
    }

    // 4. 과제 삭제 (CASCADE로 제출물도 자동 삭제됨)
    const { error: deleteError } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (deleteError) {
      return errorResponse(`과제 삭제 실패: ${deleteError.message}`, 500);
    }

    return jsonResponse({ message: '과제가 삭제되었습니다' });
  } catch (err) {
    return errorResponse(`서버 오류: ${(err as Error).message}`, 500);
  }
});
