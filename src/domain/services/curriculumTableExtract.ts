/**
 * 학교알리미 교육과정 문서(kordoc 변환 마크다운)에서 편제표 표만 골라낸다 — 순수 도메인.
 *
 * 학교마다 올리는 문서 양식이 다르다: 편제표만 담긴 hwp 도 있고,
 * "학교 교육과정 운영계획" 전체 문서(표지 이미지·목차·학사일정 포함)도 있다.
 * 전체 문서를 그대로 렌더하면 이미지 자리표시(![image](...))·목차 잔해가 쏟아지므로,
 * 최상위 <table> 중 편제표로 보이는 표(교과/과목 + 단위/학점)만 남기고
 * 각 표 앞의 "2024학년도 입학생" 같은 짧은 안내문을 소제목으로 보존한다.
 */

export interface CurriculumExtractResult {
  /** 렌더용 마크다운 — found=true 면 소제목+편제표 표만, false 면 잡음만 걷어낸 원문 */
  readonly markdown: string;
  /** 편제표로 보이는 표를 하나라도 찾았는지 */
  readonly found: boolean;
}

/** 이미지 자리표시(![image](...)) 제거 — 렌더 시 텍스트로 노출되는 잡음 */
function stripImageRefs(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
}

/**
 * 최상위 <table>...</table> 블록 범위 목록.
 * 편제표는 셀 안에 "택N" 박스 같은 중첩표를 가지므로 깊이를 세어 부모 표에 포함시킨다.
 */
function findTopLevelTables(md: string): readonly { start: number; end: number }[] {
  const re = /<table\b|<\/table\s*>/gi;
  const ranges: { start: number; end: number }[] = [];
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (m[0].startsWith('</')) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) ranges.push({ start, end: m.index + m[0].length });
      }
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return ranges;
}

/** 편제표로 보이는 표인가 — 교과/과목 열과 단위/학점 열을 함께 가진다. */
function isCurriculumTable(tableHtml: string): boolean {
  const text = tableHtml.replace(/<[^>]+>/g, ' ');
  return /과목|교과/.test(text) && /단위|학점/.test(text);
}

/* ──────────────── PDF 변환 줄바꿈 소실 복원 ──────────────── */

/** 과목유형 어휘 — 뭉친 "공통공통일반" 을 이 토큰들로만 정확히 나눌 수 있을 때만 복원 */
const SUBJECT_TYPE_TOKENS = ['공통', '일반', '진로', '융합', '전문', '교양'] as const;

/**
 * 교과(군) 어휘 — 뭉친 "국어수학영어한국사"·"사회과학"·"체육예술" 복원용.
 * 한국사를 국어보다 먼저 두는 식의 접두 충돌은 없음(서로 접두어가 아님).
 */
const SUBJECT_GROUP_TOKENS = [
  '한국사',
  '국어',
  '수학',
  '영어',
  '사회',
  '역사',
  '도덕',
  '과학',
  '체육',
  '예술',
  '음악',
  '미술',
  '기술',
  '가정',
  '정보',
  '한문',
  '교양',
  '제2외국어',
] as const;

/** 텍스트가 주어진 어휘 토큰의 연속이면 토큰 배열, 아니면 null(부분 일치 없음 — 전부 or 무) */
function tokenizeByVocab(text: string, vocab: readonly string[]): string[] | null {
  const out: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    const hit = vocab.find((t) => rest.startsWith(t));
    if (hit === undefined) return null;
    out.push(hit);
    rest = rest.slice(hit.length);
  }
  return out.length > 0 ? out : null;
}

const CELL_RE = /(<t[dh][^>]*>)([\s\S]*?)(<\/t[dh]>)/gi;

function countLines(cellInner: string): number {
  return cellInner.split(/<br\s*\/?>/i).length;
}

/**
 * 한 행(tr) 안에서 줄바꿈이 사라져 붙은 셀을 복원한다.
 * PDF 표 변환(kordoc)은 같은 행에서도 과목명 셀은 <br> 을 보존하고
 * 학점("445")·과목유형("공통공통") 셀은 값을 붙여버리는 경우가 있다.
 *
 * 셀당 항목 수 문맥(ctx) = max(행에서 <br> 가 살아남은 셀의 최대 줄 수, 셀 자신의 rowspan).
 * rowspan 이 더 믿을 만하다 — 과목명 줄까지 붙은 행(예: 18과목인데 과목명은 17줄)에서도
 * rowspan 은 하위 행 수(=진짜 과목 수)를 그대로 갖고 있다(경기북과학고 실문서).
 *
 * 학점 뭉침 복원 조건 — 학점은 1~8 한 자리뿐이므로 0/9 가 섞인 텍스트는 진짜 숫자
 * (합계 109·192·204, 연도 2026 등)로 보고 절대 쪼개지 않는다. 그 위에:
 *  - 자릿수==ctx(≥3): 항목 수와 정확히 일치 — 한 글자씩 분리(정렬까지 보존).
 *  - 자릿수 4 이상이고 ≤ctx: 학기별 열처럼 빈 항목이 섞여 자릿수<ctx 인 뭉침 —
 *    분리는 하되(가독성), 4자리 이상 실제 합계는 편제표에 존재하지 않아 안전.
 *  - 두세 자리(자릿수≠ctx)는 두 자리 합계(10~88)·세 자리 합계와 모호해 건드리지 않는다.
 * 과목유형 뭉침은 어휘 토큰으로 완전 분해될 때만(토큰 2개 이상 — "공통공통" 이 단일 값인
 * 경우는 없다) 분리한다.
 */
function repairRowCells(rowHtml: string): string {
  if (/<table/i.test(rowHtml)) return rowHtml; // 중첩표가 걸친 행은 건드리지 않는다
  let n = 1;
  for (const m of rowHtml.matchAll(CELL_RE)) n = Math.max(n, countLines(m[2]!));
  return rowHtml.replace(CELL_RE, (whole, open: string, inner: string, close: string) => {
    if (countLines(inner) !== 1) return whole;
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const rowspan = Number(/rowspan="(\d+)"/i.exec(open)?.[1] ?? '1') || 1;
    const ctx = Math.max(n, rowspan);
    if (ctx < 2) return whole;
    if (/^[1-8]+$/.test(text)) {
      const aligned = ctx >= 3 && text.length === ctx;
      const listOnly = text.length >= 4 && text.length <= ctx;
      if (aligned || listOnly) {
        return `${open}${text.split('').join('<br>')}${close}`;
      }
    }
    const tokens =
      tokenizeByVocab(text, SUBJECT_TYPE_TOKENS) ?? tokenizeByVocab(text, SUBJECT_GROUP_TOKENS);
    if (tokens !== null && tokens.length >= 2 && tokens.length <= ctx) {
      return `${open}${tokens.join('<br>')}${close}`;
    }
    return whole;
  });
}

/** 표(들)의 모든 행에 줄바꿈 복원을 적용한다. 행 단위 치환이라 표 밖 텍스트는 그대로. */
function repairMashedCells(html: string): string {
  return html.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => repairRowCells(row));
}

/** 표 앞 텍스트에서 "2024학년도 입학생" 같은 짧은 캡션을 뽑는다(마지막 것 우선, 없으면 null). */
function pickCaption(segment: string): string | null {
  const cleaned = stripImageRefs(segment);
  const re = /\d{4}학년도[^|\n#(]{0,40}?(?:입학생|편제표)[^|\n#(]{0,30}(?:\([^)\n]{0,20}\))?/g;
  let last: string | null = null;
  for (const m of cleaned.matchAll(re)) {
    const t = m[0].trim();
    if (t) last = t;
  }
  return last;
}

/**
 * 문서에서 편제표 표만 추출한다.
 * 편제표 후보 표가 하나도 없으면(found=false) 이미지 잡음만 제거한 원문을 돌려준다
 * — 호출부는 "편제표만 따로 찾지 못했다"는 안내와 함께 전체를 보여줄 수 있다.
 */
export function extractCurriculumTables(markdown: string): CurriculumExtractResult {
  const ranges = findTopLevelTables(markdown);
  const parts: string[] = [];
  let prevEnd = 0;
  for (const r of ranges) {
    const table = markdown.slice(r.start, r.end);
    if (isCurriculumTable(table)) {
      const caption = pickCaption(markdown.slice(prevEnd, r.start));
      if (caption) parts.push(caption);
      parts.push(repairMashedCells(table));
    }
    prevEnd = r.end;
  }
  if (parts.length === 0) {
    return { markdown: stripImageRefs(repairMashedCells(markdown)), found: false };
  }
  return { markdown: parts.join('\n'), found: true };
}
