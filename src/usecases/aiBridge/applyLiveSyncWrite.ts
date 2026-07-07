/**
 * AI 브릿지 live-sync 쓰기 적용 (렌더러 usecase).
 *
 * 외부 AI 가 loopback 제어 서버로 보낸 쓰기(검증 완료 페이로드)를 받아, **렌더러의 store 액션**으로 적용한다.
 * store 액션을 거치므로 메모리 상태가 새 레코드를 포함하게 되어, 이후 저장이 덮어쓰지 않는다(live-sync 핵심).
 *
 * 순수 로직(주입된 store 액션 deps 만 사용) — 단위 테스트 가능. IPC/electron 글루는 호출자가 담당.
 */

import type {
  AttendanceReason,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
// 쓰기 도메인/연산 enum 은 단일 계약 def 에서 생성된 산출물에서만 파생한다(수기 중복 제거).
import type { WriteDomain, WriteOp } from '@domain/contracts/aiBridgeWriteContract';

export interface LiveSyncWriteRequest {
  readonly domain: WriteDomain;
  readonly op: WriteOp;
  readonly idempotencyKey: string;
  readonly data: Record<string, unknown>;
}

/** 교과반 출결 upsert 입력(store 액션 주입용). 브릿지 attendance payload 와 1:1. */
export interface LiveSyncAttendanceInput {
  readonly classId: string;
  readonly groupId?: string;
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
}

/** 담임 일일 출결 위임 입력 — 펼침(allDay→교시) 후 교시별 맵 + 대상 학생번호. */
export interface LiveSyncHomeroomAttendanceInput {
  readonly date: string;
  /** period → 해당 교시 이상출결 학생 목록(번호 기준). present 는 포함하지 않는다. */
  readonly recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  /** 이번 쓰기 대상 학생 번호(담임 명단에서 이 학생만 갱신, 나머지 보존). */
  readonly studentNumbers: readonly number[];
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

/** 수업 진도(progress) create 입력(store 액션 주입용). 브릿지 progress payload 와 1:1. */
export interface LiveSyncProgressInput {
  readonly classId: string;
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson?: string;
  readonly status?: string;
  readonly note?: string;
}

/** 수업 진도 update 변경분 — 소속 반(classId)은 변경 불가. */
export interface LiveSyncProgressChanges {
  readonly date?: string;
  readonly period?: number;
  readonly unit?: string;
  readonly lesson?: string;
  readonly status?: string;
  readonly note?: string;
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
  readonly memos: {
    readonly add: (content: string, color?: string) => Promise<void>;
    readonly update: (
      id: string,
      changes: { readonly content?: string; readonly color?: string; readonly archived?: boolean },
    ) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    readonly exists: (id: string) => boolean;
  };
  readonly bookmarks: {
    readonly addBookmark: (input: {
      readonly name: string;
      readonly url: string;
      readonly groupId: string;
    }) => Promise<void>;
    readonly addGroup: (input: { readonly name: string; readonly emoji?: string }) => Promise<void>;
    readonly update: (
      id: string,
      changes: { readonly name?: string; readonly url?: string },
    ) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    /** 북마크 항목 존재 확인(update/delete 대상). */
    readonly exists: (id: string) => boolean;
    /** 대상 그룹 존재 확인(create bookmark 대상). */
    readonly groupExists: (id: string) => boolean;
  };
  readonly notes: {
    readonly createNotebook: (title: string) => Promise<void>;
    readonly createSection: (notebookId: string, title: string) => Promise<void>;
    /** bodyText 는 평문 — 어댑터가 BlockNote 문서로 변환해 저장. */
    readonly createPage: (sectionId: string, title: string, bodyText?: string) => Promise<void>;
    readonly updatePage: (
      id: string,
      changes: { readonly title?: string; readonly bodyText?: string; readonly pinned?: boolean },
    ) => Promise<void>;
    readonly deletePage: (id: string) => Promise<void>;
    readonly notebookExists: (id: string) => boolean;
    readonly sectionExists: (id: string) => boolean;
    readonly pageExists: (id: string) => boolean;
  };
  readonly attendance: {
    /** 교과반 출결 (classId, date, period) 단건 upsert. delete 는 students:[] 로 비운다(출결 제거). */
    readonly save: (input: LiveSyncAttendanceInput) => Promise<void>;
  };
  readonly homeroomAttendance: {
    /** 정규 교시 수(settings.maxPeriods) — allDay(하루 전체)를 조회0+정규1~N+종례9 로 펼칠 때 사용. */
    readonly regularPeriodCount: number;
    /** 담임 일일 출결 위임 — 대상 학생만 갱신(subcategory 계산·교과반 미러링은 store 가 처리). */
    readonly save: (input: LiveSyncHomeroomAttendanceInput) => Promise<void>;
  };
  readonly observations: {
    /** 수업반 관찰기록 append — 호출자는 useObservationStore.addRecord 를 넘긴다. */
    readonly add: (input: {
      readonly studentId: string;
      readonly classId?: string;
      readonly date?: string;
      readonly content: string;
      readonly tags?: readonly string[];
    }) => Promise<void>;
  };
  readonly progress: {
    /** 수업 진도 추가 — 호출자는 useTeachingClassStore.addProgressEntry 를 넘긴다. */
    readonly add: (input: LiveSyncProgressInput) => Promise<void>;
    /** 수업 진도 수정(변경 필드만) — 호출자가 기존 항목과 병합해 updateProgressEntry 로 반영. */
    readonly update: (id: string, changes: LiveSyncProgressChanges) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    readonly exists: (id: string) => boolean;
    /** create 대상 수업반 존재 확인(미상 classId 로의 고아 진도 생성 차단). */
    readonly classExists: (classId: string) => boolean;
  };
  readonly recordNote: {
    /** 담임 학생 기록(student-records) append — 호출자는 useStudentRecordsStore.addRecord 를 넘긴다. */
    readonly add: (input: {
      readonly studentId: string;
      readonly categoryId: string;
      readonly subcategory: string;
      readonly content: string;
      readonly date?: string;
    }) => Promise<void>;
    /**
     * 라이브 카테고리 목록(렌더러 store 의 신뢰 가능한 단일 진실) — categoryId 존재·attendance 제외·
     * subcategory 멤버십을 적용 직전 재검증한다. 사용자 커스텀 카테고리도 그대로 통과(하드코딩 화이트리스트 금지).
     */
    readonly categories: () => readonly {
      readonly id: string;
      readonly subcategories: readonly string[];
    }[];
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

async function applyMemos(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const content = asStr(d['content']);
    if (!content) return bad('content 가 필요합니다.');
    const color = asStr(d['color']);
    await deps.memos.add(content, color);
    return ok(req.idempotencyKey);
  }
  if (req.op === 'complete') return bad('메모는 complete 연산을 지원하지 않습니다.');
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.memos.exists(id)) return bad('메모를 찾을 수 없습니다.', 404);
  if (req.op === 'delete') {
    await deps.memos.delete(id);
    return ok(req.idempotencyKey);
  }
  // update — 안전 필드만 통과(content/color/archived).
  const changes: { content?: string; color?: string; archived?: boolean } = {};
  if (typeof d['content'] === 'string') changes.content = d['content'];
  if (typeof d['color'] === 'string') changes.color = d['color'];
  if (typeof d['archived'] === 'boolean') changes.archived = d['archived'];
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.memos.update(id, changes);
  return ok(req.idempotencyKey);
}

async function applyBookmarks(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const kind = asStr(d['kind']);
    const name = asStr(d['name']);
    if (!name) return bad('name 이 필요합니다.');
    if (kind === 'group') {
      const emoji = asStr(d['emoji']);
      await deps.bookmarks.addGroup({ name, ...(emoji !== undefined ? { emoji } : {}) });
      return ok(req.idempotencyKey);
    }
    if (kind === 'bookmark') {
      const url = asStr(d['url']);
      const groupId = asStr(d['groupId']);
      if (!url) return bad('url 이 필요합니다.');
      if (!groupId) return bad('groupId 가 필요합니다.');
      if (!deps.bookmarks.groupExists(groupId)) return bad('대상 그룹을 찾을 수 없습니다.', 404);
      await deps.bookmarks.addBookmark({ name, url, groupId });
      return ok(req.idempotencyKey);
    }
    return bad('kind 는 bookmark|group 이어야 합니다.');
  }
  if (req.op === 'complete') return bad('북마크는 complete 연산을 지원하지 않습니다.');
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.bookmarks.exists(id)) return bad('북마크를 찾을 수 없습니다.', 404);
  if (req.op === 'delete') {
    await deps.bookmarks.delete(id);
    return ok(req.idempotencyKey);
  }
  // update — 북마크 항목의 name/url 만.
  const changes: { name?: string; url?: string } = {};
  if (typeof d['name'] === 'string') changes.name = d['name'];
  if (typeof d['url'] === 'string') changes.url = d['url'];
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.bookmarks.update(id, changes);
  return ok(req.idempotencyKey);
}

async function applyNotes(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const kind = asStr(d['kind']);
    const title = asStr(d['title']);
    if (!title) return bad('title 이 필요합니다.');
    if (kind === 'notebook') {
      await deps.notes.createNotebook(title);
      return ok(req.idempotencyKey);
    }
    if (kind === 'section') {
      const notebookId = asStr(d['notebookId']);
      if (!notebookId) return bad('notebookId 가 필요합니다.');
      if (!deps.notes.notebookExists(notebookId)) return bad('노트북을 찾을 수 없습니다.', 404);
      await deps.notes.createSection(notebookId, title);
      return ok(req.idempotencyKey);
    }
    if (kind === 'page') {
      const sectionId = asStr(d['sectionId']);
      if (!sectionId) return bad('sectionId 가 필요합니다.');
      if (!deps.notes.sectionExists(sectionId)) return bad('섹션을 찾을 수 없습니다.', 404);
      const bodyText = typeof d['body'] === 'string' ? d['body'] : undefined;
      await deps.notes.createPage(sectionId, title, bodyText);
      return ok(req.idempotencyKey);
    }
    return bad('kind 는 notebook|section|page 이어야 합니다.');
  }
  if (req.op === 'complete') return bad('노트는 complete 연산을 지원하지 않습니다.');
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.notes.pageExists(id)) return bad('페이지를 찾을 수 없습니다.', 404);
  if (req.op === 'delete') {
    await deps.notes.deletePage(id);
    return ok(req.idempotencyKey);
  }
  // update — 페이지 제목/본문/고정. body 는 빈 문자열도 허용(본문 비우기).
  const changes: { title?: string; bodyText?: string; pinned?: boolean } = {};
  if (typeof d['title'] === 'string') changes.title = d['title'];
  if (typeof d['body'] === 'string') changes.bodyText = d['body'];
  if (typeof d['pinned'] === 'boolean') changes.pinned = d['pinned'];
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.notes.updatePage(id, changes);
  return ok(req.idempotencyKey);
}

/** raw 출결 학생 → StudentAttendance. 검증은 main validateApplyWrite 가 완료(방어적 캐스팅). */
function toStudentAttendance(raw: Record<string, unknown>): StudentAttendance {
  const s: { number: number; status: AttendanceStatus; reason?: AttendanceReason; memo?: string } =
    {
      number: raw['number'] as number,
      status: raw['status'] as AttendanceStatus,
    };
  if (typeof raw['reason'] === 'string') s.reason = raw['reason'] as AttendanceReason;
  if (typeof raw['memo'] === 'string') s.memo = raw['memo'] as string;
  return s;
}

/** 교과반 출결 — create=upsert, delete=students 비우기(해당 교시 출결 제거). */
async function applyAttendance(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  const classId = d['classId'];
  const date = d['date'];
  const period = d['period'];
  if (typeof classId !== 'string' || typeof date !== 'string' || typeof period !== 'number') {
    return bad('출결 payload 가 올바르지 않습니다.');
  }
  const groupId = typeof d['groupId'] === 'string' ? d['groupId'] : undefined;
  const students =
    req.op === 'create' && Array.isArray(d['students'])
      ? d['students'].map((s) => toStudentAttendance(s as Record<string, unknown>))
      : [];
  await deps.attendance.save({
    classId,
    date,
    period,
    students,
    ...(groupId !== undefined ? { groupId } : {}),
  });
  return ok(req.idempotencyKey);
}

/** 담임 일일 출결 — allDay(하루 전체)는 조회0+정규1~N+종례9 로 펼쳐 교시별 맵 구성 후 위임. */
async function applyHomeroomAttendance(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  const date = d['date'];
  const rawStudents = d['students'];
  if (typeof date !== 'string' || !Array.isArray(rawStudents)) {
    return bad('담임 출결 payload 가 올바르지 않습니다.');
  }
  const n = deps.homeroomAttendance.regularPeriodCount;
  // 하루 전체 펼침 교시: 조회(0) + 정규(1..n) + 종례(9)
  const allDayPeriods = [0, ...Array.from({ length: Math.max(0, n) }, (_, i) => i + 1), 9];
  const recordsByPeriod = new Map<number, StudentAttendance[]>();
  const studentNumbers: number[] = [];
  const pushAt = (period: number, sa: StudentAttendance): void => {
    const arr = recordsByPeriod.get(period);
    if (arr) arr.push(sa);
    else recordsByPeriod.set(period, [sa]);
  };
  for (const raw of rawStudents) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const number = o['number'];
    if (typeof number !== 'number') continue;
    studentNumbers.push(number);
    if (o['allDay'] !== undefined && o['allDay'] !== null) {
      const base = toStudentAttendance({ ...(o['allDay'] as Record<string, unknown>), number });
      for (const p of allDayPeriods) pushAt(p, base);
    } else if (Array.isArray(o['periods'])) {
      for (const pe of o['periods']) {
        if (!pe || typeof pe !== 'object') continue;
        const peo = pe as Record<string, unknown>;
        const period = peo['period'];
        if (typeof period !== 'number') continue;
        pushAt(period, toStudentAttendance({ ...peo, number }));
      }
    }
  }
  await deps.homeroomAttendance.save({ date, recordsByPeriod, studentNumbers });
  return ok(req.idempotencyKey);
}

/** 수업반 관찰기록 — create(append)만. studentId+content 필수, classId/date/tags 선택. */
async function applyObservations(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  if (req.op !== 'create') return bad('관찰기록은 저장(create)만 지원합니다.');
  const d = req.data;
  const studentId = asStr(d['studentId']);
  const content = asStr(d['content']);
  if (!studentId) return bad('studentId 가 필요합니다.');
  if (!content) return bad('content 가 필요합니다.');
  const input: {
    studentId: string;
    content: string;
    classId?: string;
    date?: string;
    tags?: readonly string[];
  } = { studentId, content };
  const classId = asStr(d['classId']);
  if (classId !== undefined) input.classId = classId;
  const date = asStr(d['date']);
  if (date !== undefined) input.date = date;
  if (Array.isArray(d['tags'])) {
    input.tags = d['tags'].filter((x): x is string => typeof x === 'string');
  }
  await deps.observations.add(input);
  return ok(req.idempotencyKey);
}

/**
 * 담임 노트 — create 전용. 카테고리/세부항목의 진위를 **렌더러 라이브 store**(deps.recordNote.categories)로
 * 적용 직전 재검증한다(신뢰 가능한 단일 진실 — 사용자 커스텀 카테고리도 통과, attendance 는 출결 전용이라 거부).
 */
async function applyRecordNote(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  if (req.op !== 'create') return bad('담임 노트는 저장(create)만 지원합니다.');
  const d = req.data;
  const studentId = asStr(d['studentId']);
  const content = asStr(d['content']);
  const categoryId = asStr(d['categoryId']);
  const subcategory = asStr(d['subcategory']);
  if (!studentId) return bad('studentId 가 필요합니다.');
  if (!content) return bad('content 가 필요합니다.');
  if (!categoryId) return bad('categoryId 가 필요합니다.');
  if (!subcategory) return bad('subcategory 가 필요합니다.');
  // 출결은 합성 id 의 별도 트랙 — 노트가 침범하지 않는다(출결은 출결 도구로 등록).
  if (categoryId === 'attendance') {
    return bad('출결 카테고리에는 노트를 쓸 수 없습니다(출결은 출결 도구를 쓰세요).');
  }
  // 라이브 카테고리 진위 — 하드코딩 화이트리스트가 아니라 렌더러 store 의 현재 목록과 대조.
  const categories = deps.recordNote.categories();
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    const allowed = categories
      .filter((c) => c.id !== 'attendance')
      .map((c) => c.id)
      .join(', ');
    return bad(`categoryId 를 찾을 수 없습니다. 허용된 카테고리: ${allowed}`);
  }
  if (category.subcategories.length === 0) {
    return bad('이 카테고리는 노트 대상이 아닙니다(세부항목이 없는 카테고리).');
  }
  if (!category.subcategories.includes(subcategory)) {
    return bad(`subcategory 가 올바르지 않습니다. 허용: ${category.subcategories.join(', ')}`);
  }
  const input: {
    studentId: string;
    categoryId: string;
    subcategory: string;
    content: string;
    date?: string;
  } = { studentId, categoryId, subcategory, content };
  const date = asStr(d['date']);
  if (date !== undefined) input.date = date;
  await deps.recordNote.add(input);
  return ok(req.idempotencyKey);
}

/** 수업 진도(progress) — create/update/delete. 대상 반·항목의 존재는 렌더러 store 로 재검증한다. */
async function applyProgress(
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
): Promise<LiveSyncWriteResult> {
  const d = req.data;
  if (req.op === 'create') {
    const classId = asStr(d['classId']);
    const date = asStr(d['date']);
    const unit = asStr(d['unit']);
    const period = d['period'];
    if (!classId || !date || !unit || typeof period !== 'number') {
      return bad('진도 생성에는 classId·date·period·unit 이 필요합니다.');
    }
    if (!deps.progress.classExists(classId)) return bad('수업반을 찾을 수 없습니다.', 404);
    const lesson = asStr(d['lesson']);
    const status = asStr(d['status']);
    const note = typeof d['note'] === 'string' ? d['note'] : undefined;
    const input: LiveSyncProgressInput = {
      classId,
      date,
      period,
      unit,
      ...(lesson !== undefined ? { lesson } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    await deps.progress.add(input);
    return ok(req.idempotencyKey);
  }
  if (req.op === 'complete') return bad('진도 기록은 complete 연산을 지원하지 않습니다.');
  const id = asStr(d['id']);
  if (!id) return bad('대상 id 가 필요합니다.');
  if (!deps.progress.exists(id)) return bad('진도 기록을 찾을 수 없습니다.', 404);
  if (req.op === 'delete') {
    await deps.progress.delete(id);
    return ok(req.idempotencyKey);
  }
  // update — 안전 필드만 통과(classId 변경 불가 — 검증 단계에서 이미 거부됨).
  const changes: Record<string, unknown> = {};
  for (const k of ['date', 'period', 'unit', 'lesson', 'status', 'note'] as const) {
    if (d[k] !== undefined) changes[k] = d[k];
  }
  if (Object.keys(changes).length === 0) return bad('변경할 필드가 없습니다.');
  await deps.progress.update(id, changes as LiveSyncProgressChanges);
  return ok(req.idempotencyKey);
}

/** 도메인별 핸들러 시그니처(모두 동일 — req+deps → 결과). */
type LiveSyncHandler = (
  req: LiveSyncWriteRequest,
  deps: LiveSyncWriteDeps,
) => Promise<LiveSyncWriteResult>;

/**
 * 도메인 → 핸들러 디스패치. `satisfies Record<WriteDomain, …>` 로 누락·잉여 도메인을 컴파일 타임에 강제한다
 * (계약 def 에서 도메인을 빼면 핸들러가 남아 잉여 키 에러, 새 도메인을 더하면 핸들러 누락 에러 — exhaustiveness).
 */
const LIVE_SYNC_DISPATCH = {
  todos: applyTodos,
  events: applyEvents,
  recordDrafts: applyRecordDrafts,
  memos: applyMemos,
  bookmarks: applyBookmarks,
  notes: applyNotes,
  attendance: applyAttendance,
  homeroomAttendance: applyHomeroomAttendance,
  observations: applyObservations,
  recordNote: applyRecordNote,
  progress: applyProgress,
} satisfies Record<WriteDomain, LiveSyncHandler>;

/** 디스패치가 실제로 다루는 도메인 키 — 계약 정렬 메타테스트가 WRITE_DOMAINS 와 일치 검증. */
export const LIVE_SYNC_DISPATCH_DOMAINS = Object.keys(LIVE_SYNC_DISPATCH) as readonly WriteDomain[];

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
    // req.domain 은 WriteDomain 으로 검증돼 항상 핸들러가 있으나, 방어적으로 미지원 경로를 남긴다.
    const handler = LIVE_SYNC_DISPATCH[req.domain] as LiveSyncHandler | undefined;
    result = handler ? await handler(req, deps) : bad('지원하지 않는 도메인입니다.');
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
