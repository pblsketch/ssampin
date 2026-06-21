/**
 * AI 브릿지 live-sync 쓰기 적용 (렌더러 usecase).
 *
 * 외부 AI 가 loopback 제어 서버로 보낸 쓰기(검증 완료 페이로드)를 받아, **렌더러의 store 액션**으로 적용한다.
 * store 액션을 거치므로 메모리 상태가 새 레코드를 포함하게 되어, 이후 저장이 덮어쓰지 않는다(live-sync 핵심).
 *
 * 순수 로직(주입된 store 액션 deps 만 사용) — 단위 테스트 가능. IPC/electron 글루는 호출자가 담당.
 */

export interface LiveSyncWriteRequest {
  readonly domain: 'todos' | 'events' | 'recordDrafts';
  readonly op: 'create' | 'update' | 'complete' | 'delete';
  readonly idempotencyKey: string;
  readonly data: Record<string, unknown>;
}

/** 생기부 초안 upsert 입력(store 액션 주입용 — 식별·내부 메타 제외, 안전 필드만). */
export interface LiveSyncRecordDraftInput {
  readonly area: string;
  readonly studentRef: string;
  readonly classId?: string;
  readonly studentKey?: string;
  readonly studentId?: string;
  readonly subject?: string;
  readonly content: string;
  readonly basisObservationIds?: readonly string[];
  readonly groundingFlags?: readonly string[];
  readonly status?: string;
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
  readonly recordDrafts: {
    /** (area+studentRef+subject) 키 upsert. 호출자는 useRecordDraftsStore.upsert 를 넘긴다. */
    readonly upsert: (input: LiveSyncRecordDraftInput) => Promise<void>;
  };
  /**
   * 멱등 가드(주입, 선택) — 같은 (idempotencyKey, fingerprint) 쓰기의 중복 적용을 막는다.
   *  - reserve: 'duplicate'=이미 적용됐거나(영속) 적용 진행 중(in-flight) → 호출자는 재적용 없이 ok.
   *            'proceed'=예약 성공 → 적용을 진행하고 끝나면 반드시 settle 한다.
   *  - settle: ok 면 영속 기록(이후에도 dedup), 실패면 예약 해제(재시도가 새로 적용되도록). 항상 in-flight 해제.
   *
   * 호스트는 렌더러 응답이 timeout(504)이면 멱등키를 기록하지 못하는데, 그 사이 렌더러는 적용 중이거나
   * 막 끝냈을 수 있다. AI 가 같은 키로 재시도하면 또 add 되어 중복이 생기므로(#2), reserve 의 in-flight 예약이
   * "적용 진행 중" 동시 재시도까지 막고, 영속 기록이 "완료 후" 재시도를 막는다. fingerprint 까지 비교하므로
   * 같은 키+다른 내용은 삼키지 않는다(#7). 미주입 시 무동작(하위호환).
   */
  readonly idempotency?: {
    readonly reserve: (key: string, fingerprint: string) => 'duplicate' | 'proceed';
    readonly settle: (key: string, fingerprint: string, ok: boolean) => void;
  };
}

/**
 * payload 지문 — domain·op·data 정규 문자열의 cyrb53(53비트) 해시. 32비트 FNV 의 충돌 위험은 없애고
 * (#7), 원문을 그대로 저장할 때의 localStorage 용량 회귀도 피한다(컴팩트). 지문은 같은 멱등키 안에서만
 * 비교되고 멱등키 자체가 내용에 결합돼 있어, 53비트로도 잘못된 dedup 은 사실상 불가능하다. data 는
 * JSON.parse 결과라 같은 요청이면 키 순서도 같아 같은 지문이 된다.
 */
function payloadFingerprint(req: LiveSyncWriteRequest): string {
  const s = `${req.domain}:${req.op}:${JSON.stringify(req.data)}`;
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
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
    // #5: 브리지 createTodo 스키마와 정렬 — startDate 는 브리지에 없어 제외.
    const opts: {
      dueDate?: string;
      priority?: string;
      category?: string;
      time?: string;
    } = {};
    const dueDate = asStr(d['dueDate']);
    if (dueDate !== undefined) opts.dueDate = dueDate;
    const priority = asStr(d['priority']);
    if (priority !== undefined) opts.priority = priority;
    const category = asStr(d['category']);
    if (category !== undefined) opts.category = category;
    const time = asStr(d['time']);
    if (time !== undefined) opts.time = time;
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
  // update — 안전 필드만 통과(#5: 브리지 updateTodo 스키마와 정렬 — completed(complete op 전용)·startDate(미지원) 제외).
  const changes: Record<string, unknown> = {};
  for (const k of ['text', 'priority', 'category', 'dueDate', 'time', 'status'] as const) {
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
  // #5: 브리지 updateEvent 스키마와 정렬 — description 은 브리지에 없어 제외.
  const changes: Record<string, unknown> = {};
  for (const k of ['title', 'date', 'category', 'time', 'location'] as const) {
    if (d[k] !== undefined) changes[k] = d[k];
  }
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.events.update(id, changes);
  return ok(req.idempotencyKey);
}

const RECORD_AREAS: ReadonlySet<string> = new Set([
  'autonomy',
  'career',
  'behavior',
  'subject',
  'individualSubject',
  'club',
  'subjectDev',
]);

async function applyRecordDrafts(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  // 생기부 초안은 create(upsert)만 — 수정·삭제는 본체 UI 에서만(법정기록 보수화).
  if (req.op !== 'create') return bad('생기부 초안은 저장(create)만 지원합니다.');
  const d = req.data;
  const area = asStr(d['area']);
  const studentRef = asStr(d['studentRef']);
  const content = asStr(d['content']);
  if (!area || !RECORD_AREAS.has(area)) return bad('유효한 area 가 필요합니다.');
  if (!studentRef) return bad('studentRef 가 필요합니다.');
  if (!content) return bad('content 가 필요합니다.');

  const input: {
    area: string;
    studentRef: string;
    content: string;
    classId?: string;
    studentKey?: string;
    studentId?: string;
    subject?: string;
    basisObservationIds?: readonly string[];
    groundingFlags?: readonly string[];
    status?: string;
  } = { area, studentRef, content };
  const classId = asStr(d['classId']);
  if (classId !== undefined) input.classId = classId;
  const studentKey = asStr(d['studentKey']);
  if (studentKey !== undefined) input.studentKey = studentKey;
  const studentId = asStr(d['studentId']);
  if (studentId !== undefined) input.studentId = studentId;
  const subject = asStr(d['subject']);
  if (subject !== undefined) input.subject = subject;
  const status = asStr(d['status']);
  if (status !== undefined) input.status = status;
  if (Array.isArray(d['basisObservationIds'])) {
    input.basisObservationIds = d['basisObservationIds'].filter(
      (x): x is string => typeof x === 'string',
    );
  }
  if (Array.isArray(d['groundingFlags'])) {
    input.groundingFlags = d['groundingFlags'].filter((x): x is string => typeof x === 'string');
  }

  await deps.recordDrafts.upsert(input);
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
  const idem = deps.idempotency;
  const fp = idem ? payloadFingerprint(req) : '';
  // #2: 같은 (멱등키, 내용)이 이미 적용됐거나 적용 진행 중이면 재적용하지 않는다(타임아웃 후/중 재시도 중복 차단).
  //   가드 자체의 예외는 삼켜 쓰기를 깨지 않는다 — 가드는 안전망일 뿐이라, 막혀도 최악은 드문 중복뿐이다.
  let reserved = false;
  if (idem) {
    try {
      if (idem.reserve(req.idempotencyKey, fp) === 'duplicate') return ok(req.idempotencyKey);
      reserved = true;
    } catch {
      /* 가드 오류 → 예약 없이 진행 */
    }
  }

  let result: LiveSyncWriteResult;
  try {
    if (req.domain === 'todos') result = await applyTodos(req, deps);
    else if (req.domain === 'events') result = await applyEvents(req, deps);
    else if (req.domain === 'recordDrafts') result = await applyRecordDrafts(req, deps);
    else result = bad('지원하지 않는 도메인입니다.');
  } catch {
    result = { ok: false, status: 500, error: '쓰기 적용 중 오류가 발생했습니다.' };
  }
  // 예약했을 때만 settle — 성공이면 영속 기록(이후 dedup), 실패/미지원이면 예약 해제(재시도가 새로 적용).
  if (idem && reserved) {
    try {
      idem.settle(req.idempotencyKey, fp, result.ok);
    } catch {
      /* 가드 오류 무시 */
    }
  }
  return result;
}
