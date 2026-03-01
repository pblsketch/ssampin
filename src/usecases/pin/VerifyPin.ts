import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import { verifyPin } from '@domain/rules/pinRules';

export class VerifyPinUseCase {
  constructor(private readonly settingsRepo: ISettingsRepository) {}

  async execute(inputPin: string): Promise<boolean> {
    const settings = await this.settingsRepo.getSettings();
    if (!settings?.pin.enabled || !settings.pin.pinHash) return false;
    return verifyPin(inputPin, settings.pin.pinHash);
  }
}
