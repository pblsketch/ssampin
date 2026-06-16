/**
 * 평가 운영계획 markdown → 평가영역 구조 추출 (순수 함수).
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§7 domain, §13 폴백)
 * 이식 원본(참조): schoolinfo-mcp `src/evaluation.ts` 의 structureEvaluation/extractEvaluationSections.
 *
 * kordoc 변환물은 표를 (병합 셀이 있으면) HTML `<table>`, 단순하면 GFM 파이프 표로 출력한다.
 * 본 파서는 두 형식 모두를 텍스트 grid 로 정규화한 뒤, "평가영역/평가요소" 열의 텍스트만
 * 추출한다. **tableHtml 등 HTML 은 도메인에 담지 않는다(§14 Scope Guard).** 표시는 원문 markdown.
 *
 * 외부 의존성 import 금지(순수 도메인).
 */
import type { EvaluationArea, EvaluationPlanGrade } from '../entities/EvaluationPlan';

/** 교과명 (긴 이름 우선 매칭: "기술ㆍ가정"이 "기술"보다 먼저) */
const SUBJECTS = [
  '과학탐구실험',
  '기술ㆍ가정',
  '진로와 직업',
  '제2외국어',
  '통합사회',
  '통합과학',
  '국어',
  '도덕',
  '사회',
  '역사',
  '수학',
  '과학',
  '기술',
  '가정',
  '정보',
  '체육',
  '음악',
  '미술',
  '영어',
  '한문',
  '일본어',
  '중국어',
  '진로',
  '보건',
  '환경',
].sort((a, b) => b.length - a.length);

/** 평가표로 볼 수 있는지 — 편제·시수표 등 비평가표 제외 */
const EVAL_TABLE_RE =
  /수행\s*평가|반영\s*비율|정기\s*시험|평가\s*요소|평가\s*방법|평가\s*영역|평가\s*기준|평가\s*내용|과정\s*중심\s*평가|성취\s*기준|지필/;

/** 평가영역/평가요소 열 헤더 (우선순위: 영역 > 요소/항목 > 내용) */
const AREA_HEADER_PRIMARY = /평가\s*영역|^영역(명)?$|^영역\s/;
const AREA_HEADER_SECONDARY = /평가\s*요소|평가\s*항목|^요소$/;
const AREA_HEADER_TERTIARY = /평가\s*내용|^내용$/;
const RATIO_HEADER = /반영\s*비율|반영\s*률|^비율$|배점|만점|반영\s*\(%\)/;
const SEMESTER_HEADER = /학기|평가\s*시기|^시기$|평가\s*기간/;
const SUBJECT_HEADER = /^교과(목)?$|^과목(명)?$|^교과명$/;
/** 헤더 행 식별/잔여 헤더 행 거르기 */
const HEADER_CELL_RE =
  /평가\s*영역|^영역|평가\s*요소|평가\s*항목|평가\s*내용|반영\s*비율|^비율$|배점|평가\s*방법|성취\s*기준|평가\s*기준|학기|평가\s*시기|^시기$|^교과|^과목|평가\s*종류|^지필$|^수행$|^구분$/;
/** 합계/소계 등 비-영역 행 */
const TOTAL_ROW_RE = /^(합\s*계|소\s*계|총\s*계|계|총\s*점|합\s*산)$/;

/* ──────────────── HTML/GFM 표 → 텍스트 grid ──────────────── */

/** 태그 제거 + 엔티티/공백 정리 */
function plainText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numAttr(attrs: string, name: string): number {
  const m = new RegExp(name + '\\s*=\\s*["\']?(\\d+)', 'i').exec(attrs);
  return m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
}

/** 최상위 <table>…</table> 블록만 추출 (중첩 고려, 위치 포함) */
function topLevelHtmlTables(md: string): { html: string; index: number; endIndex: number }[] {
  const out: { html: string; index: number; endIndex: number }[] = [];
  const re = /<\/?table[^>]*>/gi;
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m[0]![1] !== '/') {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const end = m.index + m[0]!.length;
        out.push({ html: md.slice(start, end), index: start, endIndex: end });
        start = -1;
      }
    }
  }
  return out;
}

/**
 * HTML 표 → 텍스트 grid. rowspan/colspan 을 펼쳐(셀 복제) 모든 행이 같은 컬럼 수를 갖게 한다.
 * (통합형 종합표의 "영역/학기" 공통 셀을 아래로 전파해야 열 기준 추출이 어긋나지 않는다.)
 */
function htmlTableToGrid(tableHtml: string): string[][] {
  const rowMatches = [...tableHtml.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)];
  const grid: string[][] = [];
  // pending[col] = 위 행에서 내려오는 rowspan 셀
  const pending: Array<{ text: string; left: number } | null> = [];

  for (const rowMatch of rowMatches) {
    const inner = rowMatch[1] ?? '';
    const cells = [...inner.matchAll(/<(t[dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    const out: string[] = [];
    let col = 0;
    let ci = 0;
    let guard = 0;
    while (guard++ < 4000) {
      const p = pending[col];
      if (p && p.left > 0) {
        out[col] = p.text;
        p.left -= 1;
        col += 1;
        continue;
      }
      if (ci >= cells.length) {
        // 원본 셀 소진 — 뒤쪽 컬럼에 남은 rowspan 있으면 그 컬럼으로 점프
        let next = -1;
        for (let cc = col; cc < pending.length; cc++) {
          const pc = pending[cc];
          if (pc && pc.left > 0) {
            next = cc;
            break;
          }
        }
        if (next < 0) break;
        col = next;
        continue;
      }
      const c = cells[ci++]!;
      const attrs = c[2] ?? '';
      const text = plainText(c[3] ?? '');
      const colspan = numAttr(attrs, 'colspan');
      const rowspan = numAttr(attrs, 'rowspan');
      for (let cs = 0; cs < colspan; cs++) {
        out[col] = text;
        pending[col] = rowspan > 1 ? { text, left: rowspan - 1 } : null;
        col += 1;
      }
    }
    grid.push(Array.from({ length: out.length }, (_, i) => out[i] ?? ''));
  }
  return grid;
}

/** GFM 파이프 표 블록 추출 → 텍스트 grid (구분선 행 제거) */
function extractGfmTables(md: string): { grid: string[][]; index: number; endIndex: number }[] {
  const out: { grid: string[][]; index: number; endIndex: number }[] = [];
  const lines = md.split('\n');
  // 라인 시작 오프셋
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  let i = 0;
  while (i < lines.length) {
    const isTableLine = (s: string) => /^\s*\|.*\|\s*$/.test(s);
    if (isTableLine(lines[i]!) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const startLine = i;
      const rows: string[][] = [];
      // 헤더
      rows.push(splitGfmRow(lines[i]!));
      i += 2; // 헤더 + 구분선 스킵
      while (i < lines.length && isTableLine(lines[i]!)) {
        rows.push(splitGfmRow(lines[i]!));
        i += 1;
      }
      const lastLine = i - 1;
      out.push({
        grid: rows,
        index: offsets[startLine]!,
        endIndex: offsets[lastLine]! + lines[lastLine]!.length,
      });
      continue;
    }
    i += 1;
  }
  return out;
}

function isSeparator(line: string): boolean {
  if (!/^\s*\|.*\|\s*$/.test(line)) return false;
  return splitGfmRow(line).every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')) || c === '');
}

function splitGfmRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** markdown 전체에서 표를 등장 순서대로(grid + 위치) 추출 */
function extractAllTables(md: string): { grid: string[][]; index: number; endIndex: number }[] {
  const html = topLevelHtmlTables(md).map((t) => ({
    grid: htmlTableToGrid(t.html),
    index: t.index,
    endIndex: t.endIndex,
  }));
  const gfm = extractGfmTables(md);
  return [...html, ...gfm].sort((a, b) => a.index - b.index);
}

/* ──────────────── 텍스트 판별 헬퍼 ──────────────── */

/** 셀 텍스트가 교과명이면 정규 교과명 반환 (공백·중점 변형 흡수) */
function matchSubject(cell: string): string | null {
  const c = cell.replace(/\s/g, '').replace(/·/g, 'ㆍ');
  for (const s of SUBJECTS) {
    const k = s.replace(/\s/g, '').replace(/·/g, 'ㆍ');
    if (c === k || c === k + '과') return s;
  }
  return null;
}

/** 텍스트에서 교과명 탐지 — 단어 경계 기반(부분일치 오탐 방지) */
function subjectInText(text: string): string | null {
  for (const s of SUBJECTS) {
    const pat = s.replace(/[·ㆍ]/g, '[·ㆍ]').replace(/\s+/g, '\\s*');
    const re = new RegExp(`(?:^|[^가-힣])${pat}(?:과)?(?:$|[^가-힣ㆍ·])`);
    if (re.test(text)) return s;
  }
  return null;
}

/** 표 직전 텍스트에서 학년 라벨 추론 ('N학년 … 평가/운영/교과') */
function gradeBefore(text: string): { grade: number | null; label: string } {
  const cap = [...text.matchAll(/([1-6])\s*학년[^0-9]{0,12}(?:평가|운영|교과|과목)/g)];
  if (cap.length) {
    const g = Number(cap[cap.length - 1]![1]);
    return { grade: g, label: `${g}학년` };
  }
  // 폴백: 가장 마지막 'N학년' 언급
  const any = [...text.matchAll(/([1-6])\s*학년/g)];
  if (any.length) {
    const g = Number(any[any.length - 1]![1]);
    return { grade: g, label: `${g}학년` };
  }
  return { grade: null, label: '' };
}

function looksLikeEvalGrid(grid: string[][]): boolean {
  const flat = grid.map((r) => r.join(' ')).join(' ');
  return EVAL_TABLE_RE.test(flat);
}

/** 학기 셀 → '1'|'2'|null (둘 다/연간이면 null) */
function parseSemester(cell: string): '1' | '2' | null {
  const has1 = /1\s*학기|일\s*학기/.test(cell);
  const has2 = /2\s*학기|이\s*학기/.test(cell);
  if (has1 && !has2) return '1';
  if (has2 && !has1) return '2';
  return null;
}

/** 반영비율 셀 → 숫자 포함 원문만 (없으면 undefined) */
function parseRatio(cell: string): string | undefined {
  const t = cell.trim();
  if (t.length === 0) return undefined;
  return /\d/.test(t) ? t : undefined;
}

interface ColumnMap {
  areaCol: number;
  ratioCol: number | null;
  semesterCol: number | null;
  subjectCol: number | null;
  headerRowCount: number;
}

/** 헤더(상위 행)에서 열 의미를 식별. areaCol 없으면 null. */
function detectColumns(grid: string[][]): ColumnMap | null {
  const scan = Math.min(4, grid.length);
  // 헤더 키워드를 가장 많이 가진 행을 주 헤더 행으로
  let primary = 0;
  let bestHits = -1;
  for (let r = 0; r < scan; r++) {
    const hits = grid[r]!.filter((c) => HEADER_CELL_RE.test(c)).length;
    if (hits > bestHits) {
      bestHits = hits;
      primary = r;
    }
  }
  if (bestHits <= 0) return null;

  const headerRows = grid.slice(0, primary + 1);
  const colCount = Math.max(...grid.map((r) => r.length));
  const joinedAt = (c: number) =>
    headerRows
      .map((r) => r[c] ?? '')
      .join(' ')
      .trim();

  const findCol = (re: RegExp, exclude: Set<number>): number | null => {
    for (let c = 0; c < colCount; c++) {
      if (exclude.has(c)) continue;
      if (re.test(joinedAt(c))) return c;
    }
    return null;
  };

  const used = new Set<number>();
  const areaCol =
    findCol(AREA_HEADER_PRIMARY, used) ??
    findCol(AREA_HEADER_SECONDARY, used) ??
    findCol(AREA_HEADER_TERTIARY, used);
  if (areaCol === null) return null;
  used.add(areaCol);

  const subjectCol = findCol(SUBJECT_HEADER, used);
  if (subjectCol !== null) used.add(subjectCol);
  const ratioCol = findCol(RATIO_HEADER, used);
  if (ratioCol !== null) used.add(ratioCol);
  const semesterCol = findCol(SEMESTER_HEADER, used);
  if (semesterCol !== null) used.add(semesterCol);

  return { areaCol, ratioCol, semesterCol, subjectCol, headerRowCount: primary + 1 };
}

/** 데이터 행의 area 셀이 유효한 평가영역인지 (잔여 헤더/합계/빈칸 제외) */
function isValidAreaCell(cell: string): boolean {
  const t = cell.trim();
  if (t.length === 0 || t.length > 40) return false;
  if (HEADER_CELL_RE.test(t)) return false;
  if (TOTAL_ROW_RE.test(t.replace(/\s/g, ''))) return false;
  // 한글 또는 영문자 1자 이상 포함 (순수 숫자/기호 행 제외)
  return /[가-힣A-Za-z]/.test(t);
}

/* ──────────────── 누적 구조 ──────────────── */

interface GradeAccum {
  grade: number | null;
  label: string;
  subjectOrder: string[];
  areas: Map<string, EvaluationArea[]>;
  areaNameSeen: Map<string, Set<string>>; // subject → 영역명 집합(중복 방지)
}

function gradeKey(grade: number | null): string {
  return grade === null ? 'unknown' : String(grade);
}

/* ──────────────── 메인 ──────────────── */

export interface ParseEvaluationResult {
  readonly grades: EvaluationPlanGrade[];
  readonly isSingleSubject: boolean;
}

/**
 * 평가계획 markdown 을 학년/과목/평가영역으로 구조화한다.
 * - 추출 0건이면 grades=[] (호출부는 원문 뷰어로 폴백 — AC4/AC7).
 * - isSingleSubject: 전체에서 식별된 과목이 1종이면 true(분리형 A), 여러 개면 false(통합형 B).
 */
export function parseEvaluationPlan(markdown: string): ParseEvaluationResult {
  // 과대 문서(이상치)는 동기 정규식 스캔이 길어질 수 있어 구조화하지 않고 폴백.
  if (typeof markdown !== 'string' || markdown.length === 0 || markdown.length > 3_000_000) {
    return { grades: [], isSingleSubject: false };
  }

  const tables = extractAllTables(markdown);
  if (tables.length === 0) return { grades: [], isSingleSubject: false };

  const accum = new Map<string, GradeAccum>();
  const allSubjects = new Set<string>();
  let currentGrade: number | null = null;
  let currentLabel = '';
  let currentSubject: string | null = null;
  let lastIdx = 0;

  const ensureGrade = (grade: number | null, label: string): GradeAccum => {
    const key = gradeKey(grade);
    let g = accum.get(key);
    if (!g) {
      g = {
        grade,
        label: label || (grade !== null ? `${grade}학년` : '학년 미상'),
        subjectOrder: [],
        areas: new Map(),
        areaNameSeen: new Map(),
      };
      accum.set(key, g);
    } else if (!g.label && label) {
      g.label = label;
    }
    return g;
  };

  const addArea = (g: GradeAccum, subject: string, area: EvaluationArea): void => {
    if (!g.areas.has(subject)) {
      g.areas.set(subject, []);
      g.areaNameSeen.set(subject, new Set());
      if (!g.subjectOrder.includes(subject)) g.subjectOrder.push(subject);
    }
    const seen = g.areaNameSeen.get(subject)!;
    if (seen.has(area.name)) return; // 동일 (학년,과목) 내 영역명 중복 제거
    seen.add(area.name);
    g.areas.get(subject)!.push(area);
    allSubjects.add(subject);
  };

  for (const { grid, index, endIndex } of tables) {
    const between = markdown.slice(lastIdx, index);
    lastIdx = endIndex;

    // 캡션에서 학년/과목 갱신 (표보다 앞선 텍스트)
    const betweenText = plainText(between);
    const gb = gradeBefore(betweenText);
    if (gb.grade !== null) {
      currentGrade = gb.grade;
      currentLabel = gb.label;
    }
    // '운영 계획' 뒤 구간을 우선해 과목 캡션 탐지 (캡션이 표보다 멀 때 대비)
    const capPart = betweenText.split(/운영\s*계획/).pop() ?? betweenText;
    const subj = subjectInText(capPart) ?? subjectInText(betweenText);
    if (subj) currentSubject = subj;

    if (!looksLikeEvalGrid(grid)) continue;
    const cols = detectColumns(grid);
    if (!cols) continue;

    const g = ensureGrade(currentGrade, currentLabel);

    for (let r = cols.headerRowCount; r < grid.length; r++) {
      const row = grid[r]!;
      const areaText = (row[cols.areaCol] ?? '').trim();
      if (!isValidAreaCell(areaText)) continue;

      // 과목: 표에 교과 열이 있으면 행별, 없으면 캡션 과목
      let subject: string | null = null;
      if (cols.subjectCol !== null) {
        const rawSubj = (row[cols.subjectCol] ?? '').trim();
        subject = matchSubject(rawSubj) ?? (rawSubj.length > 0 ? rawSubj : null);
      }
      if (!subject) subject = currentSubject;
      if (!subject) subject = '과목 미상';

      const ratio = cols.ratioCol !== null ? parseRatio(row[cols.ratioCol] ?? '') : undefined;
      const semester =
        cols.semesterCol !== null ? parseSemester(row[cols.semesterCol] ?? '') : undefined;

      const area: EvaluationArea = {
        name: areaText,
        ...(ratio !== undefined ? { ratio } : {}),
        ...(semester !== undefined ? { semester } : {}),
      };
      addArea(g, subject, area);
    }
  }

  const grades: EvaluationPlanGrade[] = [...accum.values()]
    .filter((g) => g.subjectOrder.length > 0)
    .sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99))
    .map((g) => ({
      grade: g.grade,
      label: g.label,
      subjects: g.subjectOrder,
      areasBySubject: Object.fromEntries(
        g.subjectOrder.map((s) => [s, g.areas.get(s) ?? []]),
      ) as Record<string, readonly EvaluationArea[]>,
    }));

  return { grades, isSingleSubject: allSubjects.size === 1 };
}
