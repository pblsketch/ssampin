/**
 * EUC-KR(CP949) 인코더 — 의존성 없이 플랫폼 TextDecoder 의 역테이블로 구현.
 *
 * 컴시간알리미 학교 검색은 검색어를 EUC-KR 바이트의 %XX 퍼센트 인코딩으로 요구한다.
 * 브라우저/Node 모두 TextEncoder 는 UTF-8 전용이므로, TextDecoder('euc-kr')로
 * 가능한 2바이트 조합 전체를 한 번 디코드해 문자→바이트 역테이블을 만든다.
 * (WHATWG 'euc-kr' 라벨은 확장 완성형 windows-949 와 동일 — 현대 한글 음절 전체 커버)
 */

let reverseTable: Map<string, readonly [number, number]> | null = null;

function buildReverseTable(): Map<string, readonly [number, number]> {
  const table = new Map<string, readonly [number, number]>();
  const decoder = new TextDecoder('euc-kr');
  const pair = new Uint8Array(2);
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      pair[0] = lead;
      pair[1] = trail;
      const ch = decoder.decode(pair);
      if (ch.length === 1 && ch !== '�' && !table.has(ch)) {
        table.set(ch, [lead, trail]);
      }
    }
  }
  return table;
}

/**
 * 문자열 → EUC-KR 바이트 배열.
 * 인코딩 불가 문자(EUC-KR 밖의 특수문자 등)는 조용히 건너뛴다 — 검색어 용도라
 * 부분 일치 검색으로도 충분하고, throw 로 흐름을 끊지 않는 편이 낫다.
 */
export function encodeEucKrBytes(text: string): Uint8Array {
  if (!reverseTable) reverseTable = buildReverseTable();
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    const pair = reverseTable.get(ch);
    if (pair) {
      bytes.push(pair[0], pair[1]);
    }
  }
  return new Uint8Array(bytes);
}

/** 문자열 → EUC-KR 퍼센트 인코딩 (모든 바이트를 %xx 로 — 컴시간 검색 쿼리 형식) */
export function encodeEucKrPercent(text: string): string {
  return [...encodeEucKrBytes(text)].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
}
