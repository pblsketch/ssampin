/**
 * 온라인 교무실 — 부서 일정 · 업무 분담 (M4)
 *
 * 계획서 §8-B — "부서 일정 → 내 일정에 겹쳐 보기" · "부서 업무 분담 → 내 할 일로"
 *
 * ★ 부서 일정을 **개인 일정으로 복사하지 않는다.**
 *   부서 일정은 부서가 주인이라 멤버가 바뀌어도 남아야 하고, 부서를 나가면 안 보여야 한다.
 *   개인 일정 표에 복사해 넣으면 나간 뒤에도 남고, 부서에서 고쳐도 이미 복사된 것은 안 바뀐다.
 *   앱은 이걸 **읽어서 내 달력 위에 겹쳐 보여줄 뿐**이다.
 *
 * ★ §8-E — 사람별 누적을 세지 않는다. `done_at` 은 그 일이 끝났는지를 말할 뿐
 *   사람에게 붙는 점수가 아니다. "누가 몇 개 했나"를 세는 자리는 만들지 않는다.
 *
 * action:
 *   list       { departmentId }                       → 이 부서의 일정·업무
 *   mine       { departmentIds }                       → 여러 부서를 한 번에 (내 달력·할 일용)
 *   addEvent   { departmentId, ... }
 *   updateEvent{ departmentId, eventId, ... }
 *   deleteEvent{ departmentId, eventId }
 *   addTask    { departmentId, ... }
 *   updateTask { departmentId, taskId, ... }
 *   toggleTask { departmentId, taskId, done }
 *   deleteTask { departmentId, taskId }
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
  canEditRoomItem,
  canToggleTaskDone,
  checkText,
  denialMessage,
  denialStatus,
  emptyToNull,
  isDateString,
  isTimeString,
  normalizeAssignee,
  requireMember,
  ROOM_TITLE_MAX_LENGTH,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  nameMapOf,
  toAccessMembers,
  type Db,
} from '../_shared/staffroomDb.ts';

const MEMO_MAX = 2_000;
const PAGE_SIZE = 300;

/** 한 번에 훑을 수 있는 부서 수 — 내 달력이 부서 수만큼 무거워지지 않게 */
const MINE_DEPARTMENT_MAX = 20;

interface EventRow {
  id: string;
  department_id: string;
  author_email: string;
  title: string;
  starts_on: string;
  ends_on: string | null;
  start_time: string | null;
  place: string;
  memo: string;
}

interface TaskRow {
  id: string;
  department_id: string;
  author_email: string;
  title: string;
  assignee_email: string | null;
  due_on: string | null;
  memo: string;
  done_at: string | null;
}

const EVENT_COLUMNS =
  'id, department_id, author_email, title, starts_on, ends_on, start_time, place, memo';
const TASK_COLUMNS =
  'id, department_id, author_email, title, assignee_email, due_on, memo, done_at';

function toEvent(row: EventRow, departmentName: string, names: Map<string, string | null>) {
  return {
    id: row.id,
    departmentId: row.department_id,
    departmentName,
    title: row.title,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startTime: row.start_time,
    place: row.place,
    memo: row.memo,
    authorEmail: row.author_email,
    authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
  };
}

function toTask(row: TaskRow, departmentName: string, names: Map<string, string | null>) {
  return {
    id: row.id,
    departmentId: row.department_id,
    departmentName,
    title: row.title,
    assigneeEmail: row.assignee_email,
    assigneeName: row.assignee_email
      ? (names.get(row.assignee_email.trim().toLowerCase()) ?? null)
      : null,
    dueOn: row.due_on,
    memo: row.memo,
    doneAt: row.done_at,
    authorEmail: row.author_email,
  };
}

/** 일정 입력을 다듬고 검사한다 (화면 규칙 `staffRoomRoomRules.checkEvent` 와 같은 기준) */
function readEventFields(
  body: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const titled = checkText(body?.title, ROOM_TITLE_MAX_LENGTH, '제목');
  if (!titled.ok) return { ok: false, message: titled.message };

  if (!isDateString(body?.startsOn)) {
    return { ok: false, message: '날짜를 올바르게 골라주세요.' };
  }

  const endsOn = emptyToNull(body?.endsOn);
  if (endsOn !== null) {
    if (!isDateString(endsOn)) return { ok: false, message: '마지막 날을 올바르게 골라주세요.' };
    if (endsOn < (body.startsOn as string)) {
      return { ok: false, message: '마지막 날이 시작 날보다 앞설 수 없습니다.' };
    }
  }

  const startTime = emptyToNull(body?.startTime);
  if (startTime !== null && !isTimeString(startTime)) {
    return { ok: false, message: '시각을 올바르게 입력해주세요. (예: 14:30)' };
  }

  return {
    ok: true,
    value: {
      title: titled.value,
      starts_on: body.startsOn,
      ends_on: endsOn,
      start_time: startTime,
      place: typeof body?.place === 'string' ? body.place.trim().slice(0, 200) : '',
      memo: typeof body?.memo === 'string' ? body.memo.slice(0, MEMO_MAX) : '',
    },
  };
}

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
    const myEmail = normalizeEmail(identity.email);

    // ── 여러 부서를 한 번에 (내 달력·내 할 일에 겹쳐 보기용) ────────
    //
    // ★ 부서마다 따로 부르지 않는다. 부서 5개면 왕복이 5번인데, 달력은 달을 넘길 때마다
    //   다시 그린다. 한 번에 받아 앱이 갈무리해 둔다.
    if (action === 'mine') {
      const requested = Array.isArray(body?.departmentIds) ? body.departmentIds : [];
      const ids = requested
        .filter((id: unknown): id is string => typeof id === 'string')
        .slice(0, MINE_DEPARTMENT_MAX);
      if (ids.length === 0) return jsonResponse({ events: [], tasks: [] });

      // ★ 요청한 부서 중 **내가 실제 멤버인 것만** 남긴다.
      //   안 거르면 남의 부서 id 를 보내 그 부서 일정을 훔쳐볼 수 있다.
      const { data: mineRows, error: mineError } = await db
        .from('staffroom_members')
        .select('department_id')
        .eq('member_email', myEmail)
        .in('department_id', ids);
      if (mineError) throw new Error(`멤버 확인 실패: ${mineError.message}`);

      const allowed = ((mineRows ?? []) as Array<{ department_id: string }>).map(
        (r) => r.department_id,
      );
      if (allowed.length === 0) return jsonResponse({ events: [], tasks: [] });

      const nameByDept = await departmentNames(db, allowed);

      const { data: eventRows } = await db
        .from('staffroom_events')
        .select(EVENT_COLUMNS)
        .in('department_id', allowed)
        .order('starts_on', { ascending: true })
        .limit(PAGE_SIZE);

      const { data: taskRows } = await db
        .from('staffroom_tasks')
        .select(TASK_COLUMNS)
        .in('department_id', allowed)
        .order('due_on', { ascending: true })
        .limit(PAGE_SIZE);

      const emptyNames = new Map<string, string | null>();
      return jsonResponse({
        events: ((eventRows ?? []) as EventRow[]).map((r) =>
          toEvent(r, nameByDept.get(r.department_id) ?? '', emptyNames),
        ),
        tasks: ((taskRows ?? []) as TaskRow[]).map((r) =>
          toTask(r, nameByDept.get(r.department_id) ?? '', emptyNames),
        ),
      });
    }

    // ── 여기부터는 부서 하나를 다룬다 ───────────────────────────────
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';
    if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);

    const members = await loadMembers(db, departmentId);
    const access = toAccessMembers(members);
    const names = nameMapOf(members);

    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }

    const nameByDept = await departmentNames(db, [departmentId]);
    const departmentName = nameByDept.get(departmentId) ?? '';

    if (action === 'list') {
      const { data: eventRows, error: eventError } = await db
        .from('staffroom_events')
        .select(EVENT_COLUMNS)
        .eq('department_id', departmentId)
        .order('starts_on', { ascending: true })
        .limit(PAGE_SIZE);
      if (eventError) throw new Error(`일정 조회 실패: ${eventError.message}`);

      const { data: taskRows, error: taskError } = await db
        .from('staffroom_tasks')
        .select(TASK_COLUMNS)
        .eq('department_id', departmentId)
        .order('due_on', { ascending: true })
        .limit(PAGE_SIZE);
      if (taskError) throw new Error(`업무 조회 실패: ${taskError.message}`);

      return jsonResponse({
        events: ((eventRows ?? []) as EventRow[]).map((r) => toEvent(r, departmentName, names)),
        tasks: ((taskRows ?? []) as TaskRow[]).map((r) => toTask(r, departmentName, names)),
      });
    }

    // ── 일정 ────────────────────────────────────────────────────────
    if (action === 'addEvent') {
      const fields = readEventFields(body);
      if (!fields.ok) return errorResponse(fields.message, 400);

      const { data, error } = await db
        .from('staffroom_events')
        .insert({ department_id: departmentId, author_email: myEmail, ...fields.value })
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw new Error(`일정 저장 실패: ${error.message}`);
      return jsonResponse({ event: toEvent(data as EventRow, departmentName, names) });
    }

    if (action === 'updateEvent' || action === 'deleteEvent') {
      const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
      const existing = await loadOne<EventRow>(
        db,
        'staffroom_events',
        EVENT_COLUMNS,
        eventId,
        departmentId,
      );
      if (!existing) return errorResponse('일정을 찾을 수 없습니다', 404);

      const allowed = canEditRoomItem(access, identity.email, existing.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      if (action === 'deleteEvent') {
        const { error } = await db
          .from('staffroom_events')
          .delete()
          .eq('id', eventId)
          .eq('department_id', departmentId);
        if (error) throw new Error(`일정 삭제 실패: ${error.message}`);
        return jsonResponse({ ok: true });
      }

      const fields = readEventFields(body);
      if (!fields.ok) return errorResponse(fields.message, 400);

      const { data, error } = await db
        .from('staffroom_events')
        .update({ ...fields.value, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('department_id', departmentId)
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw new Error(`일정 저장 실패: ${error.message}`);
      return jsonResponse({ event: toEvent(data as EventRow, departmentName, names) });
    }

    // ── 업무 ────────────────────────────────────────────────────────
    if (action === 'addTask') {
      const titled = checkText(body?.title, ROOM_TITLE_MAX_LENGTH, '제목');
      if (!titled.ok) return errorResponse(titled.message, 400);

      const dueOn = emptyToNull(body?.dueOn);
      if (dueOn !== null && !isDateString(dueOn)) {
        return errorResponse('기한을 올바르게 골라주세요.', 400);
      }

      const { data, error } = await db
        .from('staffroom_tasks')
        .insert({
          department_id: departmentId,
          author_email: myEmail,
          title: titled.value,
          // ★ 부서 밖 사람을 담당자로 넣을 수 없다
          assignee_email: normalizeAssignee(access, body?.assigneeEmail),
          due_on: dueOn,
          memo: typeof body?.memo === 'string' ? body.memo.slice(0, MEMO_MAX) : '',
        })
        .select(TASK_COLUMNS)
        .single();
      if (error) throw new Error(`업무 저장 실패: ${error.message}`);
      return jsonResponse({ task: toTask(data as TaskRow, departmentName, names) });
    }

    if (action === 'updateTask' || action === 'deleteTask' || action === 'toggleTask') {
      const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
      const existing = await loadOne<TaskRow>(
        db,
        'staffroom_tasks',
        TASK_COLUMNS,
        taskId,
        departmentId,
      );
      if (!existing) return errorResponse('업무를 찾을 수 없습니다', 404);

      // ★ 끝냈다고 표시하는 것과 고치는 것은 판정이 다르다.
      //   끝냄은 **맡은 본인**(과 관리자), 고치기·지우기는 **만든 사람**(과 관리자)이다.
      //   남의 일을 끝났다고 표시하면 실제로는 안 끝난 일이 목록에서 사라진다.
      const allowed =
        action === 'toggleTask'
          ? canToggleTaskDone(access, identity.email, existing.assignee_email)
          : canEditRoomItem(access, identity.email, existing.author_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      if (action === 'deleteTask') {
        const { error } = await db
          .from('staffroom_tasks')
          .delete()
          .eq('id', taskId)
          .eq('department_id', departmentId);
        if (error) throw new Error(`업무 삭제 실패: ${error.message}`);
        return jsonResponse({ ok: true });
      }

      const patch =
        action === 'toggleTask'
          ? { done_at: body?.done === false ? null : new Date().toISOString() }
          : (() => {
              const titled = checkText(body?.title, ROOM_TITLE_MAX_LENGTH, '제목');
              if (!titled.ok) return null;
              const dueOn = emptyToNull(body?.dueOn);
              if (dueOn !== null && !isDateString(dueOn)) return null;
              return {
                title: titled.value,
                assignee_email: normalizeAssignee(access, body?.assigneeEmail),
                due_on: dueOn,
                memo: typeof body?.memo === 'string' ? body.memo.slice(0, MEMO_MAX) : '',
              };
            })();

      if (patch === null) return errorResponse('입력을 다시 확인해주세요.', 400);

      const { data, error } = await db
        .from('staffroom_tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('department_id', departmentId)
        .select(TASK_COLUMNS)
        .single();
      if (error) throw new Error(`업무 저장 실패: ${error.message}`);
      return jsonResponse({ task: toTask(data as TaskRow, departmentName, names) });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (error) {
    console.error('[staffroom-plan] 오류:', error);
    return internalErrorResponse();
  }
});

/** 부서 id → 이름. 내 달력에 여러 부서가 겹쳐 뜨므로 어디 것인지 함께 보여준다 */
async function departmentNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await db.from('staffroom_departments').select('id, name').in('id', ids);
  if (error) throw new Error(`부서 조회 실패: ${error.message}`);
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(row.id, row.name);
  }
  return map;
}

/** 이 부서의 행 하나 — 남의 부서 id 를 보내도 통하지 않게 부서로 좁혀 읽는다 */
async function loadOne<T>(
  db: Db,
  table: string,
  columns: string,
  id: string,
  departmentId: string,
): Promise<T | null> {
  if (!id) return null;
  const { data, error } = await db
    .from(table)
    .select(columns)
    .eq('id', id)
    .eq('department_id', departmentId)
    .maybeSingle();
  if (error) throw new Error(`조회 실패: ${error.message}`);
  return (data as T | null) ?? null;
}
