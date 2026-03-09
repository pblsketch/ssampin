import { create } from 'zustand';
import type { Assignment } from '@domain/entities/Assignment';
import type { CreateAssignmentParams } from '@usecases/assignment/CreateAssignment';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import type { SubmissionDetail } from '@usecases/assignment/GetSubmissions';
import {
  assignmentServicePort,
  assignmentSupabaseClient,
  createAssignmentUseCases,
  authenticateGoogle,
} from '@adapters/di/container';

interface AssignmentState {
  // 상태
  assignments: AssignmentWithStatus[];
  currentAssignment: AssignmentWithStatus | null;
  submissions: SubmissionDetail[];
  isLoading: boolean;
  error: string | null;
  selectedAssignmentId: string | null;

  // Google Drive 관련
  driveConnected: boolean;
  needsGoogleConnect: boolean;

  // 과제 목록
  loadAssignments: () => Promise<void>;

  // 과제 생성
  createAssignment: (params: CreateAssignmentParams) => Promise<Assignment>;

  // 과제 상세 + 제출 현황 로드
  loadAssignmentDetail: (assignmentId: string) => Promise<void>;

  // 선택된 과제 ID
  selectAssignment: (id: string) => void;

  // 과제 삭제
  deleteAssignment: (assignmentId: string) => Promise<void>;

  // 미제출자 목록 텍스트 생성
  getMissingListText: (assignmentId: string) => Promise<string>;

  // 제출 현황 폴링 (30초 간격)
  startSubmissionPolling: (assignmentId: string) => () => void;

  // Google Drive 연결
  connectDrive: () => Promise<void>;

  // Google 재연결 상태 초기화
  clearGoogleConnectState: () => void;
}

export const useAssignmentStore = create<AssignmentState>((set, get) => {
  // 토큰 getter (기존 Google OAuth 인증 재사용)
  const getAccessToken = () => authenticateGoogle.getValidAccessToken();

  return {
    assignments: [],
    currentAssignment: null,
    submissions: [],
    isLoading: false,
    error: null,
    selectedAssignmentId: null,
    driveConnected: false,
    needsGoogleConnect: false,

    selectAssignment: (id: string) => {
      set({ selectedAssignmentId: id });
    },

    loadAssignments: async () => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        const assignments = await useCases.getAssignments.execute();
        set({ assignments, isLoading: false });
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
      }
    },

    createAssignment: async (params) => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);

        // OAuth 토큰을 Supabase에 저장 (최초 1회 or 갱신)
        const accessToken = await authenticateGoogle.getValidAccessToken();
        const email = await authenticateGoogle.getEmail();
        if (email) {
          try {
            await assignmentServicePort.saveTeacherToken({
              accessToken,
              refreshToken: '', // refresh token은 getValidAccessToken 내부에서 관리
              expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            });
          } catch {
            // 토큰 저장 실패는 무시 (이미 저장되어 있을 수 있음)
          }
        }

        const assignment = await useCases.createAssignment.execute(params);
        // 목록 새로고침
        await get().loadAssignments();
        set({ isLoading: false });
        return assignment;
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
        throw err;
      }
    },

    loadAssignmentDetail: async (assignmentId) => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        const submissions = await useCases.getSubmissions.execute(assignmentId);

        // 현재 과제 찾기
        const { assignments } = get();
        const current = assignments.find((a) => a.id === assignmentId) ?? null;

        set({
          currentAssignment: current,
          submissions,
          isLoading: false,
        });
      } catch (err) {
        const message = (err as Error).message;
        const isGoogleError = message.includes('Google 계정') || message.includes('Drive API');
        set({
          error: message,
          isLoading: false,
          needsGoogleConnect: isGoogleError,
        });
      }
    },

    deleteAssignment: async (assignmentId) => {
      set({ isLoading: true, error: null });
      try {
        const useCases = createAssignmentUseCases(getAccessToken);
        await useCases.deleteAssignment.execute(assignmentId);
        // 목록 새로고침
        await get().loadAssignments();
        set({ currentAssignment: null, submissions: [], isLoading: false });
      } catch (err) {
        set({
          error: (err as Error).message,
          isLoading: false,
        });
      }
    },

    getMissingListText: async (assignmentId) => {
      const useCases = createAssignmentUseCases(getAccessToken);
      return useCases.copyMissingList.execute(assignmentId);
    },

    startSubmissionPolling: (assignmentId) => {
      const adminKey = (() => {
        const data = get().assignments.find((a) => a.id === assignmentId);
        return data?.adminKey ?? '';
      })();

      const stopPolling = assignmentSupabaseClient.startPolling(
        assignmentId,
        adminKey,
        async (submissions) => {
          // 제출 현황 업데이트 시 submissions detail 재로드
          try {
            const useCases = createAssignmentUseCases(getAccessToken);
            const details = await useCases.getSubmissions.execute(assignmentId);
            set({ submissions: details });

            // assignments 목록도 업데이트
            const { assignments } = get();
            set({
              assignments: assignments.map((a) =>
                a.id === assignmentId
                  ? {
                      ...a,
                      submissions,
                      submittedCount: submissions.length,
                    }
                  : a,
              ),
            });
          } catch {
            // 폴링 에러는 무시
          }
        },
        30_000,
      );

      return stopPolling;
    },

    connectDrive: async () => {
      try {
        await authenticateGoogle.getValidAccessToken();
        set({ driveConnected: true });
      } catch {
        set({ driveConnected: false });
        throw new Error('Google Drive 연결에 실패했습니다');
      }
    },

    clearGoogleConnectState: () => {
      set({ needsGoogleConnect: false, error: null });
    },
  };
});

