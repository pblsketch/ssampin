import type { PinSettings, ProtectedFeatureKey } from '../entities/PinSettings';

/**
 * PIN 포맷 검증 (4자리 숫자)
 * - 도메인 레벨 방어선: UI 우회 시 비정상 PIN 저장 방지
 * - 해시/비교 로직과는 독립적 (기존 저장된 PIN 검증에는 영향 없음)
 */
export function validatePinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * PIN을 해시하여 반환 (평문 저장 방지)
 * 보안 수준: 학생의 교사 PC 엿보기 방지 (간단한 동기 해시)
 */
export function hashPin(pin: string): string {
  const salt = 'ssampin-pin-v1';
  const str = salt + pin + salt;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36);
}

/**
 * 입력 PIN과 저장된 해시를 비교
 */
export function verifyPin(inputPin: string, storedHash: string): boolean {
  return hashPin(inputPin) === storedHash;
}

/**
 * 해당 기능이 PIN 보호 대상인지 확인
 */
export function isFeatureProtected(
  pinSettings: PinSettings,
  feature: ProtectedFeatureKey,
): boolean {
  if (!pinSettings.enabled || pinSettings.pinHash === null) return false;
  return pinSettings.protectedFeatures[feature] === true;
}
