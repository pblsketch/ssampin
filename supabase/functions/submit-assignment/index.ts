/**
 * 학생 과제 제출 처리
 *
 * 1) 파일 크기 체크 (10MB)
 * 2) 과제 정보 DB 조회
 * 3) 마감 체크
 * 4) 재제출 체크
 * 5) 파일 형식 체크
 * 6) 교사 OAuth 토큰 복호화
 * 7) 토큰 만료 시 refresh (1회 리트라이)
 * 8) Google Drive 업로드
 * 9) submissions upsert
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { decrypt, encrypt } from '../_shared/crypto.ts';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/** 차단 확장자 */
const BLOCKED_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'scr', 'msi', 'com', 'pif',
  'js', 'vbs', 'wsf', 'ps1', 'sh',
];

/** 파일 형식별 허용 확장자 */
const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  all: [],
  image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'],
  document: ['pdf', 'hwp', 'hwpx', 'docx', 'doc', 'pptx', 'xlsx', 'txt'],
};

/** 파일 확장자 체크 */
function isAllowedFile(fileName: string, restriction: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  if (restriction === 'all') return true;
  return (FILE_TYPE_EXTENSIONS[restriction] ?? []).includes(ext);
}

/** 마감 여부 체크 */
function isPastDeadline(deadline: string): boolean {
  return new Date() > new Date(deadline);
}

interface TokenRecord {
  encrypted_access_token: string;
  access_iv: string;
  access_tag: string;
  encrypted_refresh_token: string;
  refresh_iv: string;
  refresh_tag: string;
  expires_at: string;
}

/** Google 토큰 갱신 */
async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json();
}

/** Google Drive에 파일 업로드 (멀티파트) */
async function uploadToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  fileBlob: Blob,
  mimeType: string,
): Promise<{ id: string }> {
  const boundary = '-------ssampin_submit_boundary';
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const parts: Array<Blob | string> = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    fileBlob,
    `\r\n--${boundary}--`,
  ];

  const body = new Blob(parts);

  const res = await fetch(
    `${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }

  return res.json();
}

/** Google Drive 파일 업데이트 (재제출) */
async function updateDriveFile(
  accessToken: string,
  fileId: string,
  fileBlob: Blob,
  mimeType: string,
): Promise<{ id: string }> {
  const boundary = '-------ssampin_update_boundary';
  const metadata = JSON.stringify({});

  const parts: Array<Blob | string> = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    fileBlob,
    `\r\n--${boundary}--`,
  ];

  const body = new Blob(parts);

  const res = await fetch(
    `${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=multipart&fields=id`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive update failed: ${res.status} ${err}`);
  }

  return res.json();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // multipart/form-data 파싱
    const formData = await req.formData();
    const assignmentId = formData.get('assignmentId') as string;
    const studentId = formData.get('studentId') as string | null;
    const studentNumber = parseInt(formData.get('studentNumber') as string, 10);
    const studentName = formData.get('studentName') as string;
    const file = formData.get('file') as File;

    if (!assignmentId || !studentNumber || !studentName || !file) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    // 1. 파일 크기 체크
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('파일 크기는 10MB 이하만 가능합니다', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. 과제 정보 조회
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return errorResponse('과제를 찾을 수 없습니다', 404);
    }

    // 3. 마감 체크
    const isLate = isPastDeadline(assignment.deadline);
    if (isLate && !assignment.allow_late) {
      return errorResponse('마감되었습니다', 403);
    }

    // 4. 재제출 체크
    const { data: existingSubmission } = await supabase
      .from('submissions')
      .select('id, drive_file_id')
      .eq('assignment_id', assignmentId)
      .eq('student_number', studentNumber)
      .single();

    if (existingSubmission && !assignment.allow_resubmit) {
      return errorResponse('이미 제출되었습니다', 403);
    }

    // 5. 파일 형식 체크
    if (!isAllowedFile(file.name, assignment.file_type_restriction)) {
      return errorResponse('허용되지 않는 파일 형식입니다', 400);
    }

    // 6. 교사 OAuth 토큰 조회 + 복호화
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('teacher_tokens')
      .select('*')
      .eq('teacher_id', assignment.teacher_id)
      .single();

    if (tokenError || !tokenRecord) {
      return errorResponse('교사 인증 정보를 찾을 수 없습니다', 500);
    }

    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;
    const record = tokenRecord as TokenRecord;

    let accessToken = await decrypt(
      record.encrypted_access_token,
      encryptionKey,
      record.access_iv,
      record.access_tag,
    );

    // 7. 토큰 만료 시 refresh (최대 1회 리트라이)
    if (new Date(record.expires_at) <= new Date()) {
      const refreshToken = await decrypt(
        record.encrypted_refresh_token,
        encryptionKey,
        record.refresh_iv,
        record.refresh_tag,
      );

      try {
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
        const newTokens = await refreshGoogleToken(refreshToken, clientId, clientSecret);

        // 새 토큰 암호화 후 DB 업데이트
        const encAccess = await encrypt(newTokens.access_token, encryptionKey);
        const encRefresh = await encrypt(refreshToken, encryptionKey);

        await supabase
          .from('teacher_tokens')
          .update({
            encrypted_access_token: encAccess.ciphertext,
            access_iv: encAccess.iv,
            access_tag: encAccess.tag,
            encrypted_refresh_token: encRefresh.ciphertext,
            refresh_iv: encRefresh.iv,
            refresh_tag: encRefresh.tag,
            expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('teacher_id', assignment.teacher_id);

        accessToken = newTokens.access_token;
      } catch {
        // 경쟁 조건: 다른 인스턴스가 이미 갱신했을 수 있음 → DB 재조회
        const { data: retryRecord } = await supabase
          .from('teacher_tokens')
          .select('*')
          .eq('teacher_id', assignment.teacher_id)
          .single();

        if (retryRecord) {
          const retry = retryRecord as TokenRecord;
          accessToken = await decrypt(
            retry.encrypted_access_token,
            encryptionKey,
            retry.access_iv,
            retry.access_tag,
          );
        }
      }
    }

    // 8. Google Drive 업로드
    const paddedNumber = String(studentNumber).padStart(2, '0');
    const driveFileName = `${paddedNumber}_${studentName}_${file.name}`;
    const mimeType = file.type || 'application/octet-stream';

    let driveFileId: string;

    if (existingSubmission?.drive_file_id) {
      // 재제출: 기존 파일 업데이트
      const result = await updateDriveFile(
        accessToken,
        existingSubmission.drive_file_id,
        file,
        mimeType,
      );
      driveFileId = result.id;
    } else {
      // 신규 제출: 새 파일 업로드
      const result = await uploadToDrive(
        accessToken,
        assignment.drive_folder_id,
        driveFileName,
        file,
        mimeType,
      );
      driveFileId = result.id;
    }

    // 9. submissions upsert (assignment_id + student_number 기준)
    const { error: upsertError } = await supabase
      .from('submissions')
      .upsert(
        {
          assignment_id: assignmentId,
          student_id: studentId || null,
          student_number: studentNumber,
          student_name: studentName,
          submitted_at: new Date().toISOString(),
          file_name: file.name,
          file_size: file.size,
          drive_file_id: driveFileId,
          is_late: isLate,
        },
        { onConflict: 'assignment_id,student_number' },
      );

    if (upsertError) {
      return errorResponse(`제출 저장 실패: ${upsertError.message}`, 500);
    }

    return jsonResponse({ message: '제출 완료' });
  } catch (err) {
    return errorResponse(`서버 오류: ${(err as Error).message}`, 500);
  }
});
