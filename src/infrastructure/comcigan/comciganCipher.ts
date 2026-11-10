/**
 * 컴시간 암호화 응답(enc1/enc2/enc5…) 복호화 — Web Crypto API.
 *
 * 2026-11 부터 학교 검색·시간표 응답이 `enc5:{iv}:{암호문}:{인증값}` 꼴로 온다
 * (enc1 = 16진수, 그 밖의 번호 = base64). 컴시간 페이지의 복호화 함수와 같은 규칙이다.
 *   - 열쇠: 페이지에 적힌 32바이트 16진수(AES-256-CBC, PKCS7)
 *   - 인증: HMAC-SHA256(열쇠 = SHA256(열쇠), 내용 = "{표식}:{iv}:{암호문}")
 * 접두사가 없는 응답은 평문으로 그대로 돌려준다(페이지도 그렇게 처리한다).
 */
import { ComciganError } from '@domain/entities/ComciganTimetable';

/**
 * 암호화 표식. 컴시간은 표식 숫자를 바꿔 가며 쓴다(2026-11-06 enc2 → 11-09 무렵 enc5).
 * 규칙은 그대로다: `enc1` 만 16진수이고 나머지 번호는 base64 다(페이지의 복호화 함수도
 * "enc5 면 base64, 아니면 16진수"로 가른다). 번호를 못 박아 두면 숫자만 바뀌어도 전체가 멈춘다.
 */
const ENCRYPTED_PREFIX_REGEX = /^enc\d+:/;
const HEX_ENCODED_PREFIX = 'enc1';

function invalid(): ComciganError {
  return new ComciganError('SERVICE_CHANGED', '컴시간 응답을 해석하지 못했어요.');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) throw invalid();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw invalid();
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function isComciganEncrypted(text: string): boolean {
  return ENCRYPTED_PREFIX_REGEX.test(text);
}

/**
 * 응답 문자열을 평문으로 바꾼다. 암호문인데 열쇠가 없거나, 인증값이 맞지 않거나,
 * 크기가 어긋나면 SERVICE_CHANGED 로 던진다.
 */
export async function decryptComciganText(text: string, keyHex: string | null): Promise<string> {
  const trimmed = text.replace(/\0+$/, '');
  if (!isComciganEncrypted(trimmed)) return trimmed;
  if (!keyHex) throw invalid();

  const parts = trimmed.split(':');
  if (parts.length !== 4) throw invalid();
  const [, ivText = '', cipherText = '', tagText = ''] = parts;
  const decode = parts[0] === HEX_ENCODED_PREFIX ? hexToBytes : base64ToBytes;
  const iv = decode(ivText);
  const cipher = decode(cipherText);
  const tag = decode(tagText);
  if (iv.length !== 16 || tag.length !== 32 || cipher.length === 0 || cipher.length % 16 !== 0) {
    throw invalid();
  }

  const keyBytes = hexToBytes(keyHex);
  const subtle = globalThis.crypto.subtle;

  const macKeyBytes = await subtle.digest('SHA-256', keyBytes);
  const macKey = await subtle.importKey(
    'raw',
    macKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new TextEncoder().encode(parts.slice(0, 3).join(':'));
  const expected = new Uint8Array(await subtle.sign('HMAC', macKey, signed));
  if (!sameBytes(expected, tag)) throw invalid();

  const aesKey = await subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  let plain: ArrayBuffer;
  try {
    plain = await subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, cipher);
  } catch {
    throw invalid();
  }
  return new TextDecoder('utf-8').decode(plain).replace(/\0+$/, '');
}
