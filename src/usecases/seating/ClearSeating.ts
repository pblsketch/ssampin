import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import { clearAllSeats } from '@domain/rules/seatRules';

export class ClearSeating {
  constructor(private readonly seatingRepo: ISeatingRepository) {}

  /**
   * 좌석 배정을 모두 초기화 (grid 크기 유지, 학생 ID를 모두 null로)
   */
  async execute(): Promise<SeatingData> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    const emptySeats = clearAllSeats(current.rows, current.cols);
    const updated: SeatingData = { ...current, seats: emptySeats };
    await this.seatingRepo.saveSeating(updated);
    return updated;
  }
}
