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
 *   save  { departmentId, moduleId?, title, body }
 *   clear { departmentId, moduleId? }
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
} from '../_shared/staffroomDb.ts';

interface DraftRow {
  module_id: string;
  title: string;
  body: string;
  body_format: string;
  updated_at: string;
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
        .select('module_id, title, body, body_format, updated_at')
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

      // 둘 다 비었으면 저장할 게 없다 — 빈 임시저장이 쌓이지 않게 지운다
      if (title.trim() === '' && draftBody.trim() === '') {
        await db
          .from('staffroom_drafts')
          .delete()
          .eq('module_id', moduleId)
          .eq('author_email', identity.email);
        return jsonResponse({ draft: null });
      }

      const updatedAt = new Date().toISOString();
      const { error } = await db.from('staffroom_drafts').upsert(
        {
          module_id: moduleId,
          author_email: identity.email,
          title,
          body: draftBody,
          body_format: draftFormat,
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
        draft: { moduleId, title, body: draftBody, bodyFormat: draftFormat, updatedAt },
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
