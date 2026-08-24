import { create } from 'zustand';
import type {
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveysData,
} from '@domain/entities/Survey';
import type { SurveyResponsePublic } from '@infrastructure/supabase/SurveySupabaseClient';
import { storage, surveySupabaseClient } from '@mobile/di/container';

interface SurveyResponseStatus {
  total: number;
  responded: number;
  loading: boolean;
  /** Supabase 호출 실패 메시지 — 표시되면 사용자가 신고 시 즉시 RC 판별 가능 */
  error?: string;
}

interface MobileSurveyToolState {
  surveys: readonly Survey[];
  localData: readonly SurveyLocalData[];
  loaded: boolean;
  /** surveyId → response status (student mode) */
  responseStatus: Record<string, SurveyResponseStatus>;
  /** surveyId → responses detail */
  responses: Record<string, readonly SurveyResponsePublic[]>;

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
  fetchResponses: (surveyId: string, targetCount: number) => Promise<void>;
  /** 교사 모드: 학생 체크 항목 저장 */
  setLocalEntry: (
    surveyId: string,
    studentId: string,
    questionId: string,
    value: string | boolean,
  ) => Promise<void>;
}

export const useMobileSurveyToolStore = create<MobileSurveyToolState>((set, get) => ({
  surveys: [],
  localData: [],
  loaded: false,
  responseStatus: {},
  responses: {},

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await storage.read<{
        surveys: readonly Survey[];
        localData: readonly SurveyLocalData[];
      }>('surveys');
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
    await get().load(true);
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
      ? localData.map((d) => (d.surveyId === surveyId ? { ...d, entries: updatedEntries } : d))
      : [...localData, { surveyId, entries: updatedEntries }];

    const next: SurveysData = { surveys, localData: updatedLocalData };
    await storage.write('surveys', next);
    set({ localData: updatedLocalData });

    // Drive 동기화 트리거
    try {
      const { useMobileDriveSyncStore } = await import('@mobile/stores/useMobileDriveSyncStore');
      useMobileDriveSyncStore.getState().triggerSaveSync();
    } catch {
      /* sync 실패 무시 */
    }
  },

  fetchResponses: async (surveyId, targetCount) => {
    set((s) => ({
      responseStatus: {
        ...s.responseStatus,
        [surveyId]: {
          total: targetCount,
          responded: s.responseStatus[surveyId]?.responded ?? 0,
          loading: true,
          error: undefined,
        },
      },
    }));

    try {
      // 응답 조회는 해당 설문의 adminKey 를 함께 보내야 한다(마이그레이션 046).
      // 예전에는 survey_responses 를 직접 조회해 필터만 빼면 전 행이 나왔다.
      const adminKey = get().surveys.find((s) => s.id === surveyId)?.adminKey;
      if (!adminKey) {
        throw new Error('이 설문의 관리 키를 찾지 못했습니다. 설문을 만든 기기에서 확인해 주세요.');
      }
      const responses = await surveySupabaseClient.getResponses(surveyId, adminKey);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : '응답을 불러오지 못했습니다';
      set((s) => ({
        responseStatus: {
          ...s.responseStatus,
          [surveyId]: {
            ...s.responseStatus[surveyId]!,
            loading: false,
            error: msg,
          },
        },
      }));
    }
  },
}));
