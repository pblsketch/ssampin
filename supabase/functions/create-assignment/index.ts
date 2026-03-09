/**
 * 교사 과제 생성 — Google access_token으로 교사 인증
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Google access_token으로 교사 이메일 검증 */
async function verifyGoogleToken(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Google access_token에서 교사 이메일 검증
    const authHeader = req.headers.get('Authorization');
    const googleAccessToken = authHeader?.replace('Bearer ', '');

    if (!googleAccessToken) {
      return errorResponse('Authorization 헤더가 필요합니다', 401);
    }

    const teacherEmail = await verifyGoogleToken(googleAccessToken);
    if (!teacherEmail) {
      return errorResponse('인증에 실패했습니다', 401);
    }

    // 2. 요청 본문 파싱
    const body = await req.json();
    const {
      title,
      description,
      deadline,
      targetType,
      targetName,
      studentList,
      driveFolderId,
      driveRootFolderId,
      submitType,
      fileTypeRestriction,
      allowLate,
      allowResubmit,
    } = body;

    if (!title || !deadline || !targetName || !studentList || !driveFolderId) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    // 3. admin_key 랜덤 생성
    const adminKey = crypto.randomUUID();

    // 4. DB 저장
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: assignment, error } = await supabase
      .from('assignments')
      .insert({
        teacher_id: teacherEmail,
        admin_key: adminKey,
        title,
        description: description ?? null,
        deadline,
        target_type: targetType ?? 'class',
        target_name: targetName,
        student_list: studentList,
        drive_folder_id: driveFolderId,
        drive_root_folder_id: driveRootFolderId ?? null,
        submit_type: submitType ?? 'file',
        file_type_restriction: fileTypeRestriction ?? 'all',
        allow_late: allowLate ?? true,
        allow_resubmit: allowResubmit ?? true,
      })
      .select('id')
      .single();

    if (error) {
      return errorResponse(`과제 생성 실패: ${error.message}`, 500);
    }

    return jsonResponse({ id: assignment.id, adminKey });
  } catch (err) {
    return errorResponse(`서버 오류: ${(err as Error).message}`, 500);
  }
});
