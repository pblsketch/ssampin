import type { SeatingData } from './Seating';

/**
 * 자리배치 스냅샷 — 셔플 / 수동 저장 / 명렬표 자동 동기화 시 생성된다.
 *
 * 외부 의존성 0건 (Clean Architecture domain 레이어 규칙).
 * ID 생성은 `crypto.randomUUID()` 또는 `${Date.now()}-${counter}` 패턴 사용 — 외부 라이브러리(nanoid 등) 금지.
 */
export interface SeatingSnapshot {
  /** 고유 ID */
  readonly id: string;
  /** 생성 시각 (Date.now()) */
  readonly timestamp: number;
  /** 표시용 라벨. 예: "5/20 셔플 #3" 또는 사용자 입력값 */
  readonly label: string;
  /** 생성 트리거 */
  readonly source: SnapshotSource;
  /** 저장 당시 SeatingData 사본 (rows/cols/seats/pairMode/oddColumnMode/layout/groups 포함) */
  readonly seating: SeatingData;
}

/**
 * 스냅샷 생성 트리거.
 * - 'shuffle': randomize() 성공 시 자동 저장
 * - 'manual': 사용자가 패널에서 "현재 배치 저장" 클릭
 * - 'auto': syncFromRoster로 명렬표 변경 자동 동기화 직전 백업
 */
export type SnapshotSource = 'shuffle' | 'manual' | 'auto';
