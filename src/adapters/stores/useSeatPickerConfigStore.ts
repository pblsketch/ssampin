import { create } from 'zustand';
import type {
  SeatPickerConfig,
  SeatPickerScope,
  SeatPickerPrivateAssignment,
} from '@domain/entities/SeatPickerConfig';
import { EMPTY_SEAT_PICKER_CONFIG } from '@domain/entities/SeatPickerConfig';
import { seatPickerConfigRepository } from '@adapters/di/container';

interface SeatPickerConfigState {
  config: SeatPickerConfig;
  loaded: boolean;
  load: () => Promise<void>;
  /** 특정 scope의 private 사전 배정 목록 반환 */
  getPrivateAssignmentsForScope: (scope: SeatPickerScope) => SeatPickerPrivateAssignment[];
  /** scope + seatKey에 학생 지정 (같은 좌석 기존 값·같은 학생 다른 좌석 자동 제거) */
  setPrivateAssignment: (
    scope: SeatPickerScope,
    seatKey: string,
    studentId: string,
  ) => Promise<void>;
  /** scope + seatKey의 private 배정 제거 */
  removePrivateAssignment: (scope: SeatPickerScope, seatKey: string) => Promise<void>;
  /** scope의 private 배정 전체 초기화 */
  clearScope: (scope: SeatPickerScope) => Promise<void>;

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * 자리뽑기 private 사전 배정에서 주어진 학생 ID가 참조되는지 학생 단위 unique 카운트.
   * scope(학급/수업반) 구분 없이 전체에서 검사한다.
   */
  hasStudentReferences: (studentIds: readonly string[]) => number;
}

export const useSeatPickerConfigStore = create<SeatPickerConfigState>((set, get) => ({
  config: EMPTY_SEAT_PICKER_CONFIG,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await seatPickerConfigRepository.getConfig();
      set({ config: data, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  getPrivateAssignmentsForScope: (scope) => {
    return get().config.privateAssignments.filter((a) => a.scope === scope);
  },

  setPrivateAssignment: async (scope, seatKey, studentId) => {
    const { config } = get();
    // 같은 scope 내: 같은 좌석 또는 같은 학생의 기존 배정 제거 후 추가
    const filtered = config.privateAssignments.filter(
      (a) => !(a.scope === scope && (a.seatKey === seatKey || a.studentId === studentId)),
    );
    const next: SeatPickerConfig = {
      privateAssignments: [...filtered, { scope, seatKey, studentId }],
    };
    await seatPickerConfigRepository.saveConfig(next);
    set({ config: next });
  },

  removePrivateAssignment: async (scope, seatKey) => {
    const { config } = get();
    const next: SeatPickerConfig = {
      privateAssignments: config.privateAssignments.filter(
        (a) => !(a.scope === scope && a.seatKey === seatKey),
      ),
    };
    await seatPickerConfigRepository.saveConfig(next);
    set({ config: next });
  },

  clearScope: async (scope) => {
    const { config } = get();
    const next: SeatPickerConfig = {
      privateAssignments: config.privateAssignments.filter((a) => a.scope !== scope),
    };
    await seatPickerConfigRepository.saveConfig(next);
    set({ config: next });
  },

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * privateAssignments에 박힌 studentId 중 입력 집합에 속하는 것의
   * 학생 단위 unique 카운트.
   */
  hasStudentReferences: (studentIds) => {
    if (studentIds.length === 0) return 0;
    const targetSet = new Set(studentIds);
    const matched = new Set<string>();
    for (const a of get().config.privateAssignments) {
      if (targetSet.has(a.studentId)) {
        matched.add(a.studentId);
      }
    }
    return matched.size;
  },
}));
