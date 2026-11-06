/**
 * 컴시간 /st 페이지의 난독화 스크립트 해제 — 순수 문자열 변환, 실행(eval) 없음.
 *
 * 2026-11 부터 /st 페이지의 본 스크립트가 아래 꼴로 감춰져 온다.
 *   (function(a,k){ … String.fromCharCode(parseInt(b.substr(j,4),16)^((k+(j/4)*13)&255)) … (0,eval)(s); })
 *   ([[0,"16진수"],[1,"평문"],…], 83)
 * a[i][0] 이 참이면 평문 조각, 거짓이면 4자리 16진수마다 (k + 순번×배수) & 255 로 XOR 한 글자다.
 * 키 k 와 라우트 코드는 시간마다 바뀌므로 매번 페이지에서 읽는다(실측: 2026-11-06).
 */

const OBFUSCATED_BLOCK_REGEX =
  /\(function\(a,k\)\{([\s\S]*?)\(0,eval\)\(s\);?\}\)\((\[\[[\s\S]*?\]\]),(\d+)\)/g;

/** 해제 공식의 순번 배수 — 함수 본문에서 읽는다 */
const MULTIPLIER_REGEX = /\(j\/4\)\*(\d+)/;

type ObfuscatedChunk = [number, string];

function isChunkList(value: unknown): value is ObfuscatedChunk[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'string',
    )
  );
}

function decodeChunk(hex: string, key: number, multiplier: number): string {
  let out = '';
  for (let j = 0; j + 4 <= hex.length; j += 4) {
    const code = parseInt(hex.substring(j, j + 4), 16);
    if (Number.isNaN(code)) return '';
    out += String.fromCharCode(code ^ ((key + (j / 4) * multiplier) & 255));
  }
  return out;
}

/**
 * 페이지 안의 난독화 블록을 모두 풀어 이어 붙인 스크립트 원문을 돌려준다.
 * 블록이 없거나(옛 형식 페이지) 형식이 어긋난 블록은 건너뛴다 — 코드 추출 단계가
 * 못 찾으면 SERVICE_CHANGED 로 표면화된다.
 */
export function revealComciganScripts(page: string): string {
  const scripts: string[] = [];
  for (const match of page.matchAll(OBFUSCATED_BLOCK_REGEX)) {
    const [, body = '', listText = '', keyText = ''] = match;
    const multiplier = MULTIPLIER_REGEX.exec(body)?.[1];
    if (!multiplier) continue;

    let chunks: unknown;
    try {
      chunks = JSON.parse(listText);
    } catch {
      continue;
    }
    if (!isChunkList(chunks)) continue;

    const key = Number(keyText);
    const mult = Number(multiplier);
    scripts.push(
      chunks.map(([plain, text]) => (plain ? text : decodeChunk(text, key, mult))).join(''),
    );
  }
  return scripts.join('\n');
}
