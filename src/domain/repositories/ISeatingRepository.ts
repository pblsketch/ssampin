import type { SeatingData } from '../entities/Seating';

export interface ISeatingRepository {
  getSeating(): Promise<SeatingData | null>;
  saveSeating(data: SeatingData): Promise<void>;
}
