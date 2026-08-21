/**
 * 온라인 교무실 — 공간(모듈)·배너·토론방·회의록 (M4)
 *
 * 계획서: §6(모듈 종류·이름·배너) · §8-C(회의록) · §8-E(활동 포인트 금지)
 *
 * ★ §8-E — 이 함수 어디에도 **사람별 누적을 세는 자리가 없다.** 세는 것은
 *   `staffroom_discussion_tally` 가 안건 하나의 찬반을 세는 것뿐이다.
 *   "누가 몇 번 참여했나"는 만들지 않는다(쌤핀 금지 규칙).
 *
 * action:
 *   modules       { departmentId }                                → 공간 목록 + 배너
 *   addModule     { departmentId, kind, name }
 *   renameModule  { departmentId, moduleId, name }
 *   moveModule    { departmentId, moduleId, direction }           → 탭 순서 바꾸기
 *   deleteModule  { departmentId, moduleId }
 *   setBanner     { departmentId, kind, value }
 *
 *   discussions   { departmentId, moduleId }                      → 안건 목록 + 집계
 *   getDiscussion { departmentId, discussionId }                  → 안건 + 낸 뜻 전부
 *   addDiscussion { departmentId, moduleId, title, body }
 *   vote          { departmentId, discussionId, stance, comment }
 *   closeDiscussion { departmentId, discussionId, closed }
 *   deleteDiscussion { departmentId, discussionId }
 *
 *   minutesList   { departmentId, moduleId }
 *   addMinutes    { departmentId, moduleId, ... }
 *   updateMinutes { departmentId, minutesId, ... }
 *   deleteMinutes { departmentId, minutesId }
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
  canDeleteModule,
  canEditRoomItem,
  canManageModules,
  checkText,
  denialMessage,
  denialStatus,
  isDateString,
  MAX_MODULES,
  MODULE_KINDS,
  MODULE_NAME_MAX_LENGTH,
  requireMember,
  ROOM_TITLE_MAX_LENGTH,
  STANCES,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadDiscussion,
  loadMembers,
  loadMinutes,
  loadModules,
  loadTallies,
  moduleBelongsTo,
  nameMapOf,
  toAccessMembers,
  toDiscussionResponse,
  toMinutesResponse,
  toVoteResponse,
  DISCUSSION_COLUMNS,
  MINUTES_COLUMNS,
  type DiscussionRow,
  type MinutesRow,
  type ModuleRow,
  type VoteRow,
} from '../_shared/staffroomDb.ts';

/** 안건 본문 상한 — 게시판 글과 같은 권고 수준 */
const BODY_MAX = 20_000;

/** 투표 의견 상한 — 화면(StaffRoomRooms.ts)과 같은 값 */
const COMMENT_MAX = 1_000;

/** 회의록 각 칸의 상한 */
const MINUTES_FIELD_MAX = 20_000;

/** 한 번에 내려보내는 개수 */
const PAGE_SIZE = 200;

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

    // 멤버가 아니면 부서에 무엇이 있는지조차 알려주지 않는다
    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }
    const myEmail = normalizeEmail(identity.email);

    // ── 공간 목록 + 배너 ────────────────────────────────────────────
    if (action === 'modules') {
      const modules = await loadModules(db, departmentId);
      const { data: dept } = await db
        .from('staffroom_departments')
        .select('banner_kind, banner_value')
        .eq('id', departmentId)
        .maybeSingle();

      const banner = dept as { banner_kind: string; banner_value: string } | null;
      return jsonResponse({
        modules: modules.map((m) => ({
          id: m.id,
          departmentId: m.department_id,
          kind: m.kind,
          name: m.name,
          position: m.position,
          unreadCount: 0,
        })),
        banner: {
          kind: banner?.banner_kind ?? 'color',
          value: banner?.banner_value ?? '',
        },
      });
    }

    // ── 공간 만들기 (관리자만) ──────────────────────────────────────
    if (action === 'addModule') {
      const allowed = canManageModules(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const kind: unknown = body?.kind;
      if (typeof kind !== 'string' || !(MODULE_KINDS as readonly string[]).includes(kind)) {
        return errorResponse('만들 수 없는 종류입니다', 400);
      }

      const named = checkText(body?.name, MODULE_NAME_MAX_LENGTH, '이름');
      if (!named.ok) return errorResponse(named.message, 400);

      const existing = await loadModules(db, departmentId);
      if (existing.length >= MAX_MODULES) {
        return errorResponse(
          `공간은 ${MAX_MODULES}개까지 만들 수 있습니다. 쓰지 않는 공간을 먼저 지워주세요.`,
          409,
        );
      }

      const nextPosition = existing.reduce((max, m) => Math.max(max, m.position), 0) + 1;
      const { data, error } = await db
        .from('staffroom_modules')
        .insert({
          department_id: departmentId,
          kind,
          name: named.value,
          position: nextPosition,
        })
        .select('id, department_id, kind, name, position')
        .single();

      if (error) throw new Error(`공간 생성 실패: ${error.message}`);
      const row = data as ModuleRow;
      return jsonResponse({
        module: {
          id: row.id,
          departmentId: row.department_id,
          kind: row.kind,
          name: row.name,
          position: row.position,
          unreadCount: 0,
        },
      });
    }

    // ── 공간 이름 바꾸기 (관리자만) ─────────────────────────────────
    if (action === 'renameModule') {
      const allowed = canManageModules(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      if (!moduleId || !(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 공간이 아닙니다', 403);
      }

      const named = checkText(body?.name, MODULE_NAME_MAX_LENGTH, '이름');
      if (!named.ok) return errorResponse(named.message, 400);

      const { error } = await db
        .from('staffroom_modules')
        .update({ name: named.value })
        .eq('id', moduleId)
        .eq('department_id', departmentId);

      if (error) throw new Error(`이름 변경 실패: ${error.message}`);
      return jsonResponse({ ok: true, name: named.value });
    }

    // ── 탭 순서 바꾸기 (관리자만) ───────────────────────────────────
    //
    // 위치 숫자를 직접 받지 않고 "한 칸 앞/뒤"만 받는다. 숫자를 받으면 화면과
    // 서버가 어긋났을 때 엉뚱한 자리로 튀고, 두 사람이 동시에 옮기면 겹친다.
    if (action === 'moveModule') {
      const allowed = canManageModules(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      const direction: unknown = body?.direction;
      if (direction !== 'up' && direction !== 'down') {
        return errorResponse('어느 쪽으로 옮길지 알 수 없습니다', 400);
      }

      const modules = await loadModules(db, departmentId);
      const at = modules.findIndex((m) => m.id === moduleId);
      if (at < 0) return errorResponse('이 부서의 공간이 아닙니다', 403);

      const swapWith = direction === 'up' ? at - 1 : at + 1;
      if (swapWith < 0 || swapWith >= modules.length) {
        return jsonResponse({ ok: true }); // 끝이라 움직일 곳이 없다 — 오류는 아니다
      }

      // 위치 숫자가 같거나 비어 있을 수 있어, 목록 순서대로 0..n 을 다시 매긴다
      const reordered = [...modules];
      const [moved] = reordered.splice(at, 1);
      reordered.splice(swapWith, 0, moved);

      for (let i = 0; i < reordered.length; i += 1) {
        await db
          .from('staffroom_modules')
          .update({ position: i })
          .eq('id', reordered[i].id)
          .eq('department_id', departmentId);
      }
      return jsonResponse({ ok: true });
    }

    // ── 공간 지우기 (관리자만) ──────────────────────────────────────
    if (action === 'deleteModule') {
      const allowed = canManageModules(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      const modules = await loadModules(db, departmentId);

      // ★ 마지막 게시판·자료실은 못 지운다 — 안에 있던 글·자료가 함께 사라진다
      const decision = canDeleteModule(
        modules.map((m) => ({ id: m.id, kind: m.kind })),
        moduleId,
      );
      if (!decision.ok) return errorResponse(decision.message, 409);

      const { error } = await db
        .from('staffroom_modules')
        .delete()
        .eq('id', moduleId)
        .eq('department_id', departmentId);

      if (error) throw new Error(`공간 삭제 실패: ${error.message}`);
      return jsonResponse({ ok: true });
    }

    // ── 배너 (관리자만) ─────────────────────────────────────────────
    if (action === 'setBanner') {
      const allowed = canManageModules(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const kind: unknown = body?.kind;
      if (kind !== 'color' && kind !== 'preset' && kind !== 'photo') {
        return errorResponse('고를 수 없는 배너입니다', 400);
      }
      const value = typeof body?.value === 'string' ? body.value.trim().slice(0, 200) : '';

      const { error } = await db
        .from('staffroom_departments')
        .update({ banner_kind: kind, banner_value: value })
        .eq('id', departmentId);

      if (error) throw new Error(`배너 저장 실패: ${error.message}`);
      return jsonResponse({ ok: true, banner: { kind, value } });
    }

    // ── 안건 목록 ───────────────────────────────────────────────────
    if (action === 'discussions') {
      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      if (!moduleId || !(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 토론방이 아닙니다', 403);
      }

      const { data, error } = await db
        .from('staffroom_discussions')
        .select(DISCUSSION_COLUMNS)
        .eq('module_id', moduleId)
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw new Error(`안건 목록 조회 실패: ${error.message}`);
      const rows = (data ?? []) as DiscussionRow[];
      const ids = rows.map((r) => r.id);

      const tallies = await loadTallies(db, ids);
      const myVotes = await loadMyVotes(db, ids, myEmail);

      return jsonResponse({
        discussions: rows.map((row) =>
          toDiscussionResponse(row, names, {
            tally: tallies.get(row.id) ?? { agree: 0, disagree: 0, abstain: 0 },
            myVote: myVotes.get(row.id) ?? null,
          }),
        ),
        memberCount: members.length,
      });
    }

    // ── 안건 하나 + 낸 뜻 전부 ──────────────────────────────────────
    if (action === 'getDiscussion') {
      const discussionId = typeof body?.discussionId === 'string' ? body.discussionId : '';
      const row = await loadDiscussion(db, discussionId, departmentId);
      if (!row) return errorResponse('안건을 찾을 수 없습니다', 404);

      const { data, error } = await db
        .from('staffroom_discussion_votes')
        .select('id, discussion_id, member_email, stance, comment, updated_at')
        .eq('discussion_id', discussionId)
        .order('updated_at', { ascending: true });

      if (error) throw new Error(`뜻 조회 실패: ${error.message}`);
      const votes = (data ?? []) as VoteRow[];

      const tallies = await loadTallies(db, [discussionId]);
      const mine = votes.find((v) => v.member_email === myEmail) ?? null;

      return jsonResponse({
        discussion: toDiscussionResponse(row, names, {
          tally: tallies.get(discussionId) ?? { agree: 0, disagree: 0, abstain: 0 },
          myVote: mine,
        }),
        votes: votes.map((v) => toVoteResponse(v, names)),
        memberCount: members.length,
      });
    }

    // ── 안건 내기 (멤버 누구나) ─────────────────────────────────────
    if (action === 'addDiscussion') {
      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      if (!moduleId || !(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 토론방이 아닙니다', 403);
      }

      const titled = checkText(body?.title, ROOM_TITLE_MAX_LENGTH, '제목');
      if (!titled.ok) return errorResponse(titled.message, 400);
      const bodyText = typeof body?.body === 'string' ? body.body.slice(0, BODY_MAX) : '';

      const { data, error } = await db
        .from('staffroom_discussions')
        .insert({
          module_id: moduleId,
          department_id: departmentId,
          author_email: myEmail,
          title: titled.value,
          body: bodyText,
        })
        .select(DISCUSSION_COLUMNS)
        .single();

      if (error) throw new Error(`안건 생성 실패: ${error.message}`);
      return jsonResponse({
        discussion: toDiscussionResponse(data as DiscussionRow, names, {
          tally: { agree: 0, disagree: 0, abstain: 0 },
          myVote: null,
        }),
      });
    }

    // ── 뜻 내기 (멤버 누구나, 사람당 한 줄) ─────────────────────────
    if (action === 'vote') {
      const discussionId = typeof body?.discussionId === 'string' ? body.discussionId : '';
      const row = await loadDiscussion(db, discussionId, departmentId);
      if (!row) return errorResponse('안건을 찾을 수 없습니다', 404);

      // ★ 마감한 안건에는 못 낸다 — 집계를 보고 뒤늦게 뒤집는 걸 막는다
      if (row.closed_at !== null) {
        return errorResponse('마감된 안건이라 뜻을 낼 수 없습니다', 409);
      }

      const stance: unknown = body?.stance;
      if (typeof stance !== 'string' || !(STANCES as readonly string[]).includes(stance)) {
        return errorResponse('찬성·반대·기권 중에서 골라주세요', 400);
      }
      const comment =
        typeof body?.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : '';

      // 사람마다 안건당 한 줄이다. 마음이 바뀌면 그 줄을 고친다(§8-E)
      const { error } = await db.from('staffroom_discussion_votes').upsert(
        {
          discussion_id: discussionId,
          member_email: myEmail,
          stance,
          comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'discussion_id,member_email' },
      );

      if (error) throw new Error(`뜻 저장 실패: ${error.message}`);

      const tallies = await loadTallies(db, [discussionId]);
      return jsonResponse({
        tally: tallies.get(discussionId) ?? { agree: 0, disagree: 0, abstain: 0 },
      });
    }

    // ── 마감 / 마감 풀기 (낸 사람 또는 관리자) ──────────────────────
    if (action === 'closeDiscussion') {
      const discussionId = typeof body?.discussionId === 'string' ? body.discussionId : '';
      const row = await loadDiscussion(db, discussionId, departmentId);
      if (!row) return errorResponse('안건을 찾을 수 없습니다', 404);

      const allowed = canEditRoomItem(access, identity.email, row.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const closed = body?.closed !== false;
      const { error } = await db
        .from('staffroom_discussions')
        .update({
          closed_at: closed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', discussionId)
        .eq('department_id', departmentId);

      if (error) throw new Error(`마감 처리 실패: ${error.message}`);
      return jsonResponse({ ok: true });
    }

    // ── 안건 지우기 (낸 사람 또는 관리자) ───────────────────────────
    if (action === 'deleteDiscussion') {
      const discussionId = typeof body?.discussionId === 'string' ? body.discussionId : '';
      const row = await loadDiscussion(db, discussionId, departmentId);
      if (!row) return errorResponse('안건을 찾을 수 없습니다', 404);

      const allowed = canEditRoomItem(access, identity.email, row.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const { error } = await db
        .from('staffroom_discussions')
        .delete()
        .eq('id', discussionId)
        .eq('department_id', departmentId);

      if (error) throw new Error(`안건 삭제 실패: ${error.message}`);
      return jsonResponse({ ok: true });
    }

    // ── 회의록 목록 (§8-C) ──────────────────────────────────────────
    if (action === 'minutesList') {
      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      if (!moduleId || !(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 회의록이 아닙니다', 403);
      }

      const { data, error } = await db
        .from('staffroom_minutes')
        .select(MINUTES_COLUMNS)
        .eq('module_id', moduleId)
        .eq('department_id', departmentId)
        .order('met_on', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw new Error(`회의록 조회 실패: ${error.message}`);
      return jsonResponse({
        minutes: ((data ?? []) as MinutesRow[]).map((row) => toMinutesResponse(row, names)),
      });
    }

    // ── 회의록 쓰기 (멤버 누구나) ───────────────────────────────────
    if (action === 'addMinutes') {
      const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
      if (!moduleId || !(await moduleBelongsTo(db, moduleId, departmentId))) {
        return errorResponse('이 부서의 회의록이 아닙니다', 403);
      }

      const fields = readMinutesFields(body);
      if (!fields.ok) return errorResponse(fields.message, 400);

      // 토론방에서 굳힌 것이면 그 안건이 이 부서 것인지 확인한다
      let fromDiscussionId: string | null = null;
      if (typeof body?.fromDiscussionId === 'string' && body.fromDiscussionId) {
        const source = await loadDiscussion(db, body.fromDiscussionId, departmentId);
        if (source) fromDiscussionId = source.id;
      }

      const { data, error } = await db
        .from('staffroom_minutes')
        .insert({
          module_id: moduleId,
          department_id: departmentId,
          author_email: myEmail,
          from_discussion_id: fromDiscussionId,
          ...fields.value,
        })
        .select(MINUTES_COLUMNS)
        .single();

      if (error) throw new Error(`회의록 저장 실패: ${error.message}`);
      return jsonResponse({ minutes: toMinutesResponse(data as MinutesRow, names) });
    }

    // ── 회의록 고치기 (쓴 사람 또는 관리자) ─────────────────────────
    if (action === 'updateMinutes') {
      const minutesId = typeof body?.minutesId === 'string' ? body.minutesId : '';
      const row = await loadMinutes(db, minutesId, departmentId);
      if (!row) return errorResponse('회의록을 찾을 수 없습니다', 404);

      const allowed = canEditRoomItem(access, identity.email, row.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const fields = readMinutesFields(body);
      if (!fields.ok) return errorResponse(fields.message, 400);

      const { data, error } = await db
        .from('staffroom_minutes')
        .update({ ...fields.value, updated_at: new Date().toISOString() })
        .eq('id', minutesId)
        .eq('department_id', departmentId)
        .select(MINUTES_COLUMNS)
        .single();

      if (error) throw new Error(`회의록 저장 실패: ${error.message}`);
      return jsonResponse({ minutes: toMinutesResponse(data as MinutesRow, names) });
    }

    // ── 회의록 지우기 (쓴 사람 또는 관리자) ─────────────────────────
    if (action === 'deleteMinutes') {
      const minutesId = typeof body?.minutesId === 'string' ? body.minutesId : '';
      const row = await loadMinutes(db, minutesId, departmentId);
      if (!row) return errorResponse('회의록을 찾을 수 없습니다', 404);

      const allowed = canEditRoomItem(access, identity.email, row.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      const { error } = await db
        .from('staffroom_minutes')
        .delete()
        .eq('id', minutesId)
        .eq('department_id', departmentId);

      if (error) throw new Error(`회의록 삭제 실패: ${error.message}`);
      return jsonResponse({ ok: true });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (error) {
    console.error('[staffroom-rooms] 오류:', error);
    return internalErrorResponse();
  }
});

/** 내가 낸 뜻을 안건별로 모은다 */
async function loadMyVotes(
  db: ReturnType<typeof serviceClient>,
  discussionIds: readonly string[],
  email: string,
): Promise<Map<string, VoteRow>> {
  const map = new Map<string, VoteRow>();
  if (discussionIds.length === 0) return map;

  const { data, error } = await db
    .from('staffroom_discussion_votes')
    .select('id, discussion_id, member_email, stance, comment, updated_at')
    .in('discussion_id', discussionIds)
    .eq('member_email', email);

  if (error) throw new Error(`내 뜻 조회 실패: ${error.message}`);
  for (const row of (data ?? []) as VoteRow[]) map.set(row.discussion_id, row);
  return map;
}

/** 회의록 입력을 다듬고 검사한다 (§8-C — 안건·논의·결정사항을 따로 받는다) */
function readMinutesFields(
  body: Record<string, unknown>,
): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  const titled = checkText(body?.title, ROOM_TITLE_MAX_LENGTH, '제목');
  if (!titled.ok) return { ok: false, message: titled.message };

  if (!isDateString(body?.met_on ?? body?.metOn)) {
    return { ok: false, message: '회의한 날을 올바르게 골라주세요.' };
  }

  const text = (raw: unknown): string =>
    typeof raw === 'string' ? raw.slice(0, MINUTES_FIELD_MAX) : '';

  return {
    ok: true,
    value: {
      title: titled.value,
      met_on: (body?.met_on ?? body?.metOn) as string,
      attendees: text(body?.attendees),
      agenda: text(body?.agenda),
      discussion: text(body?.discussion),
      decisions: text(body?.decisions),
    },
  };
}
