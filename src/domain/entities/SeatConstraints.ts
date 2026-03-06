export type ZoneId =
  | 'front1' | 'front2' | 'front3'
  | 'back1' | 'back2'
  | 'left1' | 'right1'
  | 'center';

export interface ZoneConstraint {
  readonly studentId: string;
  readonly zone: ZoneId;
  readonly reason: string;
}

export interface SeparationConstraint {
  readonly studentA: string;
  readonly studentB: string;
  readonly minDistance: number;
}

export interface AdjacencyConstraint {
  readonly studentA: string;
  readonly studentB: string;
  readonly maxDistance: number;
}

export interface FixedSeatConstraint {
  readonly studentId: string;
  readonly row: number;
  readonly col: number;
  readonly reason: string;
}

export interface SeatConstraints {
  readonly zones: readonly ZoneConstraint[];
  readonly separations: readonly SeparationConstraint[];
  readonly adjacencies: readonly AdjacencyConstraint[];
  readonly fixedSeats: readonly FixedSeatConstraint[];
}

export const EMPTY_SEAT_CONSTRAINTS: SeatConstraints = {
  zones: [],
  separations: [],
  adjacencies: [],
  fixedSeats: [],
};

export const ZONE_LABELS: Record<ZoneId, string> = {
  front1: '맨앞줄',
  front2: '앞 2줄',
  front3: '앞 3줄',
  back1: '맨뒷줄',
  back2: '뒤 2줄',
  left1: '왼쪽 1열',
  right1: '오른쪽 1열',
  center: '가운데',
};
