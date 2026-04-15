import { create } from 'zustand';
import type { PinSettings, ProtectedFeatures, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { hashPin, verifyPin, validatePinFormat } from '@domain/rules/pinRules';
import { checkAccess } from '@usecases/pin/CheckAccess';
import { useSettingsStore } from './useSettingsStore';

export interface PinState {
  lastUnlockedAt: number | null;

  /** PIN 검증 후 잠금 해제 */
  verify: (pin: string) => boolean;

  /** PIN 설정 (최초 또는 변경) */
  setupPin: (
    newPin: string,
    features: ProtectedFeatures,
    autoLockMinutes: number,
    oldPin?: string,
  ) => { success: boolean; error?: string };

  /** PIN 해제 */
  removePin: (currentPin: string) => { success: boolean; error?: string };

  /** 기능별 보호 설정 변경 */
  updateProtectedFeatures: (features: Partial<ProtectedFeatures>) => void;

  /** 자동 잠금 시간 변경 */
  updateAutoLockMinutes: (minutes: number) => void;

  /** 수동 잠금 */
  lock: () => void;

  /** 자동 잠금 체크 (시간 경과 시 잠금) */
  checkAutoLock: () => void;

  /** 특정 기능에 대한 접근 확인 */
  isAccessible: (feature: ProtectedFeatureKey) => boolean;

  /** 특정 기능이 PIN 보호 대상인지 확인 */
  isProtected: (feature: ProtectedFeatureKey) => boolean;

  /** 현재 PIN 설정 가져오기 */
  getPinSettings: () => PinSettings;
}

export const usePinStore = create<PinState>((set, get) => ({
  lastUnlockedAt: null,

  verify: (pin: string) => {
    const pinSettings = get().getPinSettings();
    if (!pinSettings.enabled || !pinSettings.pinHash) return false;
    const ok = verifyPin(pin, pinSettings.pinHash);
    if (ok) {
      set({ lastUnlockedAt: Date.now() });
    }
    return ok;
  },

  setupPin: (newPin, features, autoLockMinutes, oldPin?) => {
    // 도메인 레벨 포맷 검증 (UI 우회 방지)
    if (!validatePinFormat(newPin)) {
      return { success: false, error: 'PIN은 4자리 숫자여야 합니다' };
    }

    const pinSettings = get().getPinSettings();

    // 기존 PIN 확인
    if (pinSettings.enabled && pinSettings.pinHash) {
      if (!oldPin) return { success: false, error: '기존 PIN을 입력해주세요' };
      if (!verifyPin(oldPin, pinSettings.pinHash)) {
        return { success: false, error: '기존 PIN이 일치하지 않습니다' };
      }
    }

    const newPinSettings: PinSettings = {
      enabled: true,
      pinHash: hashPin(newPin),
      protectedFeatures: features,
      autoLockMinutes,
    };

    void useSettingsStore.getState().update({ pin: newPinSettings });
    set({ lastUnlockedAt: Date.now() });
    return { success: true };
  },

  removePin: (currentPin: string) => {
    const pinSettings = get().getPinSettings();
    if (!pinSettings.pinHash || !verifyPin(currentPin, pinSettings.pinHash)) {
      return { success: false, error: 'PIN이 일치하지 않습니다' };
    }

    const cleared: PinSettings = {
      enabled: false,
      pinHash: null,
      protectedFeatures: {
        timetable: false,
        seating: false,
        schedule: false,
        studentRecords: false,
        meal: false,
        memo: false,
        todo: false,
        classManagement: false,
        bookmarks: false,
      },
      autoLockMinutes: 5,
    };

    void useSettingsStore.getState().update({ pin: cleared });
    set({ lastUnlockedAt: null });
    return { success: true };
  },

  updateProtectedFeatures: (features: Partial<ProtectedFeatures>) => {
    const pinSettings = get().getPinSettings();
    const updated: PinSettings = {
      ...pinSettings,
      protectedFeatures: {
        ...pinSettings.protectedFeatures,
        ...features,
      },
    };
    void useSettingsStore.getState().update({ pin: updated });
  },

  updateAutoLockMinutes: (minutes: number) => {
    const pinSettings = get().getPinSettings();
    void useSettingsStore.getState().update({
      pin: { ...pinSettings, autoLockMinutes: minutes },
    });
  },

  lock: () => {
    set({ lastUnlockedAt: null });
  },

  checkAutoLock: () => {
    const { lastUnlockedAt, getPinSettings } = get();
    const pinSettings = getPinSettings();
    if (!pinSettings.enabled || lastUnlockedAt === null) return;
    if (pinSettings.autoLockMinutes === 0) {
      set({ lastUnlockedAt: null });
      return;
    }
    const elapsed = Date.now() - lastUnlockedAt;
    if (elapsed >= pinSettings.autoLockMinutes * 60 * 1000) {
      set({ lastUnlockedAt: null });
    }
  },

  isAccessible: (feature: ProtectedFeatureKey) => {
    const pinSettings = get().getPinSettings();
    const result = checkAccess(pinSettings, feature, get().lastUnlockedAt);
    return !result.needsPin || result.isUnlocked;
  },

  isProtected: (feature: ProtectedFeatureKey) => {
    const pinSettings = get().getPinSettings();
    if (!pinSettings.enabled || !pinSettings.pinHash) return false;
    return pinSettings.protectedFeatures[feature] === true;
  },

  getPinSettings: () => {
    return useSettingsStore.getState().settings.pin;
  },
}));
