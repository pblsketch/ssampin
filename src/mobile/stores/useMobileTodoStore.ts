import { create } from 'zustand';
import type { Todo, TodoCategory } from '@domain/entities/Todo';
import { moveTodoDueDate } from '@domain/rules/todoCalendarRules';
import { todoRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileTodoState {
  todos: readonly Todo[];
  categories: readonly TodoCategory[];
  loaded: boolean;
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
  reload: () => Promise<void>;
  addTodo: (todo: Todo) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  /**
   * 마감일을 다른 날로 옮긴다 (2026-08-27).
   *
   * 판정은 데스크톱과 **같은 도메인 규칙**(`moveTodoDueDate`)을 쓴다 — 시작일이 있으면
   * 기간을 유지한 채 함께 밀어야 하는데, 그 계산을 여기서 다시 쓰면 PC 와 답이 갈린다.
   *
   * 되돌리기는 **원래 날짜로 다시 부르면 된다.** 같은 규칙이 이동량만큼 되밀어 주므로
   * 시작일까지 정확히 제자리로 온다.
   */
  setTodoDueDate: (id: string, dueDate: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  toggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  /** 완료된(미보관) 할 일을 일괄 보관. 보관된 개수 반환. */
  archiveCompleted: () => Promise<number>;
  /** 보관함 항목을 다시 활성(미완료)으로 복원. */
  restoreFromArchive: (id: string) => Promise<void>;
}

export const useMobileTodoStore = create<MobileTodoState>((set, get) => ({
  todos: [],
  categories: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await todoRepository.getTodos();
      if (data?.todos) {
        set({ todos: data.todos, categories: data.categories ?? [], loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },

  addTodo: async (todo) => {
    const todos = [...get().todos, todo];
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  toggleTodo: async (id) => {
    const todos = get().todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  setTodoDueDate: async (id, dueDate) => {
    const target = get().todos.find((t) => t.id === id);
    if (!target) return;
    const moved = moveTodoDueDate(target, dueDate);
    // 옮길 수 없거나 같은 날이면 저장하지 않는다 — 안 바뀐 파일을 다시 써서
    // 드라이브 동기화를 깨우면 다른 기기가 헛되이 내려받는다.
    if (!moved) return;

    // 통째로 다시 쓰므로 **모르는 항목까지 그대로 들고 가야 한다**(점검 날짜·관련인 등).
    // 스프레드로 덮어쓰는 이 형태가 그 계약이고, localFields 테스트가 잠근다.
    const todos = get().todos.map((t) => (t.id === id ? { ...t, ...moved } : t));
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteTodo: async (id) => {
    const todos = get().todos.filter((t) => t.id !== id);
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  toggleSubTask: async (todoId, subTaskId) => {
    const todos = get().todos.map((t) =>
      t.id === todoId && t.subTasks
        ? {
            ...t,
            subTasks: t.subTasks.map((st) =>
              st.id === subTaskId ? { ...st, completed: !st.completed } : st,
            ),
          }
        : t,
    );
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  archiveCompleted: async () => {
    const now = new Date().toISOString();
    let count = 0;
    const todos = get().todos.map((t) => {
      if (t.completed && !t.archivedAt) {
        count++;
        const archived: Todo = { ...t, archivedAt: now, updatedAt: now };
        // Google Tasks 연동 항목은 다음 PC 동기화에서 원격 삭제되도록 표시(데스크톱 archiveCompleted와 동일)
        if (t.googleTaskId && !t.remoteDeletedAt) {
          return { ...archived, pendingRemoteOp: 'delete' as const };
        }
        return archived;
      }
      return t;
    });
    if (count === 0) return 0;
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
    return count;
  },

  restoreFromArchive: async (id) => {
    const now = new Date().toISOString();
    const todos = get().todos.map((t) => {
      if (t.id !== id) return t;
      const restored: Todo = { ...t, archivedAt: undefined, completed: false, updatedAt: now };
      // 이전에 원격 정리된 항목이면 다음 동기화에서 신규 생성으로 재진입
      if (restored.remoteDeletedAt) {
        return { ...restored, remoteDeletedAt: undefined, pendingRemoteOp: 'create' as const };
      }
      return restored;
    });
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
