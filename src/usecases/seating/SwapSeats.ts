import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import { validateSeatPosition, swapSeatIds } from '@domain/rules/seatRules';

export class SwapSeats {
  constructor(private readonly seatingRepo: ISeatingRepository) {}

  async execute(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
  ): Promise<SeatingData> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    if (
      !validateSeatPosition(current, r1, c1) ||
      !validateSeatPosition(current, r2, c2)
    ) {
      throw new Error('유효하지 않은 좌석 위치입니다.');
    }

    const newSeats = swapSeatIds(current.seats, r1, c1, r2, c2);
    const updated: SeatingData = { ...current, seats: newSeats };
    await this.seatingRepo.saveSeating(updated);
    return updated;
  }
}
