/**
 * 공용 SHA-256 해시 헬퍼 — Phase 2C v2 보안 강화 (UltraQA Q1).
 *
 * 기존에 4개 Edge Function (publish-signature-request, submit-signature,
 * get-signature-request-public, validate-pdf-upload) 가 동일 `sha256Hex` 를 중복
 * 정의했다. 이를 단일 모듈로 추출하면서 동시에 **server-side pepper** 를 도입한다.
 *
 * pepper 정책 (1차 원칙 실효성 보강):
 *   - 환경변수 `SIGNATURE_HASH_PEPPER` (32 hex bytes 권장) 가 설정되어 있으면 모든 해시
 *     입력에 prefix 로 적용됨 → IPv4 rainbow table 공격 차단.
 *   - 미설정 시 plain SHA-256 으로 폴백 (개발/PoC 호환). production 배포 시 반드시
 *     설정해야 한다 — docs/signature-deployment-checklist.md §4 참고.
 *   - pepper 가 누설되어도 새 pepper 로 rotate 가능 (단, 기존 해시는 재검증 불가
 *     → consent_ip_hash 등 5년 retention 데이터는 자연 만료까지 유지).
 *
 * 사용:
 *   import { sha256Hex } from '../_shared/hash.ts';
 *   const hash = await sha256Hex(clientIP);          // pepper 자동 적용
 *   const tokenHash = await sha256Hex(token, 'no-pepper');  // pepper 미적용 강제
 *
 * `tokenHash` 와 같이 **클라이언트가 평문을 계속 재제출하는 값** 은 pepper 를 적용해도
 * 검증 가능하지만, 명시적으로 'no-pepper' 를 지정해 호환을 유지할 수 있다 (기존 DB
 * row 호환 필요 시).
 */

const PEPPER_ENV_NAME = 'SIGNATURE_HASH_PEPPER';

function readPepper(): string {
  // Deno.env.get 는 미설정 시 undefined 반환 — 폴백 빈 문자열 (plain SHA-256 동등).
  try {
    return Deno.env.get(PEPPER_ENV_NAME) ?? '';
  } catch {
    return '';
  }
}

/**
 * SHA-256 hex digest. 기본적으로 `SIGNATURE_HASH_PEPPER` 환경변수가 있으면
 * `pepper|value` 로 결합 후 해시 (rainbow table 차단).
 *
 * @param value 해시할 평문
 * @param pepperMode 'auto' (기본, env 사용) | 'no-pepper' (강제 비적용, 기존 DB 호환)
 *                  | 명시적 string (테스트 또는 namespace 분리용)
 */
export async function sha256Hex(
  value: string,
  pepperMode: 'auto' | 'no-pepper' | string = 'auto',
): Promise<string> {
  let salted: string;
  if (pepperMode === 'no-pepper') {
    salted = value;
  } else if (pepperMode === 'auto') {
    const pepper = readPepper();
    salted = pepper ? `${pepper}|${value}` : value;
  } else {
    // 명시적 pepper 문자열 (테스트 또는 namespace 의미)
    salted = `${pepperMode}|${value}`;
  }
  const bytes = new TextEncoder().encode(salted);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 상수 시간 문자열 비교 — adminKey/token 검증의 timing side-channel 차단.
 * 두 문자열 길이가 다르면 즉시 false (길이 노출은 허용 — 길이는 secret 이 아님).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
