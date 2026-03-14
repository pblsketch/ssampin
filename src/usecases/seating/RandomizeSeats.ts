import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';
import { shuffleSeatsWithConstraints } from '@domain/rules/seatRules';
import type { ShuffleResult } from '@domain/rules/seatRules';

export class RandomizeSeats {
  constructor(
    private readonly seatingRepo: ISeatingRepository,
    private readonly constraintsRepo: ISeatConstraintsRepository,
  ) {}

  async execute(): Promise<{ seating: SeatingData; result: ShuffleResult }> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    const constraints = await this.constraintsRepo.getConstraints();
    const result = shuffleSeatsWithConstraints(
      current.seats,
      constraints,
      current.rows,
      current.cols,
      Math.random,
      { pairMode: current.pairMode, oddColumnMode: current.oddColumnMode },
    );

    const updated: SeatingData = { ...current, seats: result.seats };
    await this.seatingRepo.saveSeating(updated);
    return { seating: updated, result };
  }
}
