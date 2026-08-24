/**
 * 온라인 교무실 — 임시저장 (M2)
 *
 * 계획서 §8-A: "글 쓰는 중 자동 저장. 긴 글을 한 번 날리면 두 번 다시 안 쓴다."
 *
 * 사람마다 게시판마다 한 벌만 둔다. 남의 임시저장은 볼 수도 지울 수도 없다 —
 * 조회·저장·삭제 모두 요청자 본인 것만 다룬다(대상을 body 로 받지 않는다).
 *
 * action:
 *   get   { departmentId, moduleId? }
 *   save  { departmentId, moduleId?, title, body, bodyFormat?, categoryId?, tags?, fileIds? }
 *   clear { departmentId, moduleId? }
 *
 * 말머리·태그·첨부(056)도 왕복시킨다 — 임시저장이 제목·본문만 보관하면
 * 이어 쓸 때 골라 둔 것들이 조용히 사라진다(v2.4.4 UltraQA P1).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentity } from '../_shared/googleIdentity.ts';
import { denialMessage, denialStatus, requireMember } from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  loadBoardModule,
  moduleBelongsTo,
  toAccessMembers,
  normalizeBodyFormat,
  normalizeTags,
  categoryBelongsTo,
  POST_MAX_ATTACHMENTS,
} from '../_shared/staffroomDb.ts';

interface DraftRow {
  module_id: string;
  title: string;
  body: string;
  body_format: string;
  category_id: string | null;
  tags: string[] | null;
  file_ids: string[] | null;
  updated_at: string;
}

/**
 * 첨부 파일 id 는 **UUID 모양만** 통과시킨다 — staffroom-posts 와 같은 이유.
 * 아무 문자열이나 uuid[] 칸에 넣으면 Postgres 22P02(uuid 형식 오류)로 터져
 * 정상 검사보다 앞서 500 이 된다. 서버는 앱이 보낸 값을 믿지 않는다.
 * 글과 같은 상한(POST_MAX_ATTACHMENTS)을 걸어 임시저장만 무한정 커지지 않게 한다.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeFileIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !UUID_SHAPE.test(v)) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= POST_MAX_ATTACHMENTS) break;
  }
  return out;
}

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
    const viewer = requireMember(toAccessMembers(members), identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }

    // 게시판 확인 — 남의 부서 게시판 id 를 보내도 통하지 않게
    const requested = typeof body?.moduleId === 'string' ? body.moduleId : '';
    let moduleId = requested;
    if (moduleId) {
      if (!(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 게시판이 아닙니다', 403);
      }
    } else {
      const board = await loadBoardModule(db, departmentId);
      if (!board) return errorResponse('게시판을 찾을 수 없습니다', 404);
      moduleId = board.id;
    }

    // ── 쓰던 글 불러오기 ───────────────────────────────────────────
    if (action === 'get') {
      const { data, error } = await db
        .from('staffroom_drafts')
        .select('module_id, title, body, body_format, category_id, tags, file_ids, updated_at')
        .eq('module_id', moduleId)
        .eq('author_email', identity.email)
        .maybeSingle();

      if (error) {
        return internalErrorResponse(
          'staffroom-drafts.get',
          error,
          '쓰던 글을 불러오지 못했습니다',
        );
      }

      const draft = data as DraftRow | null;
      return jsonResponse({
        draft: draft
          ? {
              moduleId: draft.module_id,
              title: draft.title,
              body: draft.body,
              bodyFormat: normalizeBodyFormat(draft.body_format),
              categoryId: draft.category_id,
              tags: draft.tags ?? [],
              fileIds: draft.file_ids ?? [],
              updatedAt: draft.updated_at,
            }
          : null,
      });
    }

    // ── 자동 저장 ──────────────────────────────────────────────────
    if (action === 'save') {
      const title = typeof body?.title === 'string' ? body.title : '';
      const draftBody = typeof body?.body === 'string' ? body.body : '';
      const draftFormat = normalizeBodyFormat(body?.bodyFormat);

      // 둘 다 비었으면 저장할 게 없다 — 빈 임시저장이 쌓이지 않게 지운다.
      // (말머리·태그·첨부만 골라 둔 상태는 잃어도 싼 것들이라 함께 버린다)
      if (title.trim() === '' && draftBody.trim() === '') {
        await db
          .from('staffroom_drafts')
          .delete()
          .eq('module_id', moduleId)
          .eq('author_email', identity.email);
        return jsonResponse({ draft: null });
      }

      // 말머리는 이 부서 것인지 확인한다(staffroom-posts 와 같은 이유 — 남의 부서
      // 말머리 id 가 박히면 안 된다). 단, 게시와 달리 **오류로 끊지 않고 떼고 저장한다**
      // — 자동 저장이 말머리 하나(글쓰는 중 관리자가 지웠다든가) 때문에 통째로
      // 실패하면 제목·본문까지 잃는다. 그게 이 기능이 막으려는 바로 그 사고다.
      const rawCategoryId = typeof body?.categoryId === 'string' ? body.categoryId : '';
      const categoryId =
        rawCategoryId && (await categoryBelongsTo(db, rawCategoryId, departmentId))
          ? rawCategoryId
          : null;

      // 태그는 글과 같은 규칙으로 다듬고, 첨부는 UUID 모양만 통과시킨다
      const tags = normalizeTags(body?.tags);
      const fileIds = normalizeFileIds(body?.fileIds);

      const updatedAt = new Date().toISOString();
      const { error } = await db.from('staffroom_drafts').upsert(
        {
          module_id: moduleId,
          author_email: identity.email,
          title,
          body: draftBody,
          body_format: draftFormat,
          category_id: categoryId,
          tags,
          file_ids: fileIds,
          updated_at: updatedAt,
        },
        { onConflict: 'module_id,author_email' },
      );

      if (error) {
        return internalErrorResponse(
          'staffroom-drafts.save',
          error,
          '쓰던 글을 저장하지 못했습니다',
        );
      }

      return jsonResponse({
        draft: {
          moduleId,
          title,
          body: draftBody,
          bodyFormat: draftFormat,
          categoryId,
          tags,
          fileIds,
          updatedAt,
        },
      });
    }

    // ── 지우기 ─────────────────────────────────────────────────────
    if (action === 'clear') {
      const { error } = await db
        .from('staffroom_drafts')
        .delete()
        .eq('module_id', moduleId)
        .eq('author_email', identity.email);

      if (error) {
        return internalErrorResponse(
          'staffroom-drafts.clear',
          error,
          '쓰던 글을 지우지 못했습니다',
        );
      }
      return jsonResponse({ draft: null });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-drafts', err);
  }
});
