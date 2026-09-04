import { useEffect } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordDraftsStore } from '@adapters/stores/useRecordDraftsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useNoteStore } from '@adapters/stores/useNoteStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  applyLiveSyncWrite,
  type LiveSyncWriteRequest,
} from '@usecases/aiBridge/applyLiveSyncWrite';
import type { Todo, TodoPriority } from '@domain/entities/Todo';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { NotePageBody } from '@domain/entities/NotePage';
import { MEMO_COLORS, type MemoColor } from '@domain/valueObjects/MemoColor';
import { isTeachingClassArchived } from '@domain/rules/teachingClassArchive';
import { ManageNotes } from '@usecases/note/ManageNotes';
import { createEmptyNotePageBody, fromEditorDocument } from '@adapters/presenters/notePresenter';
import { noteRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';
import {
  isRecordArea,
  type RecordArea,
  type RecordDraftStatus,
} from '@domain/entities/RecordDraft';

// 노트 쓰기는 store 액션이 제목/본문 인자를 받지 않으므로 usecase 를 직접 쓴다(파일 영속).
// ManageNotes 는 매 쓰기 전에 저장소에서 현재 상태를 다시 읽어 병합하므로, 앱 메모리 스냅샷이
// 잠시 stale 해도 데이터를 덮어쓰지 않는다(UI 갱신은 쓰기 후 useNoteStore.load(true) 로 반영).
const manageNotes = new ManageNotes(noteRepository, generateUUID);

/** 평문 → BlockNote 문서(NotePageBody). 줄바꿈을 문단으로 나눈다(빈 문자열 → 빈 본문). */
function textToNotePageBody(text: string): NotePageBody {
  if (text.length === 0) return createEmptyNotePageBody();
  const document = text.split('\n').map((line) => ({ type: 'paragraph', content: line }));
  return fromEditorDocument(document);
}

const PRIORITIES: readonly string[] = ['high', 'medium', 'low', 'none'];
function coercePriority(v: string | undefined): TodoPriority | undefined {
  return v !== undefined && PRIORITIES.includes(v) ? (v as TodoPriority) : undefined;
}

function coerceMemoColor(v: string | undefined): MemoColor {
  return v !== undefined && (MEMO_COLORS as readonly string[]).includes(v)
    ? (v as MemoColor)
    : 'yellow';
}

const RECORD_STATUSES: readonly string[] = ['draft', 'reviewing', 'confirmed'];
function coerceRecordStatus(v: string | undefined): RecordDraftStatus | undefined {
  return v !== undefined && RECORD_STATUSES.includes(v) ? (v as RecordDraftStatus) : undefined;
}

const PROGRESS_STATUSES: readonly string[] = ['planned', 'completed', 'skipped'];
function coerceProgressStatus(v: string | undefined): ProgressStatus | undefined {
  return v !== undefined && PROGRESS_STATUSES.includes(v) ? (v as ProgressStatus) : undefined;
}

// ── 멱등 가드(#2) — 호스트가 timeout(504) 후 멱등키를 기록하지 못해도, AI 가 같은 키로 재시도할 때
//    렌더러가 중복 적용을 막는다.
//    · 영속(localStorage): "완료된" (멱등키+내용) 을 남겨 재시작·완료-후 재시도까지 막음.
//    · in-flight(메모리): "적용 진행 중" 인 (멱등키+내용) 을 막아, 첫 적용이 끝나기 전 동시 재시도도 차단.
//    키는 (멱등키 + 내용지문) 합성이라 같은 키+다른 내용은 독립 처리(삼킴 방지, #7). 최근 N개만 유지.
const IDEM_STORAGE_KEY = 'ssampin:aibridge:livesync-idem-v2';
const IDEM_MAX = 300;
const idemKey = (key: string, fingerprint: string): string => `${key}:${fingerprint}`;

function loadIdemMap(): Record<string, 1> {
  try {
    const raw = localStorage.getItem(IDEM_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, 1>)
      : {};
  } catch {
    return {};
  }
}

function saveIdemMap(map: Record<string, 1>): void {
  try {
    let entries = Object.entries(map);
    if (entries.length > IDEM_MAX) entries = entries.slice(entries.length - IDEM_MAX); // 오래된 것부터 폐기(삽입순)
    localStorage.setItem(IDEM_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* QuotaExceeded 등 — 멱등은 안전망이라 실패해도 쓰기 자체는 진행 */
  }
}

const inflight = new Set<string>(); // 적용 진행 중인 (멱등키+내용) — 동시 재시도 차단(메모리)

const liveSyncIdempotency = {
  reserve: (key: string, fingerprint: string): 'duplicate' | 'proceed' => {
    const k = idemKey(key, fingerprint);
    if (loadIdemMap()[k] || inflight.has(k)) return 'duplicate'; // 이미 적용됐거나 진행 중
    inflight.add(k);
    return 'proceed';
  },
  settle: (key: string, fingerprint: string, ok: boolean): void => {
    const k = idemKey(key, fingerprint);
    inflight.delete(k);
    if (ok) {
      const map = loadIdemMap();
      map[k] = 1;
      saveIdemMap(map);
    }
  },
};

type TodoChanges = Partial<
  Pick<
    Todo,
    'text' | 'priority' | 'category' | 'dueDate' | 'startDate' | 'time' | 'status' | 'completed'
  >
>;

/**
 * AI 브릿지 live-sync 쓰기 수신 — main process(loopback 서버)가 위임한 검증된 쓰기를 store 액션으로 적용한다.
 * store 액션을 거치므로 메모리 상태가 새 레코드를 포함해, 이후 저장이 덮어쓰지 않는다. 메인 창에서만 등록.
 */
export function useAiBridgeLiveSync(): void {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.aiBridge?.onApplyWrite) return;
    // 메모·북마크·노트 store 는 위젯을 열어야 로드되므로, live-sync 수정·삭제(exists 검사)가 빈 상태로 404
    // 나지 않게 메인 창 마운트 시 미리 로드해 둔다(load 는 멱등 — 이미 로드됐으면 no-op).
    void useMemoStore.getState().load();
    void useBookmarkStore.getState().loadAll();
    void useNoteStore.getState().load();
    // 관찰기록·담임 기록 store 선로딩 — 라이브싱크 쓰기 대상이며, recordNote 의 라이브 카테고리 검증에도 쓰인다.
    void useObservationStore.getState().load();
    void useStudentRecordsStore.getState().load();
    // 수업반·진도 store 선로딩 — progress 쓰기의 exists/classExists 검사가 빈 상태로 404 나지 않게(load 는 멱등).
    void useTeachingClassStore.getState().load();
    return api.aiBridge.onApplyWrite((raw) => {
      const req = raw as LiveSyncWriteRequest;
      return applyLiveSyncWrite(req, buildLiveSyncDeps());
    });
  }, []);
}

/**
 * 쓰기를 실제로 적용할 때 쓰는 store 묶음.
 *
 * ★따로 뺀 이유: "내 AI로 실행" 중에는 브릿지 쓰기가 곧바로 적용되지 않고 **제안 카드**로
 * 올라간다. 선생님이 [실행]을 누른 뒤 적용하는 쪽(`useOwnAiWriteGate`)도 **같은 묶음**을
 * 써야 두 경로가 어긋나지 않는다. 인라인으로 두면 한쪽만 고쳐지는 사고가 난다.
 *
 * 내용은 옮기기 전과 **한 줄도 다르지 않다**.
 */
export function buildLiveSyncDeps(): Parameters<typeof applyLiveSyncWrite>[1] {
  {
    {
      const todo = useTodoStore.getState();
      const ev = useEventsStore.getState();
      const rd = useRecordDraftsStore.getState();
      const memo = useMemoStore.getState();
      const bk = useBookmarkStore.getState();
      const ns = useNoteStore.getState();
      const tc = useTeachingClassStore.getState();
      const sr = useStudentRecordsStore.getState();
      const obs = useObservationStore.getState();
      return {
        todos: {
          add: (text, opts) =>
            todo.addTodo(
              text,
              opts.dueDate,
              coercePriority(opts.priority),
              opts.category,
              undefined,
              opts.time,
              opts.startDate,
            ),
          update: (id, changes) => todo.updateTodo(id, changes as TodoChanges),
          delete: (id) => todo.deleteTodo(id),
          exists: (id) => todo.todos.some((t) => t.id === id),
        },
        events: {
          add: (params) =>
            ev.addEvent({
              title: params.title,
              date: params.date,
              category: params.category ?? 'etc',
              ...(params.time !== undefined ? { time: params.time } : {}),
              ...(params.location !== undefined ? { location: params.location } : {}),
            }),
          update: (id, changes) => {
            const found = ev.events.find((e) => e.id === id);
            if (!found) return Promise.resolve();
            return ev.updateEvent({ ...found, ...changes } as SchoolEvent);
          },
          delete: (id) => ev.deleteEvent(id),
          exists: (id) => ev.events.some((e) => e.id === id),
        },
        idempotency: liveSyncIdempotency,
        recordDrafts: {
          upsert: (input) => {
            // area 는 applyLiveSyncWrite 가 이미 화이트리스트 검증함(방어적으로 재확인).
            if (!isRecordArea(input.area)) return Promise.resolve();
            const status = coerceRecordStatus(input.status);
            return rd
              .upsert({
                area: input.area as RecordArea,
                studentRef: input.studentRef,
                content: input.content,
                ...(input.classId !== undefined ? { classId: input.classId } : {}),
                ...(input.studentKey !== undefined ? { studentKey: input.studentKey } : {}),
                ...(input.studentId !== undefined ? { studentId: input.studentId } : {}),
                ...(input.subject !== undefined ? { subject: input.subject } : {}),
                ...(input.basisObservationIds !== undefined
                  ? { basisObservationIds: input.basisObservationIds }
                  : {}),
                ...(input.groundingFlags !== undefined
                  ? { groundingFlags: input.groundingFlags }
                  : {}),
                ...(status !== undefined ? { status } : {}),
              })
              .then(() => undefined);
          },
        },
        memos: {
          add: (content, color) => memo.addMemo(content, coerceMemoColor(color)),
          update: async (id, changes) => {
            // 메모 store 는 필드별 액션이 분리돼 있어 변경분만 순차 반영(각각 영속 저장).
            if (changes.content !== undefined) await memo.updateMemo(id, changes.content);
            if (changes.color !== undefined)
              await memo.updateColor(id, coerceMemoColor(changes.color));
            if (changes.archived === true) await memo.archiveMemo(id);
            else if (changes.archived === false) await memo.unarchiveMemo(id);
          },
          delete: (id) => memo.deleteMemo(id),
          exists: (id) => memo.memos.some((m) => m.id === id),
        },
        bookmarks: {
          addBookmark: async ({ name, url, groupId }) => {
            // store.addBookmark 은 order·icon 을 호출자가 채워야 하므로 기본값을 구성한다(🔗 이모지·그룹 내 마지막 순서).
            const order =
              Math.max(
                -1,
                ...bk.bookmarks.filter((b) => b.groupId === groupId).map((b) => b.order),
              ) + 1;
            await bk.addBookmark({
              name,
              url,
              groupId,
              order,
              iconType: 'emoji',
              iconValue: '🔗',
              type: 'url',
            });
          },
          addGroup: async ({ name, emoji }) => {
            const order = Math.max(-1, ...bk.groups.map((g) => g.order)) + 1;
            await bk.addGroup({ name, emoji: emoji ?? '🔖', order, collapsed: false });
          },
          update: (id, changes) => bk.updateBookmark(id, changes),
          delete: (id) => bk.deleteBookmark(id),
          exists: (id) => bk.bookmarks.some((b) => b.id === id),
          groupExists: (id) => bk.groups.some((g) => g.id === id),
        },
        notes: {
          createNotebook: async (title) => {
            await manageNotes.createNotebook({ title, initialPageBody: createEmptyNotePageBody() });
            await useNoteStore.getState().load(true);
          },
          createSection: async (notebookId, title) => {
            await manageNotes.createSection(notebookId, title);
            await useNoteStore.getState().load(true);
          },
          createPage: async (sectionId, title, bodyText) => {
            const body =
              bodyText !== undefined ? textToNotePageBody(bodyText) : createEmptyNotePageBody();
            await manageNotes.createPage(sectionId, title, body);
            await useNoteStore.getState().load(true);
          },
          updatePage: async (id, changes) => {
            if (changes.title !== undefined) await manageNotes.renamePage(id, changes.title);
            if (changes.bodyText !== undefined)
              await manageNotes.updatePageBody(id, textToNotePageBody(changes.bodyText));
            if (changes.pinned !== undefined) {
              const current = ns.pagesMeta.find((p) => p.id === id);
              if (current && current.pinned !== changes.pinned) await manageNotes.togglePagePin(id);
            }
            await useNoteStore.getState().load(true);
          },
          deletePage: async (id) => {
            await manageNotes.deletePage(id);
            await useNoteStore.getState().load(true);
          },
          notebookExists: (id) => ns.notebooks.some((n) => n.id === id),
          sectionExists: (id) => ns.sections.some((s) => s.id === id),
          pageExists: (id) => ns.pagesMeta.some((p) => p.id === id),
        },
        attendance: {
          // 교과반 출결 (classId, date, period) 단건 upsert — store 가 groupId 미러링 처리.
          // 쓰기가 차단되면 던진다 — applyLiveSyncWrite 가 500 으로 응답하고 멱등 예약을
          // 해제해 재시도가 열린다. 삼키면 "저장 완료"로 굳어 재시도까지 막힌다(ADR-027).
          save: async (input) => {
            const saved = await tc.saveAttendanceRecord(input);
            if (!saved) throw new Error('출결 저장이 차단되어 기록하지 못했습니다.');
          },
        },
        homeroomAttendance: {
          // 정규 교시 수(settings.maxPeriods, 기본 7) — usecase 가 allDay 펼침에 사용.
          regularPeriodCount: useSettingsStore.getState().settings.maxPeriods ?? 7,
          save: async (input) => {
            const className = useSettingsStore.getState().settings.className ?? '';
            // 대상 학생만 갱신(나머지 보존). 담임 명단(students.json)에서 번호로 매칭.
            const target = new Set(input.studentNumbers);
            const students = useStudentStore
              .getState()
              .students.filter((s) => s.studentNumber != null && target.has(s.studentNumber));
            // (1) 출결부(attendance.json) 미러 — 대상 학생만 부분 갱신(나머지 학생 보존).
            //     기존에는 in-memory getDayAttendance로 병합한 하루치를 통째 교체했는데,
            //     그 스냅샷이 낡으면 동시 편집된 다른 학생 출결을 덮는다(2026-07 QA F3).
            //     보존·병합은 usecase가 락 안 fresh 스냅샷에서 수행한다(P6).
            // 쓰기 차단이면 null — 여기서 던져야 아래 (2) 기록부 미러가 실행되지 않는다.
            // 삼키면 원본 출결부 없이 사본만 생기고(이중 장부 역방향 어긋남) 멱등키까지
            // 완료 처리돼 재시도가 봉쇄된다(ADR-027).
            const savedEntries = await tc.upsertStudentAttendanceEntries({
              classId: className,
              date: input.date,
              studentNumbers: target,
              recordsByPeriod: input.recordsByPeriod,
            });
            if (savedEntries === null) {
              throw new Error('출결부 저장이 차단되어 담임 출결을 기록하지 못했습니다.');
            }
            // (2) 기록부(student-records) 미러 — subcategory 자동계산 + att-{id}-{date}.
            await sr.bridgeHomeroomDayAttendance({
              className,
              date: input.date,
              recordsByPeriod: input.recordsByPeriod,
              students,
            });
          },
        },
        observations: {
          // 수업반 관찰기록 append — store 가 메모리 반영 + 파일 저장을 일원화한다(visibility 는 store 가 private 고정).
          add: (obsInput) =>
            obs
              .addRecord({
                studentId: obsInput.studentId,
                classId: obsInput.classId ?? '',
                date: obsInput.date ?? new Date().toISOString().slice(0, 10),
                content: obsInput.content,
                tags: obsInput.tags ? [...obsInput.tags] : [],
              })
              .then(() => undefined),
        },
        recordNote: {
          // 담임 학생 기록 append — addRecord(studentId, categoryId, subcategory, content, date).
          add: (noteInput) =>
            sr
              .addRecord(
                noteInput.studentId,
                noteInput.categoryId,
                noteInput.subcategory,
                noteInput.content,
                noteInput.date ?? new Date().toISOString().slice(0, 10),
              )
              .then(() => undefined),
          // 라이브 카테고리(렌더러 store 의 단일 진실) — applyRecordNote 가 categoryId/subcategory 재검증에 쓴다.
          categories: () => useStudentRecordsStore.getState().categories,
        },
        progress: {
          // 수업 진도 추가 — store 액션이 UUID 발급·메모리 반영·파일 저장을 일원화한다.
          add: (input) =>
            tc
              .addProgressEntry(
                input.classId,
                input.date,
                input.period,
                input.unit,
                input.lesson ?? '',
                input.note ?? '',
                coerceProgressStatus(input.status),
                // 브릿지 계약은 void 를 돌려준다 — store 가 만든 항목을 돌려주게 되면서 추가.
              )
              .then(() => undefined),
          update: async (id, changes) => {
            const found = tc.progressEntries.find((e) => e.id === id);
            if (!found) return;
            const status = coerceProgressStatus(changes.status);
            await tc.updateProgressEntry({
              ...found,
              ...(changes.date !== undefined ? { date: changes.date } : {}),
              ...(changes.period !== undefined ? { period: changes.period } : {}),
              ...(changes.unit !== undefined ? { unit: changes.unit } : {}),
              ...(changes.lesson !== undefined ? { lesson: changes.lesson } : {}),
              ...(status !== undefined ? { status } : {}),
              ...(changes.note !== undefined ? { note: changes.note } : {}),
            });
          },
          delete: (id) => tc.deleteProgressEntry(id),
          exists: (id) => tc.progressEntries.some((e) => e.id === id),
          classExists: (classId) => tc.classes.some((c) => c.id === classId),
          isClassArchived: (classId) => {
            const cls = tc.classes.find((c) => c.id === classId);
            return cls ? isTeachingClassArchived(cls) : false;
          },
        },
      };
    }
  }
}
