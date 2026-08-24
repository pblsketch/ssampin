import { create } from 'zustand';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import { storage, assignmentSupabaseClient } from '@mobile/di/container';

interface AssignmentSubmissionStatus {
  total: number;
  submitted: number;
  loading: boolean;
}

interface MobileAssignmentState {
  assignments: readonly Assignment[];
  loaded: boolean;
  /** assignmentId → submission status */
  submissionStatus: Record<string, AssignmentSubmissionStatus>;
  /** assignmentId → submissions detail */
  submissions: Record<string, readonly Submission[]>;

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
  fetchSubmissions: (assignmentId: string, adminKey: string) => Promise<void>;
}

export const useMobileAssignmentStore = create<MobileAssignmentState>((set, get) => ({
  assignments: [],
  loaded: false,
  submissionStatus: {},
  submissions: {},

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await storage.read<{ assignments: readonly Assignment[] }>('assignments');
      if (data?.assignments) {
        set({ assignments: data.assignments, loaded: true });
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

  fetchSubmissions: async (assignmentId, adminKey) => {
    const assignment = get().assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;

    set((s) => ({
      submissionStatus: {
        ...s.submissionStatus,
        [assignmentId]: {
          total: assignment.target.students.length,
          submitted: s.submissionStatus[assignmentId]?.submitted ?? 0,
          loading: true,
        },
      },
    }));

    try {
      const subs = await assignmentSupabaseClient.getSubmissions(assignmentId, adminKey);
      set((s) => ({
        submissions: { ...s.submissions, [assignmentId]: subs },
        submissionStatus: {
          ...s.submissionStatus,
          [assignmentId]: {
            total: assignment.target.students.length,
            submitted: subs.length,
            loading: false,
          },
        },
      }));
    } catch {
      set((s) => ({
        submissionStatus: {
          ...s.submissionStatus,
          [assignmentId]: {
            ...s.submissionStatus[assignmentId]!,
            loading: false,
          },
        },
      }));
    }
  },
}));
