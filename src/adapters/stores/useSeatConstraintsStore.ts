import { create } from 'zustand';
import type {
  SeatConstraints,
  ZoneConstraint,
  FixedSeatConstraint,
  SeparationConstraint,
  AdjacencyConstraint,
} from '@domain/entities/SeatConstraints';
import { EMPTY_SEAT_CONSTRAINTS } from '@domain/entities/SeatConstraints';
import { seatConstraintsRepository } from '@adapters/di/container';
import { ManageSeatConstraints } from '@usecases/seating/ManageSeatConstraints';

interface SeatConstraintsState {
  constraints: SeatConstraints;
  loaded: boolean;
  load: () => Promise<void>;
  save: (data: SeatConstraints) => Promise<void>;
  addZone: (zone: ZoneConstraint) => Promise<void>;
  removeZone: (studentId: string) => Promise<void>;
  addFixedSeat: (fixed: FixedSeatConstraint) => Promise<void>;
  removeFixedSeat: (studentId: string) => Promise<void>;
  addSeparation: (sep: SeparationConstraint) => Promise<void>;
  removeSeparation: (studentA: string, studentB: string) => Promise<void>;
  addAdjacency: (adj: AdjacencyConstraint) => Promise<void>;
  removeAdjacency: (studentA: string, studentB: string) => Promise<void>;
  sanitize: (activeStudentIds: Set<string>) => Promise<void>;

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * zones / fixedSeats / separations / adjacencies 네 종류의 제약에서
   * 주어진 학생 ID가 한 번이라도 참조되는지 학생 단위로 unique 카운트.
   */
  hasStudentReferences: (studentIds: readonly string[]) => number;
}

export const useSeatConstraintsStore = create<SeatConstraintsState>((set, get) => {
  const uc = new ManageSeatConstraints(seatConstraintsRepository);

  const persist = async (next: SeatConstraints) => {
    await uc.saveConstraints(next);
    set({ constraints: next });
  };

  return {
    constraints: EMPTY_SEAT_CONSTRAINTS,
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await uc.getConstraints();
        set({ constraints: data, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    save: async (data) => {
      await persist(data);
    },

    addZone: async (zone) => {
      const { constraints } = get();
      // 기존 같은 학생 영역 제거 후 추가
      const zones = [...constraints.zones.filter((z) => z.studentId !== zone.studentId), zone];
      await persist({ ...constraints, zones });
    },

    removeZone: async (studentId) => {
      const { constraints } = get();
      const zones = constraints.zones.filter((z) => z.studentId !== studentId);
      await persist({ ...constraints, zones });
    },

    addFixedSeat: async (fixed) => {
      const { constraints } = get();
      // 기존 같은 학생 고정좌석 제거, 같은 위치 고정좌석 제거 후 추가
      const fixedSeats = [
        ...constraints.fixedSeats.filter(
          (f) => f.studentId !== fixed.studentId && !(f.row === fixed.row && f.col === fixed.col),
        ),
        fixed,
      ];
      await persist({ ...constraints, fixedSeats });
    },

    removeFixedSeat: async (studentId) => {
      const { constraints } = get();
      const fixedSeats = constraints.fixedSeats.filter((f) => f.studentId !== studentId);
      await persist({ ...constraints, fixedSeats });
    },

    addSeparation: async (sep) => {
      const { constraints } = get();
      // 같은 쌍 중복 방지 (순서 무관)
      const separations = [
        ...constraints.separations.filter(
          (s) =>
            !(
              (s.studentA === sep.studentA && s.studentB === sep.studentB) ||
              (s.studentA === sep.studentB && s.studentB === sep.studentA)
            ),
        ),
        sep,
      ];
      await persist({ ...constraints, separations });
    },

    removeSeparation: async (studentA, studentB) => {
      const { constraints } = get();
      const separations = constraints.separations.filter(
        (s) =>
          !(
            (s.studentA === studentA && s.studentB === studentB) ||
            (s.studentA === studentB && s.studentB === studentA)
          ),
      );
      await persist({ ...constraints, separations });
    },

    addAdjacency: async (adj) => {
      const { constraints } = get();
      const adjacencies = [
        ...constraints.adjacencies.filter(
          (a) =>
            !(
              (a.studentA === adj.studentA && a.studentB === adj.studentB) ||
              (a.studentA === adj.studentB && a.studentB === adj.studentA)
            ),
        ),
        adj,
      ];
      await persist({ ...constraints, adjacencies });
    },

    removeAdjacency: async (studentA, studentB) => {
      const { constraints } = get();
      const adjacencies = constraints.adjacencies.filter(
        (a) =>
          !(
            (a.studentA === studentA && a.studentB === studentB) ||
            (a.studentA === studentB && a.studentB === studentA)
          ),
      );
      await persist({ ...constraints, adjacencies });
    },

    /**
     * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
     *
     * 4종 제약 타입에서 학생 ID 매칭을 unique set으로 모은다.
     * 같은 학생이 zone+fixedSeat에 동시에 있어도 1로만 센다.
     */
    hasStudentReferences: (studentIds) => {
      if (studentIds.length === 0) return 0;
      const targetSet = new Set(studentIds);
      const matched = new Set<string>();
      const { constraints } = get();

      for (const z of constraints.zones) {
        if (targetSet.has(z.studentId)) matched.add(z.studentId);
      }
      for (const f of constraints.fixedSeats) {
        if (targetSet.has(f.studentId)) matched.add(f.studentId);
      }
      for (const s of constraints.separations) {
        if (targetSet.has(s.studentA)) matched.add(s.studentA);
        if (targetSet.has(s.studentB)) matched.add(s.studentB);
      }
      for (const a of constraints.adjacencies) {
        if (targetSet.has(a.studentA)) matched.add(a.studentA);
        if (targetSet.has(a.studentB)) matched.add(a.studentB);
      }
      return matched.size;
    },

    sanitize: async (activeStudentIds) => {
      const { constraints } = get();
      const zones = constraints.zones.filter((z) => activeStudentIds.has(z.studentId));
      const fixedSeats = constraints.fixedSeats.filter((f) => activeStudentIds.has(f.studentId));
      const separations = constraints.separations.filter(
        (s) => activeStudentIds.has(s.studentA) && activeStudentIds.has(s.studentB),
      );
      const adjacencies = constraints.adjacencies.filter(
        (a) => activeStudentIds.has(a.studentA) && activeStudentIds.has(a.studentB),
      );

      const cleaned: SeatConstraints = { zones, fixedSeats, separations, adjacencies };

      // 변경이 있을 때만 저장
      if (
        zones.length !== constraints.zones.length ||
        fixedSeats.length !== constraints.fixedSeats.length ||
        separations.length !== constraints.separations.length ||
        adjacencies.length !== constraints.adjacencies.length
      ) {
        await persist(cleaned);
      }
    },
  };
});
