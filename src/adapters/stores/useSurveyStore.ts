import { create } from 'zustand';
import type {
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveysData,
} from '@domain/entities/Survey';
import { surveyRepository } from '@adapters/di/container';

const SHARE_BASE_URL = 'https://ssampin.vercel.app/check';

interface SurveyState {
  surveys: readonly Survey[];
  localData: readonly SurveyLocalData[];
  loaded: boolean;

  load: () => Promise<void>;
  createSurvey: (params: Omit<Survey, 'id' | 'createdAt'>) => Promise<Survey>;
  updateSurvey: (survey: Survey) => Promise<void>;
  deleteSurvey: (id: string) => Promise<void>;
  archiveSurvey: (id: string) => Promise<void>;
  setLocalEntry: (
    surveyId: string,
    studentId: string,
    questionId: string,
    value: string | boolean,
  ) => Promise<void>;
  getLocalData: (surveyId: string) => SurveyLocalData | undefined;
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  surveys: [],
  localData: [],
  loaded: false,

  load: async () => {
    const data = await surveyRepository.load();
    if (data) {
      set({ surveys: data.surveys, localData: data.localData, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  createSurvey: async (params) => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const survey: Survey = {
      ...params,
      id,
      createdAt,
      shareUrl: params.mode === 'student' ? `${SHARE_BASE_URL}/${id}` : undefined,
      adminKey: params.mode === 'student' ? crypto.randomUUID().slice(0, 8) : undefined,
    };

    const { surveys, localData } = get();
    const next: SurveysData = {
      surveys: [survey, ...surveys],
      localData,
    };
    await surveyRepository.save(next);
    set({ surveys: next.surveys });
    return survey;
  },

  updateSurvey: async (survey) => {
    const { surveys, localData } = get();
    const next: SurveysData = {
      surveys: surveys.map((s) => (s.id === survey.id ? survey : s)),
      localData,
    };
    await surveyRepository.save(next);
    set({ surveys: next.surveys });
  },

  deleteSurvey: async (id) => {
    const { surveys, localData } = get();
    const next: SurveysData = {
      surveys: surveys.filter((s) => s.id !== id),
      localData: localData.filter((d) => d.surveyId !== id),
    };
    await surveyRepository.save(next);
    set({ surveys: next.surveys, localData: next.localData });
  },

  archiveSurvey: async (id) => {
    const { surveys, localData } = get();
    const next: SurveysData = {
      surveys: surveys.map((s) =>
        s.id === id ? { ...s, isArchived: true } : s,
      ),
      localData,
    };
    await surveyRepository.save(next);
    set({ surveys: next.surveys });
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
          d.surveyId === surveyId
            ? { ...d, entries: updatedEntries }
            : d,
        )
      : [...localData, { surveyId, entries: updatedEntries }];

    const next: SurveysData = { surveys, localData: updatedLocalData };
    await surveyRepository.save(next);
    set({ localData: updatedLocalData });
  },

  getLocalData: (surveyId) => {
    return get().localData.find((d) => d.surveyId === surveyId);
  },
}));
