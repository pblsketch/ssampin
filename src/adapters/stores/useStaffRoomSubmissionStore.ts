/**
 * 온라인 교무실 — 제출 과제 스토어 (066)
 *
 * ★ **제출 과제의 정본은 이 스토어 하나다.**
 *   부서 화면에서 본 목록과 개인 할 일 화면에 겹쳐 보이는 것이 서로 다른
 *   스토어에 있으면, 개인 화면에서 체크했는데 교무실 진행률이 안 바뀐다.
 *   그래서 `useStaffRoomPlanStore` 에는 제출 과제를 두지 않는다.
 *
 * ★ **`mine` 왕복은 여기서 하지 않는다.**
 *   여러 부서를 한 번에 받는 왕복은 `useStaffRoomPlanStore.loadMyPlan` 한 곳뿐이고,
 *   그 함수가 응답의 제출 과제를 이 스토어로 넘긴다(`receiveMine`).
 *   여기서 또 부르면 개인 화면을 열 때마다 왕복이 두 배가 된다.
 *
 * ★ §8-E — 사람별 누적을 세지 않는다. `doneCount` 는 **그 과제 하나**의 수이고,
 *   여러 과제를 가로질러 "이 분이 N개 안 냄"으로 세는 자리를 만들지 않는다.
 */
import { create } from 'zustand';
import type {
  StaffRoomMySubmission,
  StaffRoomSubmission,
  StaffRoomSubmissionTargets,
  WriteStaffRoomSubmissionInput,
} from '@domain/entities/StaffRoomSubmission';

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

interface StaffRoomSubmissionState {
  /** 지금 보고 있는 공간의 제출 과제 (익명 — 주체 명단은 안 들어 있다) */
  submissions: StaffRoomSubmission[];

  /**
   * 내가 주체인 제출 과제 — 개인 할 일 화면에 겹쳐 보여줄 때 쓴다.
   * 서버가 **미완료 전부 + 최근 14일 완료분**만 실어 준다.
   */
  mySubmissions: StaffRoomMySubmission[];
  /** 상한에 닿아 잘렸는가 — 조용히 잘리면 "분명히 걸었는데 없다"가 된다 */
  mySubmissionsTruncated: boolean;

  /** 지금 열어 본 과제의 주체 명단 (만든이·관리자만 받는다) */
  targets: StaffRoomSubmissionTargets | null;

  isLoading: boolean;
  error: string | null;
  /** 저장할 때 부서 밖 사람이 몇 명 빠졌는가 — 화면이 한 번 알리고 지운다 */
  droppedTargets: number;

  loadSubmissions: (departmentId: string, moduleId: string) => Promise<void>;
  /** `useStaffRoomPlanStore.loadMyPlan` 이 넘겨준다 — 여기서 서버를 부르지 않는다 */
  receiveMine: (submissions: StaffRoomMySubmission[], truncated: boolean) => void;

  saveSubmission: (
    departmentId: string,
    moduleId: string,
    input: WriteStaffRoomSubmissionInput,
    submissionId?: string,
  ) => Promise<boolean>;
  removeSubmission: (departmentId: string, submissionId: string) => Promise<boolean>;

  /**
   * "냈음" 표시를 켜고 끈다.
   *
   * `targetEmail` 을 안 주면 내 칸이다. 서버 응답으로 **두 목록을 함께 갈아끼운다**
   * — 개인 화면에서 눌렀는데 교무실 숫자가 안 바뀌면 안 되기 때문이다.
   */
  toggleDone: (
    departmentId: string,
    submissionId: string,
    done: boolean,
    targetEmail?: string,
  ) => Promise<boolean>;

  loadTargets: (departmentId: string, submissionId: string) => Promise<void>;
  clearTargets: () => void;
  clearDropped: () => void;
}

export const useStaffRoomSubmissionStore = create<StaffRoomSubmissionState>((set, get) => ({
  submissions: [],
  mySubmissions: [],
  mySubmissionsTruncated: false,
  targets: null,
  isLoading: false,
  error: null,
  droppedTargets: 0,

  loadSubmissions: async (departmentId, moduleId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false, error: '구글 계정 연결이 필요합니다.' });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const submissions = await staffRoomPort.listSubmissions(token, departmentId, moduleId);
      set({ submissions, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  receiveMine: (submissions, truncated) => {
    set({ mySubmissions: [...submissions], mySubmissionsTruncated: truncated });
  },

  saveSubmission: async (departmentId, moduleId, input, submissionId) => {
    set({ error: null, droppedTargets: 0 });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      const result = submissionId
        ? await staffRoomPort.updateSubmission(token, departmentId, submissionId, input)
        : await staffRoomPort.addSubmission(token, departmentId, moduleId, input);

      const saved = result.submission;
      const existing = get().submissions;
      set({
        submissions: existing.some((s) => s.id === saved.id)
          ? existing.map((s) => (s.id === saved.id ? saved : s))
          : [saved, ...existing],
        droppedTargets: result.droppedTargets,
      });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  removeSubmission: async (departmentId, submissionId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteSubmission(token, departmentId, submissionId);
      set({
        submissions: get().submissions.filter((s) => s.id !== submissionId),
        mySubmissions: get().mySubmissions.filter((s) => s.id !== submissionId),
      });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  toggleDone: async (departmentId, submissionId, done, targetEmail) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      const updated = await staffRoomPort.toggleSubmissionDone(
        token,
        departmentId,
        submissionId,
        done,
        targetEmail,
      );

      // ★ 두 목록을 함께 갈아끼운다. 개인 화면에서 눌렀는데 교무실 진행률이
      //   안 바뀌면 "저장이 안 됐나" 하고 두 번 누르게 된다.
      set({
        submissions: get().submissions.map((s) => (s.id === submissionId ? updated : s)),
        mySubmissions: get().mySubmissions.map((s) =>
          s.id === submissionId ? { ...s, ...updated } : s,
        ),
      });

      // 명단을 열어 둔 채 눌렀다면 그것도 다시 받아 온다
      if (get().targets !== null) {
        void get().loadTargets(departmentId, submissionId);
      }
      return true;
    } catch (err) {
      // 남의 칸을 건드리려 하면 서버가 한국어로 거절한다
      set({ error: messageOf(err) });
      return false;
    }
  },

  loadTargets: async (departmentId, submissionId) => {
    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');
      const targets = await staffRoomPort.listSubmissionTargets(token, departmentId, submissionId);
      set({ targets });
    } catch (err) {
      set({ error: messageOf(err), targets: null });
    }
  },

  clearTargets: () => set({ targets: null }),
  clearDropped: () => set({ droppedTargets: 0 }),
}));
