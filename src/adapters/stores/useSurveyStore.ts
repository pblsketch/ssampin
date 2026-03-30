import { create } from 'zustand';
import type {
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveysData,
} from '@domain/entities/Survey';
import { surveyRepository, shortLinkClient } from '@adapters/di/container';
import { SITE_URL } from '@config/siteUrl';
import { generateUUID } from '@infrastructure/utils/uuid';

const SHARE_BASE_URL = `${SITE_URL}/check`;

interface SurveyState {
  surveys: readonly Survey[];
  localData: readonly SurveyLocalData[];
  loaded: boolean;

  load: () => Promise<void>;
  createSurvey: (params: Omit<Survey, 'id' | 'createdAt'> & { customLinkCode?: string }) => Promise<Survey>;
  updateSurvey: (survey: Survey) => Promise<void>;
  deleteSurvey: (id: string) => Promise<void>;
  archiveSurvey: (id: string) => Promise<void>;
  setLocalEntry: (
    surveyId: string,
    studentId: string,
    questionId: string,
    value: string | boolean,
  ) => Promise<void>;
  setStudentMemo: (
    surveyId: string,
    studentId: string,
    memo: string,
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
    const { customLinkCode, ...surveyParams } = params;
    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const shareUrl = surveyParams.mode === 'student' ? `${SHARE_BASE_URL}/${id}` : undefined;

    // 학생 모드일 때 숏링크 생성
    let shortUrl: string | undefined;
    if (shareUrl) {
      try {
        const expiresAt = surveyParams.dueDate
          ? new Date(new Date(surveyParams.dueDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
          : undefined; // 기한 없으면 기본 90일
        const result = await shortLinkClient.createShortLink(shareUrl, customLinkCode, expiresAt);
        if (result !== shareUrl) shortUrl = result;
      } catch {
        // 숏링크 생성 실패는 무시
      }
    }

    const survey: Survey = {
      ...surveyParams,
      id,
      createdAt,
      shareUrl,
      shortUrl,
      adminKey: params.mode === 'student' ? generateUUID().slice(0, 8) : undefined,
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

  setStudentMemo: async (surveyId, studentId, memo) => {
    const { surveys, localData } = get();
    const existing = localData.find((d) => d.surveyId === surveyId);

    const updatedMemos = {
      ...(existing?.studentMemos ?? {}),
      [studentId]: memo,
    };
    // 빈 메모는 제거
    if (!memo) delete updatedMemos[studentId];

    const updatedLocalData: readonly SurveyLocalData[] = existing
      ? localData.map((d) =>
          d.surveyId === surveyId
            ? { ...d, studentMemos: updatedMemos }
            : d,
        )
      : [...localData, { surveyId, entries: [], studentMemos: updatedMemos }];

    const next: SurveysData = { surveys, localData: updatedLocalData };
    await surveyRepository.save(next);
    set({ localData: updatedLocalData });
  },

  getLocalData: (surveyId) => {
    return get().localData.find((d) => d.surveyId === surveyId);
  },
}));
