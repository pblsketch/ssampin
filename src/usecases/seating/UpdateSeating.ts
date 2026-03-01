import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import { validateSeatPosition } from '@domain/rules/seatRules';

export class UpdateSeating {
  constructor(private readonly seatingRepo: ISeatingRepository) {}

  /**
   * 특정 좌석의 학생 ID를 업데이트 (null이면 빈 자리)
   */
  async execute(
    row: number,
    col: number,
    studentId: string | null,
  ): Promise<SeatingData> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    if (!validateSeatPosition(current, row, col)) {
      throw new Error('유효하지 않은 좌석 위치입니다.');
    }

    const newSeats = current.seats.map((r, ri) =>
      ri === row
        ? r.map((c, ci) => (ci === col ? studentId : c))
        : [...r],
    );

    const updated: SeatingData = { ...current, seats: newSeats };
    await this.seatingRepo.saveSeating(updated);
    return updated;
  }

  /**
   * 좌석 데이터 전체를 저장 (행/열 변경, 학생 목록 변경 등)
   */
  async saveAll(data: SeatingData): Promise<void> {
    await this.seatingRepo.saveSeating(data);
  }
}
