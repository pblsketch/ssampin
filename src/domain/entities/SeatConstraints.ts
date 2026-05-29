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

/**
 * 절대 같은 좌석 그룹/짝꿍에 두지 않을 학생 쌍 (Hard 제약).
 *
 * ADR Decision 3: hard-layer 부울 must-pass.
 * separations(minDistance)와 동일 의미를 더 명시적·정책적으로 표현 (값 형식 단순화).
 *
 * 본 필드는 옵션 — 정의 안 되어 있으면 빈 배열로 취급.
 */
export interface ForbiddenPairConstraint {
  readonly studentA: string;
  readonly studentB: string;
  /** 사유 (UI 표시용; 알고리즘에는 영향 없음). */
  readonly reason?: string;
}

import type { SeatBalanceDescriptor } from '../rules/seatBalanceDescriptors';

export interface SeatConstraints {
  readonly zones: readonly ZoneConstraint[];
  readonly separations: readonly SeparationConstraint[];
  readonly adjacencies: readonly AdjacencyConstraint[];
  readonly fixedSeats: readonly FixedSeatConstraint[];
  /**
   * Hard 제약 (옵셔널, 빈 배열로 기본화). ADR Decision 3.
   * separations(minDistance) 보다 더 명시적인 '절대 분리' 정책.
   */
  readonly forbiddenPairs?: readonly ForbiddenPairConstraint[];
  /**
   * Soft 목적 (옵셔널). 선언 순서대로 lexicographic 우선순위.
   * ADR Decision 3: balance.academicLevel ≻ balance.gender.
   */
  readonly balanceDescriptors?: readonly SeatBalanceDescriptor[];
}

export const EMPTY_SEAT_CONSTRAINTS: SeatConstraints = {
  zones: [],
  separations: [],
  adjacencies: [],
  fixedSeats: [],
  forbiddenPairs: [],
  balanceDescriptors: [],
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
