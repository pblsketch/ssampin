import type { SeatConstraints } from '../entities/SeatConstraints';

export interface ISeatConstraintsRepository {
  getConstraints(): Promise<SeatConstraints>;
  saveConstraints(data: SeatConstraints): Promise<void>;
}
