import { create } from 'zustand';
import type {
  ClassScheduleData,
  TeacherScheduleData,
  TimetableOverride,
} from '@domain/entities/Timetable';
import { createEmptyTeacherSchedule } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@mobile/di/container';

interface MobileScheduleState {
  teacherSchedule: TeacherScheduleData;
  /** 우리 반(학급) 시간표 — 담임이 아니거나 미설정이면 null. 홈 주간 시간표 슬라이드에서 사용. */
  classSchedule: ClassScheduleData | null;
  /**
   * 변동 시간표(결·보강·자습).
   *
   * 이걸 안 읽으면 **같은 반 차시가 PC와 모바일에서 다르게 나온다** — PC는 변동을 반영해
   * 세고 모바일은 기본 시간표로만 세기 때문이다. 그 어긋남은 알아채기 어렵고, 알아채면
   * 숫자 전체를 못 믿게 된다. `timetable-overrides`는 동기화 대상 파일이라 모바일에도 온다.
   */
  overrides: readonly TimetableOverride[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileScheduleStore = create<MobileScheduleState>((set, get) => ({
  teacherSchedule: createEmptyTeacherSchedule(7),
  classSchedule: null,
  overrides: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      // 교사·학급 시간표를 함께 로드 (홈 주간 시간표 스와이프에서 둘 다 필요)
      const [teacher, cls, overridesData] = await Promise.all([
        scheduleRepository.getTeacherSchedule(),
        scheduleRepository.getClassSchedule(),
        scheduleRepository.getTimetableOverrides(),
      ]);
      set({
        ...(teacher ? { teacherSchedule: teacher } : {}),
        classSchedule: cls ?? null,
        overrides: overridesData?.overrides ?? [],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
}));
