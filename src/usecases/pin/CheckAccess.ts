import type { PinSettings, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { isFeatureProtected } from '@domain/rules/pinRules';

export interface AccessCheckResult {
  needsPin: boolean;
  isUnlocked: boolean;
}

/**
 * 해당 기능에 대한 접근 권한 확인
 * autoLockMinutes 이내이면 잠금 해제 상태 유지
 */
export function checkAccess(
  pinSettings: PinSettings,
  feature: ProtectedFeatureKey,
  lastUnlockedAt: number | null,
): AccessCheckResult {
  const needsPin = isFeatureProtected(pinSettings, feature);
  if (!needsPin) return { needsPin: false, isUnlocked: true };

  if (lastUnlockedAt === null) return { needsPin: true, isUnlocked: false };

  // autoLockMinutes가 0이면 매번 PIN 입력
  if (pinSettings.autoLockMinutes === 0) return { needsPin: true, isUnlocked: false };

  const elapsed = Date.now() - lastUnlockedAt;
  const lockMs = pinSettings.autoLockMinutes * 60 * 1000;
  const isUnlocked = elapsed < lockMs;

  return { needsPin: true, isUnlocked };
}
