import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import type { ProtectedFeatures } from '@domain/entities/PinSettings';
import { hashPin, verifyPin, validatePinFormat } from '@domain/rules/pinRules';

export class SetupPinUseCase {
  constructor(private readonly settingsRepo: ISettingsRepository) {}

  /**
   * PIN 설정 또는 변경
   * 기존 PIN이 있으면 oldPin으로 먼저 검증
   */
  async execute(
    newPin: string,
    protectedFeatures: ProtectedFeatures,
    oldPin?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!validatePinFormat(newPin)) {
      return { success: false, error: 'PIN은 4자리 숫자여야 합니다' };
    }

    const settings = await this.settingsRepo.getSettings();
    if (!settings) return { success: false, error: '설정을 불러올 수 없습니다' };

    // 기존 PIN이 있으면 확인
    if (settings.pin.enabled && settings.pin.pinHash) {
      if (!oldPin) return { success: false, error: '기존 PIN을 입력해주세요' };
      if (!verifyPin(oldPin, settings.pin.pinHash)) {
        return { success: false, error: '기존 PIN이 일치하지 않습니다' };
      }
    }

    const updated = {
      ...settings,
      pin: {
        ...settings.pin,
        enabled: true,
        pinHash: hashPin(newPin),
        protectedFeatures,
      },
    };
    await this.settingsRepo.saveSettings(updated);
    return { success: true };
  }

  /**
   * PIN 해제 (기존 PIN 확인 필요)
   */
  async remove(currentPin: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.settingsRepo.getSettings();
    if (!settings) return { success: false, error: '설정을 불러올 수 없습니다' };

    if (!settings.pin.pinHash || !verifyPin(currentPin, settings.pin.pinHash)) {
      return { success: false, error: 'PIN이 일치하지 않습니다' };
    }

    const updated = {
      ...settings,
      pin: {
        enabled: false,
        pinHash: null,
        protectedFeatures: {
          timetable: false,
          seating: false,
          schedule: false,
          studentRecords: false,
          meal: false,
          memo: false,
          note: false,
          todo: false,
          classManagement: false,
          bookmarks: false,
        },
        autoLockMinutes: 5,
      },
    };
    await this.settingsRepo.saveSettings(updated);
    return { success: true };
  }
}
