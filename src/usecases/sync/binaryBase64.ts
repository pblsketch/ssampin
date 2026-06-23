/**
 * 바이너리(Uint8Array) ↔ base64 변환 — Drive JSON 동기화 파이프라인용.
 *
 * 관찰 첨부(`obs-attachments/{id}.{ext}`)처럼 바이너리를 JSON-only Drive 파이프라인에
 * 실어 보내기 위해 base64로 감싼다. 첨부 한도가 이미지 5MB / 문서 20MB이므로,
 * `String.fromCharCode(...bytes)` 같은 스프레드는 인자 개수 한계를 넘겨
 * RangeError(Maximum call stack size exceeded)를 일으킨다. → 32KB 청크로 나눠 인코딩한다.
 *
 * btoa/atob 는 Electron 렌더러와 Node(테스트, environment:'node')에 모두 존재한다.
 */

// 스프레드 인자 개수 안전선(엔진 한계 ~65536보다 충분히 작게).
const CHUNK_SIZE = 0x8000; // 32768

/** Uint8Array → base64 문자열 (대용량 안전, 청크 인코딩). */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    // subarray 는 복사 없이 뷰만 만든다. 길이는 최대 CHUNK_SIZE 라 스프레드 안전.
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/** base64 문자열 → Uint8Array. */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
