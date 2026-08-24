import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import type {
  LessonDayAdjustment,
  ProgressEntry,
  ProgressStatus,
} from '@domain/entities/CurriculumProgress';
import { ManageCurriculumProgress } from '@usecases/classManagement/ManageCurriculumProgress';
import { teachingClassRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { todayISO } from '@mobile/utils/date';

const manageProgress = new ManageCurriculumProgress(teachingClassRepository);

interface MobileProgressState {
  entries: readonly ProgressEntry[];
  /** 수업일 추정에 대한 사용자 정정 — PC와 같은 파일(진도)의 형제 필드다. */
  lessonDayAdjustments: readonly LessonDayAdjustment[];
  /** 그날 수업 여부를 직접 정한다. kind가 null이면 정정을 지우고 앱 판정으로 되돌린다. */
  setLessonDayAdjustment: (
    classId: string,
    date: string,
    kind: LessonDayAdjustment['kind'] | null,
  ) => Promise<void>;
  loaded: boolean;
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 진도 탭(`ClassProgressTab`)이
   * `if (!loaded) return <Spinner/>` 가드를 가지고 있어, 앱 복귀(visibilitychange)로
   * 동기화가 도는 순간 **입력 중이던 진도 기록 모달이 통째로 언마운트**되고 타이핑이 사라진다.
   * 데스크톱은 2026-07-07에 같은 이유로 `load(true)` 방식으로 옮겼다.
   */
  reload: () => Promise<void>;
  getEntriesByClass: (classId: string) => readonly ProgressEntry[];
  getTodayEntries: (classId: string) => readonly ProgressEntry[];
  /**
   * 진도 항목 추가.
   * @param status 신규 항목 상태 (default: 'completed' — 기존 호출처 회귀 0).
   *               진도 서브탭에서 미래 일정을 추가할 때는 'planned' 가능.
   */
  addEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
    status?: ProgressStatus,
  ) => Promise<void>;
  /** 상태만 변경 (사이클 핸들러용 — 기존 유지) */
  updateEntryStatus: (entry: ProgressEntry, newStatus: ProgressStatus) => Promise<void>;
  /** 전체 필드 편집 (Bottom-Sheet 편집 모드 저장 핸들러용) */
  updateEntry: (entry: ProgressEntry) => Promise<void>;
  /** 항목 삭제 (액션시트 → 확인 → 삭제 핸들러용) */
  deleteEntry: (id: string) => Promise<void>;
}

export const useMobileProgressStore = create<MobileProgressState>((set, get) => ({
  entries: [],
  lessonDayAdjustments: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const [entries, lessonDayAdjustments] = await Promise.all([
        manageProgress.getAll(),
        manageProgress.getAdjustments(),
      ]);
      set({ entries, lessonDayAdjustments, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },

  getEntriesByClass: (classId) => {
    return get()
      .entries.filter((e) => e.classId === classId)
      .sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
  },

  getTodayEntries: (classId) => {
    const today = todayISO();
    return get()
      .entries.filter((e) => e.classId === classId && e.date === today)
      .sort((a, b) => a.period - b.period);
  },

  setLessonDayAdjustment: async (classId, date, kind) => {
    const next = await manageProgress.saveAdjustment(classId, date, kind, new Date().toISOString());
    set({ lessonDayAdjustments: next });
  },

  addEntry: async (classId, date, period, unit, lesson, note, status = 'completed') => {
    const entry: ProgressEntry = {
      id: generateUUID(),
      classId,
      date,
      period,
      unit,
      lesson,
      status,
      note: note ?? '',
    };
    await manageProgress.add(entry);
    set((s) => ({ entries: [...s.entries, entry] }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  updateEntryStatus: async (entry, newStatus) => {
    const updated = { ...entry, status: newStatus };
    await manageProgress.update(updated);
    set((s) => ({
      entries: s.entries.map((e) => (e.id === entry.id ? updated : e)),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  updateEntry: async (entry) => {
    await manageProgress.update(entry);
    set((s) => ({
      entries: s.entries.map((e) => (e.id === entry.id ? entry : e)),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteEntry: async (id) => {
    await manageProgress.delete(id);
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
