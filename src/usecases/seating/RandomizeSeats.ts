import type { SeatingData } from '@domain/entities/Seating';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import { shuffleSeats } from '@domain/rules/seatRules';

export class RandomizeSeats {
  constructor(private readonly seatingRepo: ISeatingRepository) {}

  async execute(): Promise<SeatingData> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) {
      throw new Error('좌석 데이터가 없습니다.');
    }

    const newSeats = shuffleSeats(current.seats);
    const updated: SeatingData = { ...current, seats: newSeats };
    await this.seatingRepo.saveSeating(updated);
    return updated;
  }
}
