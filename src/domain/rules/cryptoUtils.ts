/**
 * AES-GCM 암호화/복호화 유틸 (Web Crypto API)
 *
 * 열쇠는 그 일정의 관리 키다. HTTPS 또는 localhost 에서만 동작한다.
 *
 * ── 판이 둘이다 (ADR-095) ──
 * 판 1: 소금값이 모든 일정에서 같다(고정 문자열). 071 이전에 만든 일정이 전부 이것이다.
 * 판 2: 일정마다 서버가 만든 난수 소금값을 쓴다.
 *
 * ★ **판은 암호문 자체가 들고 다닌다.** 판 2 암호문에는 `v2:` 접두사가 붙고, 접두사가
 *   없으면 무조건 판 1로 푼다. 행의 `crypto_version` 값은 **보지 않는다.**
 *
 *   왜 그렇게 하나: 캐시된 옛 탭이나 CDN 에 남은 옛 랜딩 번들이 판 2 일정에 **판 1
 *   암호문**을 저장할 수 있다. 행만 보고 판 2로 풀면 그 값을 못 읽는다. 이건 한
 *   방향으로만 생기는 침묵 결함이라 "소금값이 없으면 판 1" 식의 되돌림으로는 안 막힌다.
 *   판정 단위를 "일정"이 아니라 **"값"** 으로 옮기는 것이 유일한 구조적 해법이다
 *   (계획서 §8 시나리오 5).
 *
 * ★ 같은 로직이 랜딩(`landing/src/components/booking/bookingApi.ts`)에도 한 벌 더 있다.
 *   학부모 브라우저가 암호화하고 교사 앱이 복호화하기 때문이다. 한쪽만 고치면 안 된다.
 */

/** 판 2 암호문 앞에 붙는 표식. 이 글자가 판을 정한다. */
export const CRYPTO_V2_PREFIX = 'v2:';

/** 판 1 의 고정 소금값 — 옛 일정을 계속 읽으려면 이 값이 그대로 있어야 한다. */
const V1_SALT = 'ssampin-consultation-v1';

const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * AES-GCM 암호화 → base64 문자열 (iv + ciphertext).
 *
 * @param salt 일정별 난수 소금값. 주면 판 2로 암호화하고 `v2:` 접두사를 붙인다.
 *             없으면 판 1(고정 소금값)이고 접두사도 없다.
 */
export async function encrypt(plaintext: string, key: string, salt?: string): Promise<string> {
  const derivedKey = await deriveKey(key, salt ?? V1_SALT);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    enc.encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  const b64 = btoa(String.fromCharCode(...combined));
  return salt ? `${CRYPTO_V2_PREFIX}${b64}` : b64;
}

/**
 * base64 문자열 → AES-GCM 복호화.
 *
 * @param salt 이 일정의 난수 소금값. **접두사가 붙은 값에만 쓴다.**
 *             접두사가 없으면 소금값을 줬든 안 줬든 판 1로 푼다.
 */
export async function decrypt(ciphertext: string, key: string, salt?: string): Promise<string> {
  const isV2 = ciphertext.startsWith(CRYPTO_V2_PREFIX);
  if (isV2 && !salt) {
    throw new Error('판 2 암호문을 풀려면 이 일정의 소금값이 필요합니다');
  }

  const body = isV2 ? ciphertext.slice(CRYPTO_V2_PREFIX.length) : ciphertext;
  const derivedKey = await deriveKey(key, isV2 ? salt! : V1_SALT);

  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, data);

  return new TextDecoder().decode(decrypted);
}
