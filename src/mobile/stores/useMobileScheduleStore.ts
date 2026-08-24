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
}

export const useMobileScheduleStore = create<MobileScheduleState>((set, get) => ({
  teacherSchedule: createEmptyTeacherSchedule(7),
  classSchedule: null,
  overrides: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
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
    await get().load(true);
  },
}));
