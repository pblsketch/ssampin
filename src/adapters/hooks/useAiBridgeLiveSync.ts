import { useEffect } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordDraftsStore } from '@adapters/stores/useRecordDraftsStore';
import {
  applyLiveSyncWrite,
  type LiveSyncWriteRequest,
} from '@usecases/aiBridge/applyLiveSyncWrite';
import type { Todo, TodoPriority } from '@domain/entities/Todo';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import {
  isRecordArea,
  type RecordArea,
  type RecordDraftStatus,
} from '@domain/entities/RecordDraft';

const PRIORITIES: readonly string[] = ['high', 'medium', 'low', 'none'];
function coercePriority(v: string | undefined): TodoPriority | undefined {
  return v !== undefined && PRIORITIES.includes(v) ? (v as TodoPriority) : undefined;
}

const RECORD_STATUSES: readonly string[] = ['draft', 'reviewing', 'confirmed'];
function coerceRecordStatus(v: string | undefined): RecordDraftStatus | undefined {
  return v !== undefined && RECORD_STATUSES.includes(v) ? (v as RecordDraftStatus) : undefined;
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
    return api.aiBridge.onApplyWrite((raw) => {
      const req = raw as LiveSyncWriteRequest;
      const todo = useTodoStore.getState();
      const ev = useEventsStore.getState();
      const rd = useRecordDraftsStore.getState();
      return applyLiveSyncWrite(req, {
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
      });
    });
  }, []);
}
