import type { MealInfo } from '@domain/entities/Meal';
import type { INeisPort } from '@domain/ports/INeisPort';

export class GetMeals {
  constructor(private readonly neisPort: INeisPort) {}

  async execute(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    date: string,
  ): Promise<readonly MealInfo[]> {
    return this.neisPort.getMeals(apiKey, atptCode, schoolCode, date);
  }

  async executeRange(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    startDate: string,
    endDate: string,
  ): Promise<readonly MealInfo[]> {
    return this.neisPort.getMealsRange(apiKey, atptCode, schoolCode, startDate, endDate);
  }
}
