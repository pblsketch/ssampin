/**
 * AI 브릿지 live-sync 쓰기 적용 (렌더러 usecase).
 *
 * 외부 AI 가 loopback 제어 서버로 보낸 쓰기(검증 완료 페이로드)를 받아, **렌더러의 store 액션**으로 적용한다.
 * store 액션을 거치므로 메모리 상태가 새 레코드를 포함하게 되어, 이후 저장이 덮어쓰지 않는다(live-sync 핵심).
 *
 * 순수 로직(주입된 store 액션 deps 만 사용) — 단위 테스트 가능. IPC/electron 글루는 호출자가 담당.
 */

export interface LiveSyncWriteRequest {
  readonly domain: 'todos' | 'events';
  readonly op: 'create' | 'update' | 'complete' | 'delete';
  readonly idempotencyKey: string;
  readonly data: Record<string, unknown>;
}

export interface LiveSyncWriteResult {
  readonly ok: boolean;
  /** 성공 시 비식별 참조(원본 id 아님 — 멱등키 echo). */
  readonly ref?: string;
  /** 실패 시 HTTP 상태(400 잘못된 입력 / 404 대상없음 / 500 적용오류). */
  readonly status?: number;
  readonly error?: string;
}

/** store 액션 주입 — 실제 호출자는 useTodoStore/useEventsStore 의 getState() 액션을 넘긴다. */
export interface LiveSyncWriteDeps {
  readonly todos: {
    readonly add: (
      text: string,
      opts: {
        readonly dueDate?: string;
        readonly priority?: string;
        readonly category?: string;
        readonly time?: string;
        readonly startDate?: string;
      },
    ) => Promise<void>;
    readonly update: (id: string, changes: Record<string, unknown>) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    readonly exists: (id: string) => boolean;
  };
  readonly events: {
    readonly add: (params: {
      readonly title: string;
      readonly date: string;
      readonly category?: string;
      readonly time?: string;
      readonly location?: string;
    }) => Promise<void>;
    readonly update: (id: string, changes: Record<string, unknown>) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    readonly exists: (id: string) => boolean;
  };
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function ok(idempotencyKey: string): LiveSyncWriteResult {
  return { ok: true, ref: idempotencyKey };
}
function bad(error: string, status = 400): LiveSyncWriteResult {
  return { ok: false, status, error };
}

async function applyTodos(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const text = asStr(d['text']);
    if (!text) return bad('text 가 필요합니다.');
    const opts: {
      dueDate?: string;
      priority?: string;
      category?: string;
      time?: string;
      startDate?: string;
    } = {};
    const dueDate = asStr(d['dueDate']);
    if (dueDate !== undefined) opts.dueDate = dueDate;
    const priority = asStr(d['priority']);
    if (priority !== undefined) opts.priority = priority;
    const category = asStr(d['category']);
    if (category !== undefined) opts.category = category;
    const time = asStr(d['time']);
    if (time !== undefined) opts.time = time;
    const startDate = asStr(d['startDate']);
    if (startDate !== undefined) opts.startDate = startDate;
    await deps.todos.add(text, opts);
    return ok(req.idempotencyKey);
  }
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.todos.exists(id)) return bad('할일을 찾을 수 없습니다.', 404);
  if (req.op === 'complete') {
    await deps.todos.update(id, { completed: true, status: 'done' });
    return ok(req.idempotencyKey);
  }
  if (req.op === 'delete') {
    await deps.todos.delete(id);
    return ok(req.idempotencyKey);
  }
  // update — 안전 필드만 통과
  const changes: Record<string, unknown> = {};
  for (const k of [
    'text',
    'priority',
    'category',
    'dueDate',
    'startDate',
    'time',
    'status',
    'completed',
  ] as const) {
    if (d[k] !== undefined) changes[k] = d[k];
  }
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.todos.update(id, changes);
  return ok(req.idempotencyKey);
}

async function applyEvents(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const title = asStr(d['title']);
    const date = asStr(d['date']);
    if (!title || !date) return bad('일정 생성에는 title 과 date 가 필요합니다.');
    const params: {
      title: string;
      date: string;
      category?: string;
      time?: string;
      location?: string;
    } = { title, date };
    const category = asStr(d['category']);
    if (category !== undefined) params.category = category;
    const time = asStr(d['time']);
    if (time !== undefined) params.time = time;
    const location = asStr(d['location']);
    if (location !== undefined) params.location = location;
    await deps.events.add(params);
    return ok(req.idempotencyKey);
  }
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.events.exists(id)) return bad('일정을 찾을 수 없습니다.', 404);
  if (req.op === 'delete') {
    await deps.events.delete(id);
    return ok(req.idempotencyKey);
  }
  if (req.op === 'complete') return bad('일정은 complete 연산을 지원하지 않습니다.');
  const changes: Record<string, unknown> = {};
  for (const k of ['title', 'date', 'category', 'time', 'location', 'description'] as const) {
    if (d[k] !== undefined) changes[k] = d[k];
  }
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.events.update(id, changes);
  return ok(req.idempotencyKey);
}

/**
 * 검증된 live-sync 쓰기를 store 액션으로 적용. 도메인/연산별로 분기하며, 실패는 상태코드와 함께 반환.
 * (페이로드 형태는 main 의 validateApplyWrite 가 1차 검증하지만, 여기서도 data 필드를 방어적으로 본다.)
 */
export async function applyLiveSyncWrite(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  try {
    if (req.domain === 'todos') return await applyTodos(req, deps);
    if (req.domain === 'events') return await applyEvents(req, deps);
    return bad('지원하지 않는 도메인입니다.');
  } catch {
    return { ok: false, status: 500, error: '쓰기 적용 중 오류가 발생했습니다.' };
  }
}
