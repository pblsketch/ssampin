import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';
import type { ISeatingSnapshotRepository } from '@domain/repositories/ISeatingSnapshotRepository';
import { shuffleSeatsWithConstraints } from '@domain/rules/seatRules';
import type { ShuffleResult, AvoidHistoryOption } from '@domain/rules/seatRules';

/** "이전 자리 피하기" 설정 콜백 — 스토어가 현재 사용자 선택을 알려준다. */
export type AvoidHistoryConfig =
  | {
      readonly strength: 'strict' | 'prefer';
    }
  | undefined;

/** 비교에 사용할 최근 스냅샷 개수 (도메인 정책) */
const HISTORY_DEPTH = 3;

export class RandomizeSeats {
  constructor(
    private readonly seatingRepo: ISeatingRepository,
    private readonly constraintsRepo: ISeatConstraintsRepository,
    /** Phase 2: "이전 자리 피하기" — 최근 스냅샷을 참조 */
    private readonly snapshotRepo: ISeatingSnapshotRepository,
    /** Phase 2: 현재 강도 설정을 가져오는 콜백 (스토어가 주입) */
    private readonly avoidConfig: () => AvoidHistoryConfig,
  ) {}

  async execute(): Promise<{ seating: SeatingData; result: ShuffleResult }> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    const constraints = await this.constraintsRepo.getConstraints();

    // Phase 2: avoidHistory 옵션 구성
    let avoidHistory: AvoidHistoryOption | undefined;
    const cfg = this.avoidConfig();
    if (cfg) {
      const recent = (await this.snapshotRepo.getSnapshots()).slice(0, HISTORY_DEPTH);
      if (recent.length > 0) {
        avoidHistory = {
          previousSeats: recent.map((s) => s.seating.seats),
          strength: cfg.strength,
        };
      }
    }

    const result = shuffleSeatsWithConstraints(
      current.seats,
      constraints,
      current.rows,
      current.cols,
      Math.random,
      {
        pairMode: current.pairMode,
        oddColumnMode: current.oddColumnMode,
        avoidHistory,
      },
    );

    const updated: SeatingData = { ...current, seats: result.seats };
    await this.seatingRepo.saveSeating(updated);
    return { seating: updated, result };
  }
}
