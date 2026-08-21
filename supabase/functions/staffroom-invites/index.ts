/**
 * 온라인 교무실 — 초대 (발급 · 목록 · 해지)
 *
 * 계획서 §7: 코드는 **숫자 6자리가 아니라** 31자 알파벳 6자리(31⁶ ≈ 8.9억)다.
 * 코드 입력 쪽(staffroom-join)에는 rateLimit 을 함께 건다 — 경우의 수만으로 막지 않는다.
 *
 * 초대 발급·목록·해지는 전부 **부서 관리자만** 할 수 있다.
 * 남의 부서 초대 코드가 보이지 않는다는 계획서 §11 의 요구가 여기서 지켜진다.
 *
 * action:
 *   create { departmentId, expiresInDays, maxUses? }
 *   list   { departmentId }
 *   revoke { departmentId, inviteId }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentity } from '../_shared/googleIdentity.ts';
import {
  INVITE_CODE_ALPHABET,
  denialMessage,
  denialStatus,
  inviteExpiryFromDays,
  requireAdmin,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  toAccessMembers,
  toInviteResponse,
  type InviteRow,
} from '../_shared/staffroomDb.ts';

/** 초대 코드 생성 — 암호학적 난수를 쓴다(Math.random 아님) */
function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (const byte of bytes) {
    out += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  }
  return out;
}

/** 코드가 이미 있으면 다시 뽑는다 — UNIQUE 충돌 코드는 23505 */
const UNIQUE_VIOLATION = '23505';
const MAX_CODE_ATTEMPTS = 8;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action: unknown = body?.action;
    const googleAccessToken: unknown = body?.googleAccessToken;
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';

    if (typeof googleAccessToken !== 'string' || !googleAccessToken) {
      return errorResponse('구글 로그인이 필요합니다', 401);
    }
    if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);

    const identity = await verifyGoogleIdentity(googleAccessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    const db = serviceClient();

    // 초대에 관한 모든 조작은 관리자만 — 목록 조회도 마찬가지다
    const members = await loadMembers(db, departmentId);
    const access = requireAdmin(toAccessMembers(members), identity.email);
    if (!access.ok) {
      return errorResponse(denialMessage(access.reason), denialStatus(access.reason));
    }

    // ── 초대 발급 ──────────────────────────────────────────────────
    if (action === 'create') {
      const rawDays: unknown = body?.expiresInDays;
      const expiresInDays = typeof rawDays === 'number' ? rawDays : null;
      const rawMaxUses: unknown = body?.maxUses;
      const maxUses =
        typeof rawMaxUses === 'number' && Number.isFinite(rawMaxUses) && rawMaxUses > 0
          ? Math.floor(rawMaxUses)
          : null;

      const expiresAt = inviteExpiryFromDays(expiresInDays, Date.now());

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const { data, error } = await db
          .from('staffroom_invites')
          .insert({
            department_id: departmentId,
            code: generateInviteCode(),
            expires_at: expiresAt,
            max_uses: maxUses,
            created_by: identity.email,
          })
          .select(
            'id, department_id, code, expires_at, revoked_at, max_uses, use_count, created_by, created_at',
          )
          .single();

        if (!error && data) {
          return jsonResponse({ invite: toInviteResponse(data as InviteRow) });
        }
        // 코드가 겹쳤을 때만 다시 뽑는다. 다른 오류면 즉시 포기한다
        if (error?.code !== UNIQUE_VIOLATION) {
          return internalErrorResponse(
            'staffroom-invites.create',
            error,
            '초대 코드를 만들지 못했습니다',
          );
        }
      }

      return internalErrorResponse(
        'staffroom-invites.create',
        new Error(`코드 생성 ${MAX_CODE_ATTEMPTS}회 연속 충돌`),
        '초대 코드를 만들지 못했습니다. 잠시 후 다시 시도해주세요',
      );
    }

    // ── 초대 목록 ──────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await db
        .from('staffroom_invites')
        .select(
          'id, department_id, code, expires_at, revoked_at, max_uses, use_count, created_by, created_at',
        )
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false });

      if (error) {
        return internalErrorResponse(
          'staffroom-invites.list',
          error,
          '초대 목록을 불러오지 못했습니다',
        );
      }

      return jsonResponse({ invites: ((data ?? []) as InviteRow[]).map(toInviteResponse) });
    }

    // ── 초대 해지 ──────────────────────────────────────────────────
    if (action === 'revoke') {
      const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : '';
      if (!inviteId) return errorResponse('해지할 초대를 찾을 수 없습니다', 400);

      // department_id 를 함께 조건에 넣어 남의 부서 초대를 해지할 수 없게 한다
      const { data, error } = await db
        .from('staffroom_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('department_id', departmentId)
        .is('revoked_at', null)
        .select(
          'id, department_id, code, expires_at, revoked_at, max_uses, use_count, created_by, created_at',
        )
        .maybeSingle();

      if (error) {
        return internalErrorResponse(
          'staffroom-invites.revoke',
          error,
          '초대를 해지하지 못했습니다',
        );
      }
      if (!data) return errorResponse('이미 해지되었거나 없는 초대입니다', 404);

      return jsonResponse({ invite: toInviteResponse(data as InviteRow) });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-invites', err);
  }
});
