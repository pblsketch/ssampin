import { create } from 'zustand';
import type { Survey, SurveyLocalData, SurveyLocalEntry, SurveysData } from '@domain/entities/Survey';
import type { SurveyResponsePublic } from '@infrastructure/supabase/SurveySupabaseClient';
import { storage, surveySupabaseClient } from '@mobile/di/container';

interface SurveyResponseStatus {
  total: number;
  responded: number;
  loading: boolean;
}

interface MobileSurveyToolState {
  surveys: readonly Survey[];
  localData: readonly SurveyLocalData[];
  loaded: boolean;
  /** surveyId → response status (student mode) */
  responseStatus: Record<string, SurveyResponseStatus>;
  /** surveyId → responses detail */
  responses: Record<string, readonly SurveyResponsePublic[]>;

  load: () => Promise<void>;
  reload: () => Promise<void>;
  fetchResponses: (surveyId: string, targetCount: number) => Promise<void>;
  /** 교사 모드: 학생 체크 항목 저장 */
  setLocalEntry: (surveyId: string, studentId: string, questionId: string, value: string | boolean) => Promise<void>;
}

export const useMobileSurveyToolStore = create<MobileSurveyToolState>((set, get) => ({
  surveys: [],
  localData: [],
  loaded: false,
  responseStatus: {},
  responses: {},

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await storage.read<{ surveys: readonly Survey[]; localData: readonly SurveyLocalData[] }>('surveys');
      if (data) {
        set({
          surveys: data.surveys ?? [],
          localData: data.localData ?? [],
          loaded: true,
        });
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

  setLocalEntry: async (surveyId, studentId, questionId, value) => {
    const { surveys, localData } = get();
    const existing = localData.find((d) => d.surveyId === surveyId);
    const entry: SurveyLocalEntry = {
      studentId,
      questionId,
      value,
      updatedAt: new Date().toISOString(),
    };

    let updatedEntries: readonly SurveyLocalEntry[];
    if (existing) {
      updatedEntries = [
        ...existing.entries.filter(
          (e) => !(e.studentId === studentId && e.questionId === questionId),
        ),
        entry,
      ];
    } else {
      updatedEntries = [entry];
    }

    const updatedLocalData: readonly SurveyLocalData[] = existing
      ? localData.map((d) =>
          d.surveyId === surveyId ? { ...d, entries: updatedEntries } : d,
        )
      : [...localData, { surveyId, entries: updatedEntries }];

    const next: SurveysData = { surveys, localData: updatedLocalData };
    await storage.write('surveys', next);
    set({ localData: updatedLocalData });

    // Drive 동기화 트리거
    try {
      const { useMobileDriveSyncStore } = await import('@mobile/stores/useMobileDriveSyncStore');
      useMobileDriveSyncStore.getState().triggerSaveSync();
    } catch { /* sync 실패 무시 */ }
  },

  fetchResponses: async (surveyId, targetCount) => {
    set((s) => ({
      responseStatus: {
        ...s.responseStatus,
        [surveyId]: {
          total: targetCount,
          responded: s.responseStatus[surveyId]?.responded ?? 0,
          loading: true,
        },
      },
    }));

    try {
      const responses = await surveySupabaseClient.getResponses(surveyId);
      set((s) => ({
        responses: { ...s.responses, [surveyId]: responses },
        responseStatus: {
          ...s.responseStatus,
          [surveyId]: {
            total: targetCount,
            responded: responses.length,
            loading: false,
          },
        },
      }));
    } catch {
      set((s) => ({
        responseStatus: {
          ...s.responseStatus,
          [surveyId]: {
            ...s.responseStatus[surveyId]!,
            loading: false,
          },
        },
      }));
    }
  },
}));
