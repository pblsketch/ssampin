import { create } from 'zustand';
import type {
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveysData,
} from '@domain/entities/Survey';
import { surveyRepository, shortLinkClient, surveySupabaseClient } from '@adapters/di/container';
import { SITE_URL } from '@config/siteUrl';
import { generateUUID } from '@infrastructure/utils/uuid';
import { generateStudentPins } from '@domain/rules/surveyRules';
import { hashPin } from '@infrastructure/crypto/pinHash';

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
  duplicateSurvey: (surveyId: string, newClassId: string, newTargetCount: number) => Promise<Survey>;
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

  duplicateSurvey: async (surveyId, newClassId, newTargetCount) => {
    const { surveys } = get();
    const source = surveys.find((s) => s.id === surveyId);
    if (!source) throw new Error('설문을 찾을 수 없습니다');

    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const shareUrl = source.mode === 'student' ? `${SHARE_BASE_URL}/${id}` : undefined;

    // 숏링크 신규 발급 (실패해도 무시)
    let shortUrl: string | undefined;
    if (shareUrl) {
      try {
        const expiresAt = source.dueDate
          ? new Date(new Date(source.dueDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;
        const result = await shortLinkClient.createShortLink(shareUrl, undefined, expiresAt);
        if (result !== shareUrl) shortUrl = result;
      } catch {
        // 실패는 무시
      }
    }

    // 학생 PIN 재생성 (대상반 학생 수 기준)
    const studentPins =
      source.mode === 'student' && source.pinProtection
        ? generateStudentPins(newTargetCount)
        : undefined;

    const duplicated: Survey = {
      id,
      createdAt,
      title: source.title,
      description: source.description,
      questions: source.questions,
      mode: source.mode,
      categoryColor: source.categoryColor,
      dueDate: source.dueDate,
      classId: newClassId,
      targetCount: newTargetCount,
      pinProtection: source.mode === 'student' ? source.pinProtection : undefined,
      studentPins,
      shareUrl,
      shortUrl,
      adminKey: source.mode === 'student' ? generateUUID().slice(0, 8) : undefined,
      isArchived: false,
    };

    // 학생 응답 모드 → Supabase에 신규 등록 (공유 링크 동작)
    if (duplicated.mode === 'student' && duplicated.adminKey) {
      let studentPinHashes: Record<string, string> | undefined;
      if (duplicated.pinProtection && duplicated.studentPins) {
        const entries = await Promise.all(
          Object.entries(duplicated.studentPins).map(
            async ([num, pin]) => [num, await hashPin(pin)] as const,
          ),
        );
        studentPinHashes = Object.fromEntries(entries);
      }
      await surveySupabaseClient.createSurvey({
        id: duplicated.id,
        title: duplicated.title,
        description: duplicated.description,
        mode: 'student',
        questions: duplicated.questions,
        dueDate: duplicated.dueDate,
        adminKey: duplicated.adminKey,
        targetCount: duplicated.targetCount ?? newTargetCount,
        pinProtection: duplicated.pinProtection,
        studentPinHashes,
      });
    }

    // 로컬 저장 (응답 데이터는 복사하지 않음)
    const { surveys: currentSurveys, localData: currentLocalData } = get();
    const next: SurveysData = {
      surveys: [duplicated, ...currentSurveys],
      localData: currentLocalData,
    };
    await surveyRepository.save(next);
    set({ surveys: next.surveys });
    return duplicated;
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
