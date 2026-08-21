/**
 * 온라인 교무실 — 부서 관리자 구글 토큰 보관
 *
 * save-teacher-token 과 같은 패턴이지만 **테이블과 암호화 키를 나눴다.**
 * 계획서 §11 의 미결 항목("기존 teacher_tokens 를 같이 쓸지 별도로 둘지")에 대한 답이고,
 * 근거는 DECISIONS.md ADR-062 에 적었다. 요지는 세 가지다.
 *
 *  1) 피해 범위 — 같이 쓰면 암호화 키 하나가 뚫렸을 때 과제 제출 기능까지 함께 번진다.
 *  2) 수명 — 과제 토큰은 과제가 끝나면 쓸모가 없지만, 교무실 관리자 토큰은 §3.2.1 대로
 *     자료를 **읽는 길**까지 떠받치므로 부서가 살아 있는 동안 계속 필요하다.
 *  3) 소유 단위 — teacher_tokens 는 교사 1명, 이쪽은 부서 1개다. 한 선생님이 여러 부서의
 *     관리자일 수 있고 부서마다 따로 끊길 수 있다.
 *
 * 암호화 키는 STAFFROOM_ENCRYPTION_KEY 를 쓴다. 아직 설정되지 않았으면 ENCRYPTION_KEY 로
 * 떨어지되 **경고를 남긴다** — 키를 나누지 않으면 위 1)의 이점이 사라지므로,
 * 공개 배포 전에 반드시 별도 키를 넣어야 한다.
 *
 * **새 구글 권한을 요구하지 않는다.** drive.file 그대로다(§3.2).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { encrypt } from '../_shared/crypto.ts';
import { verifyGoogleIdentity } from '../_shared/googleIdentity.ts';
import { denialMessage, denialStatus, requireAdmin } from '../_shared/staffroomAccess.ts';
import { serviceClient, loadMembers, toAccessMembers } from '../_shared/staffroomDb.ts';

/** 교무실 전용 암호화 키. 없으면 공용 키로 폴백하되 경고를 남긴다 */
function staffroomEncryptionKey(): string | null {
  const dedicated = Deno.env.get('STAFFROOM_ENCRYPTION_KEY');
  if (dedicated) return dedicated;

  const shared = Deno.env.get('ENCRYPTION_KEY');
  if (shared) {
    console.warn(
      '[staffroom-save-admin-token] STAFFROOM_ENCRYPTION_KEY 가 없어 ENCRYPTION_KEY 로 폴백합니다. ' +
        '공개 배포 전에 전용 키를 설정하세요 (ADR-062).',
    );
    return shared;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';
    const accessToken: unknown = body?.accessToken;
    const refreshToken: unknown = body?.refreshToken;
    const expiresAt: unknown = body?.expiresAt;

    if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);
    if (
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      typeof expiresAt !== 'string' ||
      !accessToken ||
      !refreshToken ||
      !expiresAt
    ) {
      return errorResponse('구글 로그인이 필요합니다', 400);
    }

    // 토큰의 주인이 정말 이 부서의 관리자인지 구글에 되물어 확인한다
    const identity = await verifyGoogleIdentity(accessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    const db = serviceClient();
    const members = await loadMembers(db, departmentId);
    const access = requireAdmin(toAccessMembers(members), identity.email);
    if (!access.ok) {
      return errorResponse(denialMessage(access.reason), denialStatus(access.reason));
    }

    const key = staffroomEncryptionKey();
    if (!key) {
      return internalErrorResponse(
        'staffroom-save-admin-token',
        new Error('STAFFROOM_ENCRYPTION_KEY / ENCRYPTION_KEY 미설정'),
        '서버 설정이 끝나지 않아 저장하지 못했습니다',
      );
    }

    const encAccess = await encrypt(accessToken, key);
    const encRefresh = await encrypt(refreshToken, key);

    const { error } = await db.from('staffroom_admin_tokens').upsert(
      {
        department_id: departmentId,
        admin_email: identity.email,
        encrypted_access_token: encAccess.ciphertext,
        access_iv: encAccess.iv,
        access_tag: encAccess.tag,
        encrypted_refresh_token: encRefresh.ciphertext,
        refresh_iv: encRefresh.iv,
        refresh_tag: encRefresh.tag,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'department_id' },
    );

    if (error) {
      return internalErrorResponse(
        'staffroom-save-admin-token',
        error,
        '구글 연결 정보를 저장하지 못했습니다',
      );
    }

    return jsonResponse({ departmentId, adminEmail: identity.email });
  } catch (err) {
    return internalErrorResponse('staffroom-save-admin-token', err);
  }
});
