/**
 * 온라인 교무실 — 부서 일정·업무 분담 스토어 (M4 · §8-B)
 *
 * ★ 부서 일정을 **개인 일정으로 복사하지 않는다.** 부서가 주인이라 멤버가 바뀌어도
 *   남아야 하고 부서를 나가면 안 보여야 한다. 복사해 넣으면 나간 뒤에도 남고,
 *   부서에서 고쳐도 이미 복사된 것은 안 바뀐다. 여기 담아 두고 **겹쳐 보여줄 뿐**이다.
 *
 * ★ §8-E — 사람별 누적을 세지 않는다. `doneAt` 은 그 일이 끝났는지를 말할 뿐이다.
 */
import { create } from 'zustand';
import type {
  StaffRoomEvent,
  StaffRoomTask,
  StaffRoomTaskForm,
  WriteStaffRoomEventInput,
  WriteStaffRoomTaskInput,
} from '@domain/entities/StaffRoomRooms';
import type { PastedScheduleRow } from '@domain/rules/staffRoomSchedulePaste';

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '요청 처리 중 오류가 발생했습니다.';
}

async function getGoogleToken(): Promise<string | null> {
  try {
    const { authenticateGoogle } = await import('@adapters/di/container');
    if (!(await authenticateGoogle.isConnected())) return null;
    return await authenticateGoogle.getValidAccessToken();
  } catch {
    return null;
  }
}

interface StaffRoomPlanState {
  /** 지금 보고 있는 부서의 것 */
  events: StaffRoomEvent[];
  tasks: StaffRoomTask[];

  /**
   * 내가 멤버인 **모든** 부서의 것 — 내 달력·내 할 일 위에 겹쳐 보여줄 때 쓴다.
   * 부서 화면을 열지 않아도 필요하므로 위와 따로 둔다.
   */
  myEvents: StaffRoomEvent[];
  myTasks: StaffRoomTask[];
  hasLoadedMine: boolean;

  isLoading: boolean;
  error: string | null;

  /**
   * 업무에 걸어 둔 서식 (066 후속) — 업무 id 별로 따로 받는다.
   *
   * 업무 목록(`tasks`)에는 서식이 몇 개 걸렸는지 실려 오지 않는다 — 카드를 펼쳤을 때만
   * 값을 받는다(`undefined`면 아직 안 받은 것, 빈 배열이면 받았는데 없는 것).
   */
  taskForms: Record<string, StaffRoomTaskForm[]>;
  taskFormsLoading: Record<string, boolean>;
  /** 서식을 걸다가 자료실에 없는 파일이 빠진 개수 — 0 이면 안내하지 않는다 */
  droppedTaskForms: number;

  loadPlan: (departmentId: string) => Promise<void>;
  loadMyPlan: (departmentIds: readonly string[]) => Promise<void>;

  saveEvent: (
    departmentId: string,
    input: WriteStaffRoomEventInput,
    eventId?: string,
  ) => Promise<boolean>;
  removeEvent: (departmentId: string, eventId: string) => Promise<boolean>;

  /**
   * 표 붙여넣기로 읽어낸 일정 여러 건을 한 번에 올린다 (066 후속).
   *
   * 미리보기(파싱)는 이미 화면에서 끝난 뒤라 여기는 올리기와 새로고침만 한다.
   * 서버가 한 번 더 검사하므로 `rejected` 가 함께 온다 — 몇 건이 실제로
   * 반영됐는지는 이 값으로만 알 수 있다(응답 배열 길이로 추측하지 않는다).
   */
  addEventsFromPaste: (
    departmentId: string,
    rows: readonly PastedScheduleRow[],
  ) => Promise<{ added: number; rejected: number } | null>;

  saveTask: (
    departmentId: string,
    input: WriteStaffRoomTaskInput,
    taskId?: string,
  ) => Promise<boolean>;
  toggleTask: (departmentId: string, taskId: string, done: boolean) => Promise<boolean>;
  removeTask: (departmentId: string, taskId: string) => Promise<boolean>;

  /** 업무에 걸어 둔 서식 목록을 받는다. 카드를 펼칠 때 한 번만 부르면 된다 */
  loadTaskForms: (departmentId: string, taskId: string) => Promise<void>;
  /**
   * 업무 서식을 통째로 바꾼다 — 걸기·떼기 모두 이 하나로 처리한다.
   * 자료실에 없는 파일이 섞여 있었으면 `droppedTaskForms` 에 그 수가 남는다.
   */
  setTaskFormFiles: (
    departmentId: string,
    taskId: string,
    fileIds: readonly string[],
  ) => Promise<boolean>;
  clearDroppedTaskForms: () => void;

  clearError: () => void;
  reset: () => void;
}

export const useStaffRoomPlanStore = create<StaffRoomPlanState>((set, get) => ({
  events: [],
  tasks: [],
  myEvents: [],
  myTasks: [],
  hasLoadedMine: false,
  isLoading: false,
  error: null,
  taskForms: {},
  taskFormsLoading: {},
  droppedTaskForms: 0,

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      events: [],
      tasks: [],
      isLoading: false,
      error: null,
      taskForms: {},
      taskFormsLoading: {},
      droppedTaskForms: 0,
    }),

  loadPlan: async (departmentId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listPlan(token, departmentId);
      set({ events: res.events, tasks: res.tasks, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  /**
   * 여러 부서를 한 번에 받는다.
   *
   * 부서마다 따로 부르지 않는 이유 — 부서 5개면 왕복이 5번인데 달력은 달을 넘길 때마다
   * 다시 그린다. 서버가 "내가 실제 멤버인 부서"로 한 번 더 걸러 준다.
   */
  loadMyPlan: async (departmentIds) => {
    if (departmentIds.length === 0) {
      set({ myEvents: [], myTasks: [], hasLoadedMine: true });
      return;
    }
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ hasLoadedMine: true });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listMyPlan(token, departmentIds);
      set({ myEvents: res.events, myTasks: res.tasks, hasLoadedMine: true });

      // ★ 제출 과제의 정본은 제출 스토어다. 여기 담아 두면 개인 화면에서
      //   체크했을 때 교무실 진행률이 안 따라온다.
      //   ★ 왕복은 위 `listMyPlan` 한 번뿐이다 — 제출 스토어는 서버를 안 부른다.
      const { useStaffRoomSubmissionStore } =
        await import('@adapters/stores/useStaffRoomSubmissionStore');
      useStaffRoomSubmissionStore
        .getState()
        .receiveMine(res.submissions ?? [], res.submissionsTruncated ?? false);
    } catch {
      // 겹쳐 보기가 실패해도 내 일정·할 일은 그대로 보여야 한다 — 조용히 넘어간다
      set({ hasLoadedMine: true });
    }
  },

  saveEvent: async (departmentId, input, eventId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      if (eventId) {
        await staffRoomPort.updateEvent(token, departmentId, eventId, input);
      } else {
        await staffRoomPort.addEvent(token, departmentId, input);
      }
      await get().loadPlan(departmentId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  removeEvent: async (departmentId, eventId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteEvent(token, departmentId, eventId);
      set({ events: get().events.filter((e) => e.id !== eventId) });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  addEventsFromPaste: async (departmentId, rows) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return null;
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.addEvents(token, departmentId, rows);
      await get().loadPlan(departmentId);
      return { added: res.events.length, rejected: res.rejected };
    } catch (err) {
      set({ error: messageOf(err) });
      return null;
    }
  },

  saveTask: async (departmentId, input, taskId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      if (taskId) {
        await staffRoomPort.updateTask(token, departmentId, taskId, input);
      } else {
        await staffRoomPort.addTask(token, departmentId, input);
      }
      await get().loadPlan(departmentId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  toggleTask: async (departmentId, taskId, done) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      const updated = await staffRoomPort.toggleTaskDone(token, departmentId, taskId, done);
      set({
        tasks: get().tasks.map((t) => (t.id === taskId ? updated : t)),
        myTasks: get().myTasks.map((t) => (t.id === taskId ? updated : t)),
      });
      return true;
    } catch (err) {
      // 남의 일을 끝났다고 표시하려 하면 서버가 한국어로 거절한다
      set({ error: messageOf(err) });
      return false;
    }
  },

  removeTask: async (departmentId, taskId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteTask(token, departmentId, taskId);
      set({ tasks: get().tasks.filter((t) => t.id !== taskId) });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  loadTaskForms: async (departmentId, taskId) => {
    set({ taskFormsLoading: { ...get().taskFormsLoading, [taskId]: true } });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({
          error: '구글 로그인이 필요합니다.',
          taskFormsLoading: { ...get().taskFormsLoading, [taskId]: false },
        });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const forms = await staffRoomPort.listTaskForms(token, departmentId, taskId);
      set({
        taskForms: { ...get().taskForms, [taskId]: forms },
        taskFormsLoading: { ...get().taskFormsLoading, [taskId]: false },
      });
    } catch (err) {
      set({
        error: messageOf(err),
        taskFormsLoading: { ...get().taskFormsLoading, [taskId]: false },
      });
    }
  },

  setTaskFormFiles: async (departmentId, taskId, fileIds) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ error: '구글 로그인이 필요합니다.' });
        return false;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.setTaskForms(token, departmentId, taskId, fileIds);
      set({
        taskForms: { ...get().taskForms, [taskId]: res.forms },
        droppedTaskForms: res.droppedFiles > 0 ? res.droppedFiles : get().droppedTaskForms,
      });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  clearDroppedTaskForms: () => set({ droppedTaskForms: 0 }),
}));
