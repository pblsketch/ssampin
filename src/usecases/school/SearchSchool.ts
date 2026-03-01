import type { SchoolSearchResult } from '@domain/entities/Meal';
import type { INeisPort } from '@domain/ports/INeisPort';

export class SearchSchool {
  constructor(private readonly neisPort: INeisPort) {}

  async execute(
    apiKey: string,
    schoolName: string,
  ): Promise<readonly SchoolSearchResult[]> {
    if (!apiKey || !schoolName.trim()) return [];
    return this.neisPort.searchSchool(apiKey, schoolName.trim());
  }
}
