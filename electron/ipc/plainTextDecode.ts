/**
 * 평문(.txt·.md) 해독 — kordoc 을 거치지 않는 갈래.
 *
 * kordoc 은 한글·PDF·오피스처럼 **구조가 있는** 문서를 읽는 파서라, 평문 바이트를 주면
 * `UNSUPPORTED_FORMAT` 을 돌려준다(실측). 그래서 확장자 목록에만 넣으면 파일을 내려받아
 * 파서에 넘기고 실패로 굳는다 — 지금(아예 안 받음)보다 나빠진다. 평문은 여기서 직접 읽는다.
 *
 * `markdownConvert.ts` 에서 떼어 낸 이유는 그 파일이 `electron`·`kordoc` 을 모듈 수준에서
 * import 해 테스트에서 불러올 수 없기 때문이다(이 저장소의 `*Core.ts` 분리 관례와 같다).
 *
 * ★해독을 틀리면 **실패보다 나쁘다.** 깨진 글자가 "본문"으로 저장되어 생기부 근거로 쌓이고,
 *   교사는 본문이 제대로 들어온 줄 안다. 그래서 순서가 중요하다.
 */

/** 이 갈래로 읽을 확장자. `markdownConvert.ts` 의 SUPPORTED_EXTENSIONS 와 짝을 이룬다. */
export const PLAIN_TEXT_EXTENSIONS: readonly string[] = ['txt', 'md'];

export function isPlainTextFile(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return false;
  return PLAIN_TEXT_EXTENSIONS.includes(fileName.slice(lastDot + 1).toLowerCase());
}

/**
 * 바이트 → 글자.
 *
 * 순서: UTF-16 BOM → UTF-8 BOM 제거 → UTF-8(엄격) → 실패 시 CP949(euc-kr).
 *
 *  - **UTF-16 을 가장 먼저 본다.** 윈도우 메모장의 옛 "유니코드" 저장이 UTF-16LE 이고 학교
 *    문서에 아직 남아 있다. UTF-16 한글은 바이트 사이에 0x00 이 끼는데 **NUL 도 적법한
 *    UTF-8** 이라 아래 엄격 검사를 그냥 통과해 버린다 → 깨진 글자가 조용히 저장된다.
 *    BOM 으로 먼저 갈라야만 막힌다.
 *  - **UTF-8 은 엄격(fatal)으로 읽는다.** 느슨하게 읽으면 CP949 파일이 대체 문자(U+FFFD)로
 *    가득 찬 채 "성공"이 되어 버린다. 튕겨야 CP949 로 넘어갈 수 있다.
 *  - CP949 로도 못 읽으면 대체 문자가 남지만, 부르는 쪽의 `hasNoExtractableText` 가 품질
 *    신호로 잡는다(빈 결과를 '성공'이라고 말하지 않는다).
 */
export function decodePlainText(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // UTF-8 BOM 은 눈에 안 보이는 글자로 남아 첫 낱말에 달라붙는다.
  const body =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('euc-kr').decode(body);
  }
}
