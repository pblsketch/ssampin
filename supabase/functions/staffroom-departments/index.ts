/**
 * 온라인 교무실 — 부서 (만들기 · 내 부서 목록 · 부서 하나 보기)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §9(M1)
 *
 * 신원은 구글 access token 을 구글에 되물어 확인한다. 클라이언트가 자기 이메일을
 * 문자열로 주장하는 것은 받지 않는다 — 그러면 남의 부서에 그냥 들어갈 수 있다.
 *
 * action:
 *   create { name, description? }  → 부서를 만들고 만든 사람을 관리자로 등록
 *   list                            → 내가 멤버인 부서 목록
 *   get    { departmentId }         → 부서 하나 (멤버만)
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
  toAccessMembers,
  toDepartmentResponse,
  toModuleResponse,
  type DepartmentRow,
  type MemberRow,
} from '../_shared/staffroomDb.ts';

/** 부서 이름·소개 길이 상한 — 화면(StaffRoom.ts)과 같은 값 */
const NAME_MAX = 40;
const DESCRIPTION_MAX = 100;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action: unknown = body?.action;
    const googleAccessToken: unknown = body?.googleAccessToken;

    if (typeof googleAccessToken !== 'string' || !googleAccessToken) {
      return errorResponse('구글 로그인이 필요합니다', 401);
    }

    const identity = await verifyGoogleIdentity(googleAccessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    const db = serviceClient();

    // ── 부서 만들기 ────────────────────────────────────────────────
    if (action === 'create') {
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const rawDescription = typeof body?.description === 'string' ? body.description.trim() : '';

      if (!name) return errorResponse('부서 이름을 입력해주세요', 400);
      if (name.length > NAME_MAX) {
        return errorResponse(`부서 이름은 ${NAME_MAX}자까지 쓸 수 있습니다`, 400);
      }
      if (rawDescription.length > DESCRIPTION_MAX) {
        return errorResponse(`한 줄 소개는 ${DESCRIPTION_MAX}자까지 쓸 수 있습니다`, 400);
      }

      const { data: created, error: createError } = await db
        .from('staffroom_departments')
        .insert({
          name,
          description: rawDescription || null,
          owner_email: identity.email,
        })
        .select('id, name, description, owner_email, created_at')
        .single();

      if (createError || !created) {
        return internalErrorResponse(
          'staffroom-departments.create',
          createError,
          '부서를 만들지 못했습니다',
        );
      }

      const department = created as DepartmentRow;

      const { error: memberError } = await db.from('staffroom_members').insert({
        department_id: department.id,
        member_email: identity.email,
        display_name: identity.name,
        role: 'admin',
      });

      if (memberError) {
        // 관리자 등록이 실패하면 아무도 못 들어가는 부서가 남는다 — 되돌린다
        await db.from('staffroom_departments').delete().eq('id', department.id);
        return internalErrorResponse(
          'staffroom-departments.create.member',
          memberError,
          '부서를 만들지 못했습니다',
        );
      }

      // 기본 게시판을 함께 깐다(계획서 §6 — 부서를 만들 때 기본 세트를 깔아준다).
      // M2 는 게시판 1개만. 자료실은 M3, 이름 바꾸기·추가는 M4.
      const { error: moduleError } = await db.from('staffroom_modules').insert({
        department_id: department.id,
        kind: 'board',
        name: '게시판',
        position: 0,
      });
      if (moduleError) {
        // 게시판이 없으면 부서가 빈 껍데기가 된다 — 조용히 넘기지 않고 로그를 남긴다.
        // 부서 자체는 살리고, 050 마이그레이션의 보정 INSERT 가 다음 배포에서 메운다.
        console.error('[staffroom-departments] 기본 게시판 생성 실패:', moduleError.message);
      }

      return jsonResponse({
        department: { ...toDepartmentResponse(department, 'admin', 1), unreadCount: 0 },
      });
    }

    // ── 내 부서 목록 ───────────────────────────────────────────────
    if (action === 'list') {
      const { data: myRows, error: myError } = await db
        .from('staffroom_members')
        .select('department_id, role')
        .eq('member_email', identity.email);

      if (myError) {
        return internalErrorResponse(
          'staffroom-departments.list.members',
          myError,
          '부서 목록을 불러오지 못했습니다',
        );
      }

      const memberships = (myRows ?? []) as { department_id: string; role: 'admin' | 'member' }[];
      if (memberships.length === 0) return jsonResponse({ departments: [] });

      const ids = memberships.map((m) => m.department_id);

      const { data: deptRows, error: deptError } = await db
        .from('staffroom_departments')
        .select('id, name, description, owner_email, created_at')
        .in('id', ids)
        .order('created_at', { ascending: true });

      if (deptError) {
        return internalErrorResponse(
          'staffroom-departments.list.departments',
          deptError,
          '부서 목록을 불러오지 못했습니다',
        );
      }

      // 부서별 멤버 수 — 목록에 카드로 보여준다
      const { data: countRows, error: countError } = await db
        .from('staffroom_members')
        .select('department_id')
        .in('department_id', ids);

      if (countError) {
        return internalErrorResponse(
          'staffroom-departments.list.count',
          countError,
          '부서 목록을 불러오지 못했습니다',
        );
      }

      const counts = new Map<string, number>();
      for (const row of (countRows ?? []) as { department_id: string }[]) {
        counts.set(row.department_id, (counts.get(row.department_id) ?? 0) + 1);
      }

      const roleById = new Map(memberships.map((m) => [m.department_id, m.role]));

      // 안 읽은 글 수는 데이터베이스가 센다 — 글을 통째로 받아 세면
      // 계획서 §3.5-다 의 전송량 설계가 무너진다.
      const unreadByDepartment = new Map<string, number>();
      const { data: unreadRows, error: unreadError } = await db.rpc('staffroom_unread_counts', {
        p_email: identity.email,
        p_department_ids: ids,
      });
      if (unreadError) {
        // 개수를 못 세도 목록 자체는 보여준다(배지만 0 으로 뜬다)
        console.error('[staffroom-departments] 안 읽은 개수 조회 실패:', unreadError.message);
      } else {
        for (const row of (unreadRows ?? []) as {
          department_id: string;
          unread_count: number;
        }[]) {
          unreadByDepartment.set(
            row.department_id,
            (unreadByDepartment.get(row.department_id) ?? 0) + Number(row.unread_count ?? 0),
          );
        }
      }

      const departments = ((deptRows ?? []) as DepartmentRow[]).map((row) => ({
        ...toDepartmentResponse(row, roleById.get(row.id) ?? 'member', counts.get(row.id) ?? 0),
        unreadCount: unreadByDepartment.get(row.id) ?? 0,
      }));

      return jsonResponse({ departments });
    }

    // ── 부서 하나 보기 ─────────────────────────────────────────────
    if (action === 'get') {
      const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';
      if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);

      const members: MemberRow[] = await loadMembers(db, departmentId);
      const access = requireMember(toAccessMembers(members), identity.email);
      if (!access.ok) {
        return errorResponse(denialMessage(access.reason), denialStatus(access.reason));
      }

      const { data: deptRow, error: deptError } = await db
        .from('staffroom_departments')
        .select('id, name, description, owner_email, created_at')
        .eq('id', departmentId)
        .single();

      if (deptError || !deptRow) {
        return errorResponse('부서를 찾을 수 없습니다', 404);
      }

      // 클라이언트가 글을 읽으려면 게시판 id 를 알아야 한다.
      // 050 이전에 만들어진 부서에는 없을 수 있으므로 없으면 null 로 준다.
      const board = await loadBoardModule(db, departmentId);
      let unreadCount = 0;
      if (board) {
        const { data: unreadRows } = await db.rpc('staffroom_unread_counts', {
          p_email: identity.email,
          p_department_ids: [departmentId],
        });
        for (const row of (unreadRows ?? []) as { module_id: string; unread_count: number }[]) {
          if (row.module_id === board.id) unreadCount = Number(row.unread_count ?? 0);
        }
      }

      return jsonResponse({
        department: {
          ...toDepartmentResponse(deptRow as DepartmentRow, access.member.role, members.length),
          unreadCount,
        },
        board: board ? toModuleResponse(board, unreadCount) : null,
      });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-departments', err);
  }
});
