/**
 * 온라인 교무실 — 댓글 (M2)
 *
 * 댓글은 글에 딸린 것이라 별도 읽음 기록을 두지 않는다(계획서 §3.5-나 의 행 수 설계).
 * 지우기는 쓴 사람 본인 또는 부서 관리자만 할 수 있다.
 *
 * action:
 *   list   { departmentId, postId }
 *   create { departmentId, postId, body }
 *   delete { departmentId, commentId }
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
  canDeleteComment,
  denialMessage,
  denialStatus,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  nameMapOf,
  toAccessMembers,
  toCommentResponse,
  type CommentRow,
} from '../_shared/staffroomDb.ts';

const COMMENT_MAX = 2_000;
const COMMENT_COLUMNS = 'id, post_id, author_email, body, body_format, created_at';

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
    const names = nameMapOf(members);

    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }

    // ── 댓글 목록 ──────────────────────────────────────────────────
    if (action === 'list') {
      const postId = typeof body?.postId === 'string' ? body.postId : '';
      if (!postId) return errorResponse('글을 찾을 수 없습니다', 400);

      const { data, error } = await db
        .from('staffroom_comments')
        .select(COMMENT_COLUMNS)
        .eq('post_id', postId)
        .eq('department_id', departmentId)
        .order('created_at', { ascending: true });

      if (error) {
        return internalErrorResponse(
          'staffroom-comments.list',
          error,
          '댓글을 불러오지 못했습니다',
        );
      }

      return jsonResponse({
        comments: ((data ?? []) as CommentRow[]).map((row) => toCommentResponse(row, names)),
      });
    }

    // ── 댓글 쓰기 ──────────────────────────────────────────────────
    if (action === 'create') {
      const postId = typeof body?.postId === 'string' ? body.postId : '';
      const text = typeof body?.body === 'string' ? body.body.trim() : '';

      if (!postId) return errorResponse('글을 찾을 수 없습니다', 400);
      if (!text) return errorResponse('댓글 내용을 입력해주세요', 400);
      if (text.length > COMMENT_MAX) {
        return errorResponse(`댓글은 ${COMMENT_MAX}자까지 쓸 수 있습니다`, 400);
      }

      // 남의 부서 글에 댓글을 달 수 없게, 글이 이 부서 것인지 확인한다
      const { data: post, error: postError } = await db
        .from('staffroom_posts')
        .select('id')
        .eq('id', postId)
        .eq('department_id', departmentId)
        .maybeSingle();

      if (postError) {
        return internalErrorResponse(
          'staffroom-comments.post',
          postError,
          '댓글을 달지 못했습니다',
        );
      }
      if (!post) return errorResponse('글을 찾을 수 없습니다', 404);

      const { data: created, error: createError } = await db
        .from('staffroom_comments')
        .insert({
          post_id: postId,
          department_id: departmentId,
          author_email: identity.email,
          body: text,
        })
        .select(COMMENT_COLUMNS)
        .single();

      if (createError || !created) {
        return internalErrorResponse(
          'staffroom-comments.create',
          createError,
          '댓글을 달지 못했습니다',
        );
      }

      return jsonResponse({ comment: toCommentResponse(created as CommentRow, names) });
    }

    // ── 댓글 지우기 ────────────────────────────────────────────────
    if (action === 'delete') {
      const commentId = typeof body?.commentId === 'string' ? body.commentId : '';
      if (!commentId) return errorResponse('댓글을 찾을 수 없습니다', 400);

      const { data: target, error: targetError } = await db
        .from('staffroom_comments')
        .select('id, author_email')
        .eq('id', commentId)
        .eq('department_id', departmentId)
        .maybeSingle();

      if (targetError) {
        return internalErrorResponse(
          'staffroom-comments.target',
          targetError,
          '댓글을 지우지 못했습니다',
        );
      }
      if (!target) return errorResponse('댓글을 찾을 수 없습니다', 404);

      const decision = canDeleteComment(
        access,
        identity.email,
        (target as { author_email: string }).author_email,
      );
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }

      const { error: deleteError } = await db
        .from('staffroom_comments')
        .delete()
        .eq('id', commentId)
        .eq('department_id', departmentId);

      if (deleteError) {
        return internalErrorResponse(
          'staffroom-comments.delete',
          deleteError,
          '댓글을 지우지 못했습니다',
        );
      }

      return jsonResponse({ deletedCommentId: commentId });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-comments', err);
  }
});
