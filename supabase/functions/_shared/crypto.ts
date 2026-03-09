/**
 * AES-256-GCM 암호화/복호화 유틸리티
 *
 * Deno Web Crypto API (crypto.subtle) 사용.
 * 각 암호화 시 랜덤 IV 12바이트 생성 (IV 재사용 방지).
 */

/** Hex 문자열을 Uint8Array로 변환 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Uint8Array를 Base64 문자열로 변환 */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Base64 문자열을 Uint8Array로 변환 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * AES-256-GCM 암호화
 * @param plaintext 암호화할 평문
 * @param keyHex 32바이트 HEX 키 (64자)
 * @returns { ciphertext, iv, tag } (모두 Base64)
 */
export async function encrypt(
  plaintext: string,
  keyHex: string,
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  // 랜덤 IV 12바이트 생성 (매번 새로 생성하여 IV 재사용 방지)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded,
  );

  // AES-GCM 결과: ciphertext + tag (마지막 16바이트)
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertextBytes = encryptedArray.slice(0, encryptedArray.length - 16);
  const tagBytes = encryptedArray.slice(encryptedArray.length - 16);

  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tagBytes),
  };
}

/**
 * AES-256-GCM 복호화
 * @param ciphertext Base64 암호문
 * @param keyHex 32바이트 HEX 키 (64자)
 * @param iv Base64 IV
 * @param tag Base64 인증 태그
 * @returns 복호화된 평문
 */
export async function decrypt(
  ciphertext: string,
  keyHex: string,
  iv: string,
  tag: string,
): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const ivBytes = base64ToBytes(iv);
  const ciphertextBytes = base64ToBytes(ciphertext);
  const tagBytes = base64ToBytes(tag);

  // ciphertext + tag 결합 (Web Crypto API 요구사항)
  const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  combined.set(ciphertextBytes);
  combined.set(tagBytes, ciphertextBytes.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
    key,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}
