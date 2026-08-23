/**
 * 온라인 교무실 — 말머리(카테고리) 관리 (054)
 *
 * 말머리는 **관리자가 미리 정한다.** 자유 입력으로 두면 `공지`·`공지사항`·`[공지]`
 * 가 섞여 걸러 보기가 쓸모없어지기 때문이다(054 마이그레이션 머리말 참고).
 *
 * 그래서 권한이 두 갈래다:
 *   - 목록 보기: **멤버 누구나.** 글을 쓸 때 골라야 하므로 관리자만 볼 수 없다.
 *   - 만들기·이름 고치기·지우기: **관리자만.**
 *
 * action:
 *   list   { departmentId }
 *   create { departmentId, name }
 *   rename { departmentId, categoryId, name }
 *   remove { departmentId, categoryId }
 *
 * ⚠️ 지울 때 글은 지우지 않는다. 054 가 `ON DELETE SET NULL` 이라 말머리만
 *    떨어지고 글은 남는다. 여기서 글을 먼저 지우는 코드를 넣지 말 것.
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
  denialMessage,
  denialStatus,
  requireAdmin,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import { serviceClient, loadMembers, toAccessMembers } from '../_shared/staffroomDb.ts';

/**
 * 말머리 이름 다듬기.
 *
 * 앱의 `domain/rules/staffRoomTaxonomy.ts` 와 **같은 규칙**이다. 서버가 앱을
 * 믿지 않기 때문에 여기서 다시 한다 — 앱을 거치지 않고 부르는 경로가 있으면
 * 다듬지 않은 값이 그대로 들어온다.
 *
 * 규칙을 고칠 때는 **두 곳을 함께** 고쳐야 한다. 한쪽만 고치면 화면에서는
 * 되는데 저장이 안 되거나, 그 반대가 된다.
 */
const CATEGORY_NAME_MAX_LENGTH = 12;
const CATEGORY_MAX_COUNT = 20;

function normalizeCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let name = raw.trim();
  if (name.length >= 2 && name.startsWith('[') && name.endsWith(']')) {
    name = name.slice(1, -1).trim();
  }
  name = name.replace(/\s+/g, ' ');
  if (name === '') return null;
  if (name.length > CATEGORY_NAME_MAX_LENGTH) return null;
  return name;
}

interface CategoryRow {
  id: string;
  department_id: string;
  name: string;
  position: number;
}

function toCategoryResponse(row: CategoryRow) {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    position: row.position,
  };
}

const CATEGORY_COLUMNS = 'id, department_id, name, position';

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
    const members = await loadMembers(db, departmentId);
    const access = toAccessMembers(members);

    // 비멤버는 목록조차 볼 수 없다 — 남의 부서 말머리를 훔쳐보지 못하게
    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }

    // ── 목록 (멤버 누구나 — 글 쓸 때 골라야 한다) ──────────────────
    if (action === 'list') {
      const { data, error } = await db
        .from('staffroom_categories')
        .select(CATEGORY_COLUMNS)
        .eq('department_id', departmentId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        return internalErrorResponse(
          'staffroom-categories.list',
          error,
          '말머리를 불러오지 못했습니다',
        );
      }
      return jsonResponse({ categories: (data as CategoryRow[]).map(toCategoryResponse) });
    }

    // 여기부터는 전부 관리자만
    const admin = requireAdmin(access, identity.email);
    if (!admin.ok) {
      return errorResponse(denialMessage(admin.reason), denialStatus(admin.reason));
    }

    // ── 만들기 ─────────────────────────────────────────────────────
    if (action === 'create') {
      const name = normalizeCategoryName(body?.name);
      if (name === null) {
        return errorResponse(`말머리는 1~${CATEGORY_NAME_MAX_LENGTH}자로 적어주세요`, 400);
      }

      // 너무 많으면 고르는 것 자체가 일이 된다
      const { count, error: countError } = await db
        .from('staffroom_categories')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', departmentId);

      if (countError) {
        return internalErrorResponse(
          'staffroom-categories.count',
          countError,
          '말머리를 불러오지 못했습니다',
        );
      }
      if ((count ?? 0) >= CATEGORY_MAX_COUNT) {
        return errorResponse(`말머리는 ${CATEGORY_MAX_COUNT}개까지 만들 수 있습니다`, 400);
      }

      const { data, error } = await db
        .from('staffroom_categories')
        .insert({ department_id: departmentId, name, position: count ?? 0 })
        .select(CATEGORY_COLUMNS)
        .single();

      if (error) {
        // 054 의 (department_id, name) 유일 인덱스에 걸린 경우
        if (error.code === '23505') {
          return errorResponse('같은 이름의 말머리가 이미 있습니다', 409);
        }
        return internalErrorResponse(
          'staffroom-categories.create',
          error,
          '말머리를 만들지 못했습니다',
        );
      }
      return jsonResponse({ category: toCategoryResponse(data as CategoryRow) });
    }

    const categoryId = typeof body?.categoryId === 'string' ? body.categoryId : '';
    if (!categoryId) return errorResponse('말머리를 찾을 수 없습니다', 400);

    // ── 이름 고치기 ────────────────────────────────────────────────
    if (action === 'rename') {
      const name = normalizeCategoryName(body?.name);
      if (name === null) {
        return errorResponse(`말머리는 1~${CATEGORY_NAME_MAX_LENGTH}자로 적어주세요`, 400);
      }

      const { data, error } = await db
        .from('staffroom_categories')
        .update({ name })
        .eq('id', categoryId)
        // 부서를 함께 걸어야 남의 부서 말머리 id 를 보내도 통하지 않는다
        .eq('department_id', departmentId)
        .select(CATEGORY_COLUMNS)
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          return errorResponse('같은 이름의 말머리가 이미 있습니다', 409);
        }
        return internalErrorResponse(
          'staffroom-categories.rename',
          error,
          '말머리를 고치지 못했습니다',
        );
      }
      if (!data) return errorResponse('말머리를 찾을 수 없습니다', 404);
      return jsonResponse({ category: toCategoryResponse(data as CategoryRow) });
    }

    // ── 지우기 ─────────────────────────────────────────────────────
    //    ⚠️ 이 말머리를 쓰던 글은 지우지 않는다. 054 가 SET NULL 이라 말머리만
    //    떨어지고 글은 남는다.
    if (action === 'remove') {
      const { error } = await db
        .from('staffroom_categories')
        .delete()
        .eq('id', categoryId)
        .eq('department_id', departmentId);

      if (error) {
        return internalErrorResponse(
          'staffroom-categories.remove',
          error,
          '말머리를 지우지 못했습니다',
        );
      }
      return jsonResponse({ ok: true });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-categories', err, '요청을 처리하지 못했습니다');
  }
});
