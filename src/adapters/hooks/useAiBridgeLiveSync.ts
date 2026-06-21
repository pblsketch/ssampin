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
