/**
 * 학생 과제 제출 처리
 *
 * 1) 파일 크기 체크 (10MB)
 * 2) 과제 정보 DB 조회
 * 3) 마감 체크
 * 4) 재제출 체크
 * 5) 파일 형식 체크
 * 6) 교사 OAuth 토큰 복호화
 * 7) 토큰 만료 5분 전 자동 갱신 + 401 시 강제 재갱신
 * 8) Google Drive 업로드 (401 시 1회 재시도)
 * 9) submissions upsert
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { decrypt, encrypt } from '../_shared/crypto.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import {
  droppedAnswerCount,
  isSelfAssessmentOnly,
  mergeSubmission,
  sanitizeAnswers,
} from '../_shared/selfAssessment.ts';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// 멀티파트 전체 본문 상한 — 파일 10MB + 메타데이터 여유분. 봇/스팸 폭주 1차 차단.
const MAX_REQUEST_SIZE = 12 * 1024 * 1024;
const MAX_TEXT_CONTENT = 64 * 1024; // 텍스트 제출 본문 64KB
const MAX_STUDENT_NAME = 100; // 이름 필드 길이 상한
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 만료 5분 전부터 미리 갱신

/** 차단 확장자 */
const BLOCKED_EXTENSIONS = [
  'exe',
  'bat',
  'cmd',
  'scr',
  'msi',
  'com',
  'pif',
  'js',
  'vbs',
  'wsf',
  'ps1',
  'sh',
];

/** 파일 형식별 허용 확장자 */
const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  all: [],
  image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'],
  // ★본체 `src/domain/valueObjects/FileTypeRestriction.ts` 의 같은 목록과 **짝이다.**
  //   한쪽만 고치면 앱에서는 고를 수 있는데 서버가 400 으로 되돌려 보낸다(학생만 겪는다).
  //   'md' 는 본문 추출이 가능해진 뒤 함께 열었다.
  document: ['pdf', 'hwp', 'hwpx', 'docx', 'doc', 'pptx', 'xlsx', 'txt', 'md'],
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

  const res = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

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

  const res = await fetch(`${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=multipart&fields=id`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive update failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * 교사 토큰을 복호화하고, 만료 임박/만료 시 자동 갱신하여 유효한 access_token 반환.
 * 갱신 성공 시 DB에 새 토큰 암호화 저장.
 *
 * @param forceRefresh true이면 expires_at 무시하고 강제 갱신 (Drive 401 재시도용)
 */
async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  teacherId: string,
  encryptionKey: string,
  forceRefresh = false,
): Promise<string> {
  const { data: tokenRecord, error: tokenError } = await supabase
    .from('teacher_tokens')
    .select('*')
    .eq('teacher_id', teacherId)
    .single();

  if (tokenError || !tokenRecord) {
    throw new Error('TEACHER_TOKEN_NOT_FOUND');
  }

  const record = tokenRecord as TokenRecord;

  let accessToken = await decrypt(
    record.encrypted_access_token,
    encryptionKey,
    record.access_iv,
    record.access_tag,
  );

  // 만료 5분 전부터 미리 갱신 (버퍼), 또는 forceRefresh 시 무조건 갱신
  const expiresAt = new Date(record.expires_at).getTime();
  const needsRefresh = forceRefresh || expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (needsRefresh) {
    const refreshToken = await decrypt(
      record.encrypted_refresh_token,
      encryptionKey,
      record.refresh_iv,
      record.refresh_tag,
    );

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    try {
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
        .eq('teacher_id', teacherId);

      accessToken = newTokens.access_token;
    } catch {
      // 경쟁 조건: 다른 인스턴스가 이미 갱신했을 수 있음 → DB 재조회
      const { data: retryRecord } = await supabase
        .from('teacher_tokens')
        .select('*')
        .eq('teacher_id', teacherId)
        .single();

      if (!retryRecord) {
        throw new Error('TEACHER_TOKEN_NOT_FOUND');
      }

      const retry = retryRecord as TokenRecord;
      const retryExpiresAt = new Date(retry.expires_at).getTime();

      // 재조회한 토큰도 만료 → refresh_token이 무효화됨 (교사 재인증 필요)
      if (retryExpiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS) {
        throw new Error('TOKEN_REFRESH_FAILED');
      }

      accessToken = await decrypt(
        retry.encrypted_access_token,
        encryptionKey,
        retry.access_iv,
        retry.access_tag,
      );
    }
  }

  return accessToken;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. 전체 본문 크기 1차 가드 (멀티파트 파싱 전)
    const contentLength = parseInt(req.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return errorResponse('요청 본문이 너무 큽니다', 413);
    }

    // multipart/form-data 파싱
    const formData = await req.formData();
    const assignmentId = formData.get('assignmentId') as string;
    const studentId = formData.get('studentId') as string | null;
    const studentGrade = (formData.get('studentGrade') as string | null) ?? '';
    const studentClass = (formData.get('studentClass') as string | null) ?? '';
    const studentNumber = parseInt(formData.get('studentNumber') as string, 10);
    const studentName = formData.get('studentName') as string;
    const file = formData.get('file') as File | null;
    const textContent = formData.get('textContent') as string | null;
    /** 자기평가 답변(JSON 문자열). 과제 문항과 대조하는 건 과제를 읽은 뒤다. */
    const selfAssessmentRaw = formData.get('selfAssessment') as string | null;

    if (!assignmentId || !studentNumber || !studentName) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    if (studentName.length > MAX_STUDENT_NAME) {
      return errorResponse('이름이 너무 깁니다', 400);
    }

    // ★"아무것도 안 낸" 경우만 여기서 막는다. 자기평가만 받는 과제는 파일도 글도 없으므로
    //   예전의 `!file && !textContent` 단정으로는 정상 제출까지 막힌다. 실제로 답이 들어왔는지는
    //   과제의 문항 정의와 대조한 뒤에 다시 본다(아래 4-b).
    if (!file && !textContent && !selfAssessmentRaw) {
      return errorResponse('제출할 내용을 입력해 주세요', 400);
    }

    if (textContent && textContent.length > MAX_TEXT_CONTENT) {
      return errorResponse('텍스트 내용이 너무 깁니다 (64KB 이하)', 400);
    }

    // 1. 파일 크기 체크
    if (file && file.size > MAX_FILE_SIZE) {
      return errorResponse('파일 크기는 10MB 이하만 가능합니다', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1-b. Rate limit — 봇/스팸 폭주 차단 (학생 제출이라 한도는 넉넉히):
    //   IP 당 시간당 30회, (assignment, IP) 조합 당 시간당 30회.
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'submit-assignment', [
      { identifier: clientIP, windowMs: 3_600_000, max: 30 },
      { identifier: `${assignmentId}:${clientIP}`, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 너무 많은 요청이 감지되었습니다.', 429);
    }

    // 2. 과제 정보 조회
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return errorResponse('과제를 찾을 수 없습니다', 404);
    }

    // 2-b. 자기평가 답변을 과제의 문항 정의와 대조한다.
    //      학생 화면은 브라우저라 아무 값이나 보낼 수 있다 — 모르는 문항 id 는 버리고,
    //      문항 원문·슬롯은 저장된 정의에서 복사하며, 길이는 서버가 자른다.
    const { answers: selfAssessmentAnswers, error: selfAssessmentError } = sanitizeAnswers(
      selfAssessmentRaw,
      assignment.self_assessment,
    );
    if (selfAssessmentError) {
      return errorResponse(selfAssessmentError, 400);
    }

    // 2-c. 결국 아무것도 안 낸 제출인가. 자기평가만 받는 과제에서 빈 답만 보낸 경우가 여기 걸린다.
    if (!file && !textContent && !selfAssessmentAnswers) {
      return errorResponse('제출할 내용을 입력해 주세요', 400);
    }

    // 3. 마감 체크
    const isLate = isPastDeadline(assignment.deadline);
    if (isLate && !assignment.allow_late) {
      return errorResponse('마감되었습니다', 403);
    }

    // 4. 재제출 체크 (학년+반+번호로 고유 식별)
    const { data: existingSubmission } = await supabase
      .from('submissions')
      // ★자기평가가 생기면서 "일부만 다시 내는" 제출이 가능해졌다(파일만, 또는 돌아보기만).
      //   아래 upsert 가 안 보낸 칸을 옛 값으로 살리려면 지금 값을 함께 읽어야 한다.
      .select(
        'id, student_id, drive_file_id, file_name, file_size, text_content, self_assessment, is_late',
      )
      .eq('assignment_id', assignmentId)
      .eq('student_grade', studentGrade)
      .eq('student_class', studentClass)
      .eq('student_number', studentNumber)
      .single();

    if (existingSubmission && !assignment.allow_resubmit) {
      return errorResponse('이미 제출되었습니다', 403);
    }

    // 5. 파일 형식 체크 (파일이 있을 때만)
    if (file && !isAllowedFile(file.name, assignment.file_type_restriction)) {
      return errorResponse('허용되지 않는 파일 형식입니다', 400);
    }

    // 5-b. 자기평가만 받는 과제에는 올릴 폴더가 없다(070 으로 drive_folder_id 가 NULL 허용이 됐다).
    //      학생 화면은 파일 칸을 안 그리지만 브라우저는 고쳐서 보낼 수 있으므로 서버가 막는다.
    //      막지 않으면 아래 업로드가 폴더 자리에 null 을 넣고 부른다.
    if (file && !assignment.drive_folder_id) {
      return errorResponse('이 과제는 파일 제출을 받지 않습니다', 400);
    }

    // 6~7. 교사 OAuth 토큰 복호화 + 만료 시 자동 갱신 (파일 업로드 필요 시)
    let driveFileId: string | null = null;

    if (file) {
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;
      let accessToken: string;

      try {
        accessToken = await getValidAccessToken(supabase, assignment.teacher_id, encryptionKey);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === 'TEACHER_TOKEN_NOT_FOUND') {
          return errorResponse('교사 인증 정보를 찾을 수 없습니다', 500);
        }
        if (msg === 'TOKEN_REFRESH_FAILED') {
          return errorResponse(
            '교사의 Google 인증이 만료되었습니다. 교사에게 쌤핀 앱에서 Google 계정을 다시 연결하도록 안내해주세요.',
            401,
          );
        }
        throw err;
      }

      // 8. Google Drive 업로드 (401 시 토큰 재갱신 후 1회 재시도)
      const paddedNumber = String(studentNumber).padStart(2, '0');
      const gradeClassPrefix =
        studentGrade && studentClass ? `${studentGrade}-${studentClass}_` : '';
      const driveFileName = `${gradeClassPrefix}${paddedNumber}_${studentName}_${file.name}`;
      const mimeType = file.type || 'application/octet-stream';

      const doDriveUpload = async (token: string): Promise<string> => {
        if (existingSubmission?.drive_file_id) {
          const result = await updateDriveFile(
            token,
            existingSubmission.drive_file_id,
            file,
            mimeType,
          );
          return result.id;
        } else {
          const result = await uploadToDrive(
            token,
            assignment.drive_folder_id,
            driveFileName,
            file,
            mimeType,
          );
          return result.id;
        }
      };

      try {
        driveFileId = await doDriveUpload(accessToken);
      } catch (uploadErr) {
        const errMsg = (uploadErr as Error).message;
        if (errMsg.includes('401') || errMsg.includes('403')) {
          try {
            accessToken = await getValidAccessToken(supabase, assignment.teacher_id, encryptionKey);
            driveFileId = await doDriveUpload(accessToken);
          } catch (retryErr) {
            const retryMsg = (retryErr as Error).message;
            if (retryMsg === 'TOKEN_REFRESH_FAILED') {
              return errorResponse(
                '교사의 Google 인증이 만료되었습니다. 교사에게 쌤핀 앱에서 Google 계정을 다시 연결하도록 안내해주세요.',
                401,
              );
            }
            throw retryErr;
          }
        } else {
          throw uploadErr;
        }
      }
    }

    // 9. submissions upsert (assignment_id + student_grade + student_class + student_number 기준)
    //
    // ★안 보낸 칸은 지우지 않고 옛 값을 살린다.
    //
    // 자기평가가 생기기 전에는 파일이나 글 중 하나가 반드시 있어야 제출이 통과했으므로(위쪽
    // "아무것도 안 낸 경우만 막는다" 관문의 옛 판본) 통째로 덮어써도 잃을 것이 없었다. 이제는 "돌아보기만" 내는 제출이 가능해서,
    // 그대로 두면 월요일에 낸 **파일이 수요일 돌아보기 제출에 지워진다**(드라이브 파일은 남지만
    // 기록에서 떨어져 나가 선생님 화면에 미제출로 보인다). 반대로 돌아보기를 먼저 쓴 학생이
    // 파일만 내면 답변이 사라진다.
    // 병합 규칙은 `_shared/selfAssessment.ts` 의 순수 함수에 있다 — 여기 인라인으로 두면
    // 어느 게이트도 안 본다. ★그 규칙을 실제로 돌리는 게이트는
    // `src/infrastructure/supabase/__tests__/selfAssessmentEdgeMerge.meta.test.ts`(vitest → `npm run test`)다.
    // Deno 테스트는 더 넓게 보지만 CI 에 없어 자동으로는 안 돈다. 이 줄(3인자 전달)은 회귀 #78 이 지킨다.
    const merged = mergeSubmission(
      existingSubmission ?? null,
      {
        studentId: studentId || null,
        fileName: file?.name ?? null,
        fileSize: file?.size ?? null,
        driveFileId,
        textContent,
        selfAssessment: selfAssessmentAnswers,
        isLate,
        // ★자기평가만 받는 과제에서는 돌아보기를 다시 쓰는 것이 곧 "다시 냄"이다.
        //   안 넘기면 첫 제출 때 찍힌 지각 여부가 영원히 굳는다(코드 리뷰 M-1).
        selfAssessmentOnly: isSelfAssessmentOnly(assignment.submit_type),
      },
      // 문항 정의를 함께 넘겨 답변이 문항 순서로 줄 서게 한다.
      assignment.self_assessment,
    );
    // ★자르기는 조용하면 안 된다. "답이 없어졌다"는 신고가 오면 재현할 방법이 있어야 한다.
    //   ★건수 계산은 **호출부에서 하지 않는다.** "옛 답 수 + 새 답 수 − 저장된 수"로 세면 병합의
    //   중복 제거 때문에 평범한 재제출마다 거짓 경고가 뜬다(실제로 그렇게 짰다가 리뷰에서 잡혔다).
    //   산수를 규칙 옆(`_shared`)에 두어야 규칙이 바뀔 때 같이 바뀌고, 게이트도 그걸 본다.
    const dropped = droppedAnswerCount(
      existingSubmission?.self_assessment,
      selfAssessmentAnswers,
      assignment.self_assessment,
    );
    if (dropped > 0) {
      console.warn(`submit-assignment: 자기평가 저장 상한으로 ${dropped}건이 잘렸습니다`, {
        assignmentId,
        dropped,
        stored: merged.self_assessment?.length ?? 0,
      });
    }

    const { error: upsertError } = await supabase.from('submissions').upsert(
      {
        assignment_id: assignmentId,
        student_grade: studentGrade,
        student_class: studentClass,
        student_number: studentNumber,
        student_name: studentName,
        submitted_at: new Date().toISOString(),
        ...merged,
      },
      { onConflict: 'assignment_id,student_grade,student_class,student_number' },
    );

    if (upsertError) {
      return internalErrorResponse(
        'submit-assignment',
        upsertError,
        '제출 저장 중 오류가 발생했습니다',
      );
    }

    return jsonResponse({ message: '제출 완료' });
  } catch (err) {
    return internalErrorResponse('submit-assignment', err);
  }
});
