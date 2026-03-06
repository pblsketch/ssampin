import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';

export class ManageSeatConstraints {
  constructor(private readonly repo: ISeatConstraintsRepository) {}

  async getConstraints(): Promise<SeatConstraints> {
    return this.repo.getConstraints();
  }

  async saveConstraints(data: SeatConstraints): Promise<void> {
    return this.repo.saveConstraints(data);
  }
}
