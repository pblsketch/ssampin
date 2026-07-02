/**
 * HTML 표 → 2차원 격자 파서 (infrastructure) — 의존성·DOM 없음(브라우저·Node 공용).
 *
 * 배경: 나이스(NEIS) 성적 조회 화면의 [엑셀] 다운로드는 상당수가 진짜 .xlsx가 아니라
 * "HTML <table>을 .xls로 저장"한 파일이다. exceljs(.xlsx 전용)는 이를 못 읽어 throw하므로,
 * 그 폴백으로 여기서 바이트를 텍스트로 디코딩해 표를 직접 격자로 복원한다.
 *
 * 병합 셀(colspan/rowspan)은 exceljs가 .xlsx 병합 셀을 읽을 때처럼 값을 모든 칸에 복제한다.
 * 그래야 도메인 레이아웃 인식(neisTranscriptImportRules / gradeImportRules)이 그대로 재사용된다.
 * 테스트 환경이 node(jsdom 아님)라 DOMParser를 쓰지 않고 순수 문자열 처리로 구현한다.
 */

const COLSPAN_RE = /colspan\s*=\s*["']?\s*(\d+)/i;
const ROWSPAN_RE = /rowspan\s*=\s*["']?\s*(\d+)/i;

/** 표 안에 데이터가 있을 법한지(폴백 시도 여부) — `<table>` 존재로 판별. */
export function looksLikeHtmlTable(text: string): boolean {
  return /<table[\s>]/i.test(text);
}

/** HTML 엔티티(&nbsp; &amp; 숫자참조 등)를 원문자로 되돌린다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/gi, '&'); // &amp;는 마지막에(다른 엔티티의 이중 인코딩 방지)
}

/** 셀 내부 HTML → 순수 텍스트(태그 제거, <br>는 공백, 엔티티 복원, 공백 정리). */
function cleanCell(html: string): string {
  const noTags = html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/** colspan/rowspan 값을 읽는다(없거나 비정상이면 1). */
function spanOf(attrs: string, re: RegExp): number {
  const m = re.exec(attrs);
  const n = m && m[1] !== undefined ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** 단일 <table> 내부 마크업을 격자로. 병합 셀 값은 모든 칸에 복제한다. */
function parseOneTable(tableHtml: string): string[][] {
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
  const grid: string[][] = [];
  // 활성 rowspan 캐리(열 인덱스별로 아래 행에 내려줄 값/남은 횟수).
  const carry: ({ value: string; remaining: number } | null)[] = [];

  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(tableHtml)) !== null) {
    const cellsHtml = tr[1] ?? '';
    const row: string[] = [];
    let col = 0;

    const placeCarries = (): void => {
      let active = carry[col];
      while (active != null && active.remaining > 0) {
        row[col] = active.value;
        active.remaining -= 1;
        if (active.remaining === 0) carry[col] = null;
        col += 1;
        active = carry[col];
      }
    };

    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(cellsHtml)) !== null) {
      placeCarries();
      const attrs = cm[2] ?? '';
      const text = cleanCell(cm[3] ?? '');
      const colspan = spanOf(attrs, COLSPAN_RE);
      const rowspan = spanOf(attrs, ROWSPAN_RE);
      for (let k = 0; k < colspan; k += 1) {
        row[col] = text;
        if (rowspan > 1) carry[col] = { value: text, remaining: rowspan - 1 };
        col += 1;
      }
    }
    placeCarries(); // 마지막 셀 뒤에 남은 캐리 반영

    for (let i = 0; i < row.length; i += 1) if (row[i] === undefined) row[i] = '';
    grid.push(row);
  }
  return grid;
}

/** 빈 칸을 제외한 셀 개수(가장 데이터가 풍부한 표 선택용). */
function cellScore(grid: readonly (readonly string[])[]): number {
  return grid.reduce((sum, r) => sum + r.filter((c) => c !== '').length, 0);
}

/**
 * HTML 전체에서 데이터가 가장 풍부한 <table>을 골라 2차원 격자로 반환한다.
 * (레이아웃용 외곽 표 + 데이터 표가 섞여 있어도 셀 수가 가장 많은 표를 채택)
 */
export function parseHtmlTableToGrid(html: string): unknown[][] {
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let best: string[][] = [];
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html)) !== null) {
    const g = parseOneTable(m[1] ?? '');
    if (cellScore(g) > cellScore(best)) best = g;
  }
  if (best.length === 0) best = parseOneTable(html); // <table> 매칭 실패 시 전체를 한 표로
  return best;
}

/**
 * 스프레드시트 바이트를 텍스트로 디코딩한다.
 * 앞부분에서 charset(meta)을 추정하고, 한국 공문서에 흔한 EUC-KR/CP949도 처리한다.
 */
export function decodeSheetBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 2048)).toLowerCase();
  const m = /charset\s*=\s*["']?\s*([a-z0-9_-]+)/.exec(head);
  let label = m && m[1] !== undefined ? m[1] : 'utf-8';
  if (
    ['ks_c_5601-1987', 'ksc5601', 'ksc_5601', 'cp949', 'ms949', 'x-windows-949'].includes(label)
  ) {
    label = 'euc-kr';
  }
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
