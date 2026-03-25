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

  load: () => Promise<void>;
  reload: () => Promise<void>;
  fetchSubmissions: (assignmentId: string, adminKey: string) => Promise<void>;
}

export const useMobileAssignmentStore = create<MobileAssignmentState>((set, get) => ({
  assignments: [],
  loaded: false,
  submissionStatus: {},
  submissions: {},

  load: async () => {
    if (get().loaded) return;
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
    set({ loaded: false });
    await get().load();
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
