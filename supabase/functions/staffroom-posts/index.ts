/**
 * 온라인 교무실 — 게시판 글 (M2)
 *
 * 계획서: §3.5-나(읽음 확인 두 갈래) · §3.5-다(목록 경량화) · §8-A
 *
 * ★ 목록 응답에 본문을 담지 않는다. 교사 1,500명이 월 300회씩 목록을 열면
 *   본문까지 실어 보낼 때 월 전송량이 8.6GB 로 무료 등급을 넘는다(§3.5-다).
 *
 * ★ 사람별 읽음 기록은 **필독 글에만** 쌓는다. 모든 글에 쌓으면 부서 250개에서
 *   375만 행이 된다(§3.5-나). 일반 글의 "안 읽음"은 게시판별 마지막 본 시각 한 줄로 푼다.
 *
 * action:
 *   list        { departmentId, moduleId? }        → 목록(본문 없음) + 마지막 본 시각 갱신
 *   get         { departmentId, postId }           → 글 하나(본문 포함) + 필독이면 읽음 기록
 *   create      { departmentId, moduleId, title, body, isRequired, mentionedEmails }
 *   update      { departmentId, postId, title, body, mentionedEmails }
 *   setRequired { departmentId, postId, isRequired }
 *   delete      { departmentId, postId }
 *   readers     { departmentId, postId }           → 필독 글의 읽은/안 읽은 사람
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentity, normalizeEmail } from '../_shared/googleIdentity.ts';
import {
  canDeletePost,
  canEditPost,
  canSetRequired,
  canWritePost,
  denialMessage,
  denialStatus,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  loadBoardModule,
  loadLastSeenAt,
  moduleBelongsTo,
  nameMapOf,
  toAccessMembers,
  touchLastSeen,
  toPostSummaryResponse,
  POST_FULL_COLUMNS,
  POST_SUMMARY_COLUMNS,
  normalizeBodyFormat,
  type MemberRow,
  type PostRow,
  type PostSummaryRow,
} from '../_shared/staffroomDb.ts';

const TITLE_MAX = 100;

/** 한 번에 내려보내는 글 수 — 목록이 무한정 커지지 않게 */
const PAGE_SIZE = 100;

/** 본문에서 부른 사람 중 **실제 이 부서 멤버만** 남긴다 (아무 이메일이나 못 넣게) */
function validMentions(raw: unknown, members: readonly MemberRow[]): string[] {
  if (!Array.isArray(raw)) return [];
  const memberEmails = new Set(members.map((m) => normalizeEmail(m.member_email)));
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const email = normalizeEmail(item);
    if (memberEmails.has(email)) out.add(email);
  }
  return [...out];
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
    const access = toAccessMembers(members);
    const names = nameMapOf(members);

    // 멤버가 아니면 글이 있는지조차 알려주지 않는다
    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }
    const myRole = viewer.member.role;

    // ── 목록 ───────────────────────────────────────────────────────
    if (action === 'list') {
      const requestedModuleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      let moduleId = requestedModuleId;

      if (moduleId) {
        if (!(await moduleBelongsTo(db, moduleId, departmentId))) {
          return errorResponse('이 부서의 게시판이 아닙니다', 403);
        }
      } else {
        const board = await loadBoardModule(db, departmentId);
        if (!board) return errorResponse('게시판을 찾을 수 없습니다', 404);
        moduleId = board.id;
      }

      // ★ 순서가 중요하다 — 갱신하기 **전에** 마지막 본 시각을 읽어야 한다.
      //   먼저 갱신하면 목록을 여는 순간 모든 글이 읽은 것으로 바뀐다.
      const lastSeenAt = await loadLastSeenAt(db, moduleId, identity.email);

      const { data: postRows, error: postError } = await db
        .from('staffroom_posts')
        .select(POST_SUMMARY_COLUMNS)
        .eq('module_id', moduleId)
        .order('is_required', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (postError) {
        return internalErrorResponse(
          'staffroom-posts.list',
          postError,
          '글 목록을 불러오지 못했습니다',
        );
      }

      const posts = (postRows ?? []) as PostSummaryRow[];
      const postIds = posts.map((p) => p.id);

      // 댓글 수 · 나를 부른 글 — 두 번의 가벼운 조회로 끝낸다
      const commentCounts = new Map<string, number>();
      const mentionedPostIds = new Set<string>();

      if (postIds.length > 0) {
        const { data: commentRows } = await db
          .from('staffroom_comments')
          .select('post_id')
          .in('post_id', postIds);
        for (const row of (commentRows ?? []) as { post_id: string }[]) {
          commentCounts.set(row.post_id, (commentCounts.get(row.post_id) ?? 0) + 1);
        }

        const { data: mentionRows } = await db
          .from('staffroom_mentions')
          .select('post_id')
          .eq('mentioned_email', identity.email)
          .in('post_id', postIds);
        for (const row of (mentionRows ?? []) as { post_id: string }[]) {
          mentionedPostIds.add(row.post_id);
        }
      }

      const seenMs = lastSeenAt === null ? null : new Date(lastSeenAt).getTime();
      const summaries = posts.map((row) => {
        const createdMs = new Date(row.created_at).getTime();
        const isUnread =
          seenMs === null
            ? true
            : Number.isNaN(createdMs) || Number.isNaN(seenMs)
              ? false
              : createdMs > seenMs;
        return toPostSummaryResponse(row, names, {
          commentCount: commentCounts.get(row.id) ?? 0,
          isUnread,
          mentionsMe: mentionedPostIds.has(row.id),
        });
      });

      // 판정이 끝난 뒤에 갱신한다
      await touchLastSeen(db, moduleId, identity.email);

      return jsonResponse({ moduleId, posts: summaries, myRole });
    }

    const postId = typeof body?.postId === 'string' ? body.postId : '';

    // ── 글 하나 보기 ───────────────────────────────────────────────
    if (action === 'get') {
      if (!postId) return errorResponse('글을 찾을 수 없습니다', 400);

      const { data: row, error } = await db
        .from('staffroom_posts')
        .select(POST_FULL_COLUMNS)
        .eq('id', postId)
        .eq('department_id', departmentId)
        .maybeSingle();

      if (error) {
        return internalErrorResponse('staffroom-posts.get', error, '글을 불러오지 못했습니다');
      }
      if (!row) return errorResponse('글을 찾을 수 없습니다', 404);

      const post = row as PostRow;

      const { data: mentionRows } = await db
        .from('staffroom_mentions')
        .select('mentioned_email')
        .eq('post_id', postId);
      const mentionedEmails = ((mentionRows ?? []) as { mentioned_email: string }[]).map(
        (m) => m.mentioned_email,
      );

      const { data: commentRows } = await db
        .from('staffroom_comments')
        .select('id')
        .eq('post_id', postId);
      const commentCount = (commentRows ?? []).length;

      // ★ 사람별 읽음 기록은 필독 글에만 쌓는다 (§3.5-나)
      if (post.is_required) {
        const { error: readError } = await db
          .from('staffroom_post_reads')
          .upsert(
            { post_id: postId, member_email: identity.email },
            { onConflict: 'post_id,member_email', ignoreDuplicates: true },
          );
        if (readError) console.error('[staffroom-posts] 읽음 기록 실패:', readError.message);
      }

      return jsonResponse({
        post: {
          ...toPostSummaryResponse(post, names, {
            commentCount,
            isUnread: false,
            mentionsMe: mentionedEmails.includes(identity.email),
          }),
          body: post.body,
          bodyFormat: normalizeBodyFormat(post.body_format),
          mentionedEmails,
        },
        myRole,
      });
    }

    // ── 글 쓰기 ────────────────────────────────────────────────────
    if (action === 'create') {
      const write = canWritePost(access, identity.email);
      if (!write.ok) return errorResponse(denialMessage(write.reason), denialStatus(write.reason));

      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const postBody = typeof body?.body === 'string' ? body.body : '';
      const bodyFormat = normalizeBodyFormat(body?.bodyFormat);
      const isRequired = body?.isRequired === true;

      if (!title) return errorResponse('제목을 입력해주세요', 400);
      if (title.length > TITLE_MAX) {
        return errorResponse(`제목은 ${TITLE_MAX}자까지 쓸 수 있습니다`, 400);
      }

      // 필독은 관리자만 — 필독 글에만 사람별 읽음이 쌓이므로 아무나 지정하면 안 된다
      if (isRequired) {
        const req = canSetRequired(access, identity.email);
        if (!req.ok) return errorResponse(denialMessage(req.reason), denialStatus(req.reason));
      }

      const requestedModuleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      let moduleId = requestedModuleId;
      if (moduleId) {
        if (!(await moduleBelongsTo(db, moduleId, departmentId))) {
          return errorResponse('이 부서의 게시판이 아닙니다', 403);
        }
      } else {
        const board = await loadBoardModule(db, departmentId);
        if (!board) return errorResponse('게시판을 찾을 수 없습니다', 404);
        moduleId = board.id;
      }

      const { data: created, error: createError } = await db
        .from('staffroom_posts')
        .insert({
          module_id: moduleId,
          department_id: departmentId,
          author_email: identity.email,
          title,
          body: postBody,
          body_format: bodyFormat,
          is_required: isRequired,
        })
        .select(POST_FULL_COLUMNS)
        .single();

      if (createError || !created) {
        return internalErrorResponse(
          'staffroom-posts.create',
          createError,
          '글을 올리지 못했습니다',
        );
      }

      const post = created as PostRow;
      const mentions = validMentions(body?.mentionedEmails, members);
      if (mentions.length > 0) {
        const { error: mentionError } = await db.from('staffroom_mentions').insert(
          mentions.map((email) => ({
            post_id: post.id,
            department_id: departmentId,
            mentioned_email: email,
          })),
        );
        if (mentionError) console.error('[staffroom-posts] 멘션 기록 실패:', mentionError.message);
      }

      // 올렸으면 임시저장은 지운다
      await db
        .from('staffroom_drafts')
        .delete()
        .eq('module_id', moduleId)
        .eq('author_email', identity.email);

      return jsonResponse({
        post: {
          ...toPostSummaryResponse(post, names, {
            commentCount: 0,
            isUnread: false,
            mentionsMe: mentions.includes(identity.email),
          }),
          body: post.body,
          bodyFormat: normalizeBodyFormat(post.body_format),
          mentionedEmails: mentions,
        },
      });
    }

    if (!postId) return errorResponse('글을 찾을 수 없습니다', 400);

    // 아래 조작들은 대상 글이 이 부서 것인지부터 확인한다
    const { data: targetRow, error: targetError } = await db
      .from('staffroom_posts')
      .select('id, module_id, author_email, is_required')
      .eq('id', postId)
      .eq('department_id', departmentId)
      .maybeSingle();

    if (targetError) {
      return internalErrorResponse(
        'staffroom-posts.target',
        targetError,
        '글을 불러오지 못했습니다',
      );
    }
    if (!targetRow) return errorResponse('글을 찾을 수 없습니다', 404);
    const target = targetRow as {
      id: string;
      module_id: string;
      author_email: string;
      is_required: boolean;
    };

    // ── 글 고치기 ──────────────────────────────────────────────────
    if (action === 'update') {
      const decision = canEditPost(access, identity.email, target.author_email);
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }

      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const postBody = typeof body?.body === 'string' ? body.body : '';
      // 고칠 때도 형식을 함께 받는다. 본문만 바꾸고 형식을 그대로 두면,
      // 맨글이던 옛 글을 서식 편집기로 고쳤을 때 형식이 맨글로 남아 기호가
      // 그대로 보인다.
      const bodyFormat = normalizeBodyFormat(body?.bodyFormat);
      if (!title) return errorResponse('제목을 입력해주세요', 400);
      if (title.length > TITLE_MAX) {
        return errorResponse(`제목은 ${TITLE_MAX}자까지 쓸 수 있습니다`, 400);
      }

      const { data: updated, error: updateError } = await db
        .from('staffroom_posts')
        .update({
          title,
          body: postBody,
          body_format: bodyFormat,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .eq('department_id', departmentId)
        .select(POST_FULL_COLUMNS)
        .single();

      if (updateError || !updated) {
        return internalErrorResponse(
          'staffroom-posts.update',
          updateError,
          '글을 고치지 못했습니다',
        );
      }

      // 부른 사람 목록을 새로 맞춘다
      const mentions = validMentions(body?.mentionedEmails, members);
      await db.from('staffroom_mentions').delete().eq('post_id', postId);
      if (mentions.length > 0) {
        await db.from('staffroom_mentions').insert(
          mentions.map((email) => ({
            post_id: postId,
            department_id: departmentId,
            mentioned_email: email,
          })),
        );
      }

      const post = updated as PostRow;
      return jsonResponse({
        post: {
          ...toPostSummaryResponse(post, names, {
            commentCount: 0,
            isUnread: false,
            mentionsMe: mentions.includes(identity.email),
          }),
          body: post.body,
          bodyFormat: normalizeBodyFormat(post.body_format),
          mentionedEmails: mentions,
        },
      });
    }

    // ── 필독 지정·해제 (관리자만) ──────────────────────────────────
    if (action === 'setRequired') {
      const decision = canSetRequired(access, identity.email);
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }
      const isRequired = body?.isRequired === true;

      const { error: flagError } = await db
        .from('staffroom_posts')
        .update({ is_required: isRequired })
        .eq('id', postId)
        .eq('department_id', departmentId);

      if (flagError) {
        return internalErrorResponse(
          'staffroom-posts.setRequired',
          flagError,
          '필독 설정을 바꾸지 못했습니다',
        );
      }

      // 필독을 풀면 사람별 읽음 기록도 지운다 — 필독 글에만 쌓는다는 규칙을 데이터로도 지킨다
      if (!isRequired) {
        await db.from('staffroom_post_reads').delete().eq('post_id', postId);
      }

      return jsonResponse({ postId, isRequired });
    }

    // ── 글 지우기 ──────────────────────────────────────────────────
    if (action === 'delete') {
      const decision = canDeletePost(access, identity.email, target.author_email);
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }

      const { error: deleteError } = await db
        .from('staffroom_posts')
        .delete()
        .eq('id', postId)
        .eq('department_id', departmentId);

      if (deleteError) {
        return internalErrorResponse(
          'staffroom-posts.delete',
          deleteError,
          '글을 지우지 못했습니다',
        );
      }
      return jsonResponse({ deletedPostId: postId });
    }

    // ── 누가 봤나 (필독 글) ────────────────────────────────────────
    if (action === 'readers') {
      if (!target.is_required) {
        // 일반 글에는 사람별 기록을 쌓지 않는다(§3.5-나). 없는 걸 있는 척하지 않는다.
        return jsonResponse({ postId, isRequired: false, read: [], unread: [] });
      }

      const { data: readRows, error: readError } = await db
        .from('staffroom_post_reads')
        .select('member_email, read_at')
        .eq('post_id', postId);

      if (readError) {
        return internalErrorResponse(
          'staffroom-posts.readers',
          readError,
          '읽음 현황을 불러오지 못했습니다',
        );
      }

      const readMap = new Map<string, string>();
      for (const row of (readRows ?? []) as { member_email: string; read_at: string }[]) {
        readMap.set(normalizeEmail(row.member_email), row.read_at);
      }

      const read: { email: string; name: string | null; readAt: string }[] = [];
      const unread: { email: string; name: string | null }[] = [];
      for (const m of members) {
        const email = normalizeEmail(m.member_email);
        const readAt = readMap.get(email);
        if (readAt) read.push({ email, name: m.display_name, readAt });
        else unread.push({ email, name: m.display_name });
      }

      return jsonResponse({ postId, isRequired: true, read, unread });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-posts', err);
  }
});
