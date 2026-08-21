/**
 * StaffRoomInviteCode — 온라인 교무실 초대 코드
 *
 * 계획서 §7: **숫자 6자리를 쓰지 않는다.** 숫자만이면 경우의 수가 100만이라
 * 무차별 대입이 몇 시간이면 뚫린다. 기존 `BoardSessionCode` 의 31자 알파벳
 * (혼동 문자 0/O·1/I/L 제외) 6자리를 **그대로 재사용**해 31⁶ ≈ 8.9억으로 올린다.
 *
 * 알파벳을 여기서 다시 선언하지 않는 이유 — 두 벌이 되면 한쪽만 바뀌어
 * 조용히 어긋난다. 단일 출처는 `BoardSessionCode.ts` 다.
 *
 * 경우의 수만으로 막지 않는다. 코드 입력 경로에는 서버에서
 * `supabase/functions/_shared/rateLimit.ts` 를 반드시 함께 건다(§7).
 */
import {
  SESSION_CODE_ALPHABET,
  generateSessionCode,
  isSessionCode,
} from '@domain/valueObjects/BoardSessionCode';

export type StaffRoomInviteCode = string & { readonly __brand: 'StaffRoomInviteCode' };

/** 초대 코드 자릿수 */
export const STAFFROOM_INVITE_CODE_LENGTH = 6;

/** 초대 코드 생성 — BoardSessionCode 와 같은 알파벳·길이 */
export function generateInviteCode(rand: () => number = Math.random): StaffRoomInviteCode {
  return generateSessionCode(rand) as unknown as StaffRoomInviteCode;
}

/** 포맷 검증 — 대문자 6자리, 혼동 문자 제외 */
export function isInviteCode(s: string): s is StaffRoomInviteCode {
  return isSessionCode(s);
}

/**
 * 사용자가 입력한 코드 정리 — 공백·하이픈을 지우고 대문자로 올린다.
 * 선생님이 단체방에서 복사해 붙이면 앞뒤 공백이 자주 섞인다.
 */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export { SESSION_CODE_ALPHABET as STAFFROOM_INVITE_CODE_ALPHABET };
