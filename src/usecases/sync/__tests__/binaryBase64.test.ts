/**
 * binaryBase64 회귀 가드 — 첨부 바이너리 동기화 인코딩.
 *
 * 배경: S2(첨부 Drive 동기화)에서 `btoa(String.fromCharCode(...bytes))` 가
 * 대용량 첨부(이미지 5MB/문서 20MB)에서 스프레드 인자 한계로 RangeError 를 냈다.
 * 이 테스트는 청크 인코딩이 작은/큰 바이너리 모두 무손실 왕복함을 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { uint8ToBase64, base64ToUint8 } from '../binaryBase64';

describe('binaryBase64 — Uint8Array ↔ base64 무손실 왕복', () => {
  it('작은 바이너리(PNG 매직)를 글자단위로 왕복한다', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const roundtrip = base64ToUint8(uint8ToBase64(bytes));
    expect(Array.from(roundtrip)).toEqual(Array.from(bytes));
  });

  it('0~255 모든 바이트 값을 왕복한다', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const roundtrip = base64ToUint8(uint8ToBase64(bytes));
    expect(Array.from(roundtrip)).toEqual(Array.from(bytes));
  });

  it('빈 바이너리를 왕복한다', () => {
    const bytes = new Uint8Array(0);
    expect(uint8ToBase64(bytes)).toBe('');
    expect(base64ToUint8('').length).toBe(0);
  });

  it('1MB 바이너리를 무손실 왕복한다 (스프레드 스택오버플로 회귀 가드)', () => {
    // 1,048,576바이트 — 옛 `String.fromCharCode(...bytes)` 라면 RangeError.
    const size = 1024 * 1024;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) & 0xff;

    const roundtrip = base64ToUint8(uint8ToBase64(bytes));

    expect(roundtrip.length).toBe(size);
    // 전수 비교(샘플 아님) — 무손실 보장.
    let mismatch = -1;
    for (let i = 0; i < size; i++) {
      if (roundtrip[i] !== bytes[i]) {
        mismatch = i;
        break;
      }
    }
    expect(mismatch).toBe(-1);
  });
});
