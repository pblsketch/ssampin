/**
 * AES-GCM 암호화/복호화 유틸 (Web Crypto API)
 *
 * key = adminKey (교사만 알고 있는 문자열)
 * HTTPS 또는 localhost 환경에서만 동작
 */

async function deriveKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // 고정 salt (동일 키 → 동일 파생키, 로컬 전용이므로 OK)
  const salt = enc.encode('ssampin-consultation-v1');

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** AES-GCM 암호화 → base64 문자열 (iv + ciphertext) */
export async function encrypt(plaintext: string, key: string): Promise<string> {
  const derivedKey = await deriveKey(key);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    enc.encode(plaintext),
  );

  // iv(12) + ciphertext → base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/** base64 문자열 → AES-GCM 복호화 */
export async function decrypt(ciphertext: string, key: string): Promise<string> {
  const derivedKey = await deriveKey(key);

  const raw = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    data,
  );

  return new TextDecoder().decode(decrypted);
}
