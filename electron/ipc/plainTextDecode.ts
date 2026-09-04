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

/** 눈에 안 보이는 글자는 이름을 붙여 둔다 - 소스에 날글자로 박으면 편집 도구가 조용히 뭉갠다. */
const NUL = '\u0000';
const REPLACEMENT_CHAR = '\ufffd';

export function isPlainTextFile(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return false;
  return PLAIN_TEXT_EXTENSIONS.includes(fileName.slice(lastDot + 1).toLowerCase());
}

/**
 * 결과에 실을 형식 이름. kordoc 이 주던 `format` 자리를 평문도 채워야 한다 —
 * 화면이 이 값을 그대로 표시하고, 빠지면 성공 계약이 깨진다.
 */
export function plainTextFormat(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot < 0 ? 'txt' : fileName.slice(lastDot + 1).toLowerCase();
}

/** 깨진 글자로 판정할 비율 — 알아볼 수 없는 글자가 이만큼 넘으면 본문으로 치지 않는다. */
export const MOJIBAKE_RATIO = 0.05;

/**
 * 해독 결과가 **깨진 글자인가**.
 *
 * ★이 판정이 없으면 깨진 글자가 "본문"으로 저장된다 — 실패보다 나쁘다. 교사는 본문이
 *   제대로 들어온 줄 알고, 그 글자가 생기부 근거로 쌓인다. 빈 문자열만 걸러 내는
 *   `hasNoExtractableText` 로는 못 잡는다(대체 문자도 '글자'라서 길이가 0이 아니다).
 *
 * 두 가지를 본다:
 *  - **NUL** 이 하나라도 있으면 평문이 아니다(글자 파일에 NUL 은 나오지 않는다).
 *  - 대체 문자(U+FFFD)가 5%를 넘으면 인코딩을 잘못 짚은 것이다. 학생이 붙여 넣은 이상한
 *    글자 한두 개로 오탐하지 않도록 **비율**로 본다.
 */
export function looksMojibake(text: string): boolean {
  if (text.includes(NUL)) return true;
  const body = text.replace(/\s/g, '');
  if (body.length === 0) return false;
  let bad = 0;
  for (const ch of body) if (ch === REPLACEMENT_CHAR) bad += 1;
  return bad / body.length > MOJIBAKE_RATIO;
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
 *  - CP949 로도 못 읽으면 대체 문자가 남는다. 그건 `looksMojibake` 가 잡는다 —
 *    `hasNoExtractableText` 는 **빈 문자열만** 보므로 깨진 글자를 통과시킨다.
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
