/**
 * v2.1 신규 — 학생 PIN SHA-256 hash 헬퍼 (Plan §7.2 결정 #9 / Design v2.1 §2.7).
 *
 * 4자리 PIN 평문을 SHA-256 hex string으로 변환. PIN 평문은 절대 외부 송신 X.
 *
 * - SubtleCrypto는 도메인 외부 의존성 (브라우저/Node webcrypto API) → use case 레이어
 * - 도메인 규칙은 hash 검증만 담당 (`isOwnCard` 양방향 매칭에서 hex 비교)
 * - boardShortCode salt로 보드 간 hash 격리 (rainbow table 무효화 + brute force mitigation)
 *
 * 보안 (회귀 위험 #9):
 * - PIN 평문은 컴포넌트 useState에만 (메모리 휘발)
 * - hash 결과만 localStorage 저장 (`ssampin-realtime-wall-pin-{boardShortCode}`)
 * - hash 결과만 WebSocket 송신
 * - 서버는 hash만 보관 (도메인 RealtimeWallPost.studentPinHash)
 *
 * Phase B에서는 use case 선언만 — 실제 호출은 Phase D (StudentPinSetupModal /
 * useStudentPin / submit-pin-set / submit-pin-verify).
 */

const PIN_PATTERN = /^\d{4}$/;
const SALT_PREFIX = 'ssampin-realtime-wall:';

/**
 * 4자리 숫자 PIN을 SHA-256 hex string(64자리)으로 변환.
 *
 * @param pin 4자리 숫자 문자열
 * @param boardShortCode 보드 단위 salt
 * @returns hex 64자리 (lowercase)
 * @throws PIN이 4자리 숫자가 아닐 때
 */
export async function hashStudentPin(
  pin: string,
  boardShortCode: string,
): Promise<string> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('PIN must be 4 digits');
  }
  if (typeof boardShortCode !== 'string' || boardShortCode.length === 0) {
    throw new Error('boardShortCode is required');
  }

  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('SubtleCrypto API not available');
  }

  const salted = `${SALT_PREFIX}${boardShortCode}:${pin}`;
  const data = new TextEncoder().encode(salted);
  const hashBuffer = await subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * SHA-256 hex string 형식 검증 (64자리 lowercase hex).
 * 도메인 규칙 (`isOwnCard`)에서 입력 검증용.
 */
export function isValidStudentPinHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function getSubtleCrypto(): SubtleCrypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}
