/**
 * 수행평가 채점기준표 → 루브릭 후보 추출 (순수 함수).
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md + 2026-06-17 재설계
 * "루브릭 = 채점기준표"라는 전제에 따라, 평가운영계획 문서의 **채점기준표**를 파싱해
 * 평가요소(criterion) + 수준(level: 배점·채점기준 설명)을 갖춘 루브릭 후보를 만든다.
 *
 * 실제 학교 문서(학교알리미·공공누리 제1유형)에서 채점기준표 열 구성은 과목마다 다르므로
 * (헤더 이름·열 순서·병합 구조 상이), **헤더 텍스트 기반으로 열을 동적 인식**한다.
 * 관측된 2개 레이아웃(가정과: 평가요소|배점|채점기준|(끝 점수열), 정보과: 평가항목|평가요소|채점기준|평가척도|배점)
 * 을 픽스처로 고정해 검증한다.
 *
 * 외부 의존성 import 금지(순수 도메인). 표 grid 추출은 evaluationTableParser 와 공유.
 */
import type {
  RubricCandidate,
  RubricCriterionDraft,
  RubricLevelDraft,
} from '../entities/EvaluationPlan';
import { MAX_LEVELS_PER_CRITERION, MIN_LEVELS_PER_CRITERION } from '../rules/rubricRules';
import { extractAllTables, plainText } from './evaluationTableParser';

/* ──────────────── 성취기준 코드 → 과목 ──────────────── */

/**
 * 성취기준 코드 접두사([12언매01-01]의 '언매') → 과목명.
 * 2015 개정 고교 선택과목 중심. 미등록 접두사는 접두사 원문으로 폴백.
 */
const CODE_SUBJECT: Readonly<Record<string, string>> = {
  국어: '국어',
  화작: '화법과 작문',
  언매: '언어와 매체',
  독서: '독서',
  문학: '문학',
  실국: '실용 국어',
  심국: '심화 국어',
  고전: '고전 읽기',
  수학: '수학',
  미적: '미적분',
  확통: '확률과 통계',
  기하: '기하',
  실수: '실용 수학',
  경수: '경제 수학',
  영어: '영어',
  영독작: '영어 독해와 작문',
  실영: '실용 영어',
  진영: '진로 영어',
  통사: '통합사회',
  통과: '통합과학',
  한사: '한국사',
  동사: '동아시아사',
  세사: '세계사',
  정법: '정치와 법',
  경제: '경제',
  사문: '사회·문화',
  생윤: '생활과 윤리',
  윤사: '윤리와 사상',
  한지: '한국지리',
  세지: '세계지리',
  물리: '물리학',
  화학: '화학',
  생명: '생명과학',
  지구: '지구과학',
  과탐: '과학탐구실험',
  기가: '기술·가정',
  가정: '기술·가정',
  기술: '기술·가정',
  정보: '정보',
  정연: '정보과제연구',
  체육: '체육',
  운건: '운동과 건강',
  스생: '스포츠 생활',
  음악: '음악',
  미술: '미술',
  한문: '한문',
  진로: '진로와 직업',
  보건: '보건',
  환경: '환경',
};

/**
 * 본문에서 성취기준 코드를 **있는 그대로** 뽑는다 (`[12언매01-01]` · `[12가정-01-03]`).
 *
 * 전에는 코드를 과목 추정에만 쓰고 버렸다. 평가계획서에는 교사가 이미 "이 수행평가가 어느
 * 성취기준을 보는지" 적어 두었는데, 그것을 읽고도 버리면 교사가 앱에서 다시 골라야 한다.
 * 등장 순서를 지키고 중복은 없앤다.
 */
export function standardCodesIn(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/\[\s*(\d{1,2}\s*[가-힣]{1,4}\s*[\d-]{1,8})\s*\]/g)) {
    const code = `[${m[1]!.replace(/\s+/g, '')}]`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/** 성취기준 코드들의 접두사 최빈값으로 과목 추정 ([12언매01-01], [12가정-01-03] 등) */
export function subjectByCode(text: string): string | null {
  const codes = [...text.matchAll(/\[\s*\d{1,2}\s*([가-힣]{1,4})\s*[-\d]/g)].map((m) => m[1]!);
  const freq = new Map<string, number>();
  for (const c of codes) {
    const s = CODE_SUBJECT[c] ?? c; // 미등록 접두사는 원문 사용
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [s, n] of freq) {
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

/**
 * 과목 섹션 헤딩에서 과목명 추출 — 가장 신뢰도 높은 신호.
 * 예: "2026학년도 1학년 1학기 [공통국어1]" / "2026학년도 3학년 1학기 [영어독해와 작문]".
 * 대괄호 안 전체 과목명을 그대로 쓰므로 코드 약칭 추측이 불필요하다(2022 개정·실험과목 포함).
 * 마지막(가장 가까운) 매칭을 채택. 성취기준 코드 [12언매..]는 '학년도' 앵커가 없어 매칭 안 됨.
 */
function subjectFromHeader(text: string): string | null {
  const re = /20\d{2}\s*학년도[^\n[]{0,24}\[([^\]\n]{2,25})\]/g;
  let last: string | null = null;
  for (const m of text.matchAll(re)) {
    const name = m[1]!.replace(/\s+/g, ' ').trim();
    if (name.length >= 2) last = name;
  }
  return last;
}

/* ──────────────── 헬퍼 ──────────────── */

/** 셀 앞머리 글머리표(∙ § □ ☑ ▪ · - 등)·공백 제거 */
function stripBullet(s: string): string {
  return s
    .replace(/^[\s∙·•§□☑■▪◦○●–—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNumericCell(s: string): boolean {
  return /^\s*\d+(?:\.\d+)?\s*$/.test(s);
}

function gradeFromFilename(filename: string | undefined, maxGrade: number): number | null {
  if (!filename) return null;
  let last: number | null = null;
  for (const m of filename.matchAll(/(?<!\d)([1-6])\s*학년(?!도)/g)) {
    const g = Number(m[1]);
    if (g >= 1 && g <= maxGrade) last = g;
  }
  return last;
}

/** 평가요소(=criterion) 열 헤더 셀인지 — "평가 요소및 채점 기준" 라벨은 제외(및 포함) */
function isElementHeader(cell: string): boolean {
  return /평가\s*요소|채점\s*요소/.test(cell) && !/및/.test(cell) && !/채점\s*기준/.test(cell);
}
/** 채점기준/평가척도/배점 등 점수·설명 열 헤더 셀인지 (라벨 제외) */
function isScoreHeader(cell: string): boolean {
  if (/및/.test(cell)) return false; // "평가 요소및 채점 기준" 라벨 제외
  return /채점\s*기준/.test(cell) || /평가\s*척도/.test(cell) || /^\s*배점\s*$/.test(cell);
}

/**
 * 채점기준표 grid 인지 — **헤더행을 직접 탐색**한다(라벨이 별도 행/병합이어도 동작).
 * 헤더행 = 평가요소(채점요소) 열과 채점기준/평가척도/배점 열이 함께 있는 행.
 * 지필 종합표·성취기준표 등은 이 조합이 없어 자연히 제외된다.
 */
function isScoringGrid(grid: string[][]): { headerRow: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    if (row.some(isElementHeader) && row.some(isScoreHeader)) return { headerRow: r };
  }
  return null;
}

interface ScoringColumns {
  elementCol: number;
  perLevelScoreCol: number;
  totalCol: number | null;
  descCols: number[];
}

function detectScoringColumns(grid: string[][], headerRow: number): ScoringColumns | null {
  const header = grid[headerRow]!;
  const colCount = Math.max(...grid.map((r) => r.length));

  // 평가요소(가장 오른쪽 element 헤더 = 가장 세분 요소). "(채점요소)" 등 접미사 허용, 라벨 제외.
  let elementCol = -1;
  for (let c = 0; c < colCount; c++) {
    if (isElementHeader((header[c] ?? '').trim())) elementCol = c;
  }
  if (elementCol < 0) return null;

  const findHeader = (re: RegExp): number | null => {
    for (let c = 0; c < colCount; c++) {
      if (re.test((header[c] ?? '').trim())) return c;
    }
    return null;
  };
  const totalCol = findHeader(/^배점$/);
  const scaleCol = findHeader(/평가\s*척도/);
  // 채점기준 열 — 라벨('및' 포함)·평가요소 열은 제외
  const descCols: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const cell = (header[c] ?? '').trim();
    if (/채점\s*기준/.test(cell) && !/및/.test(cell) && c !== elementCol) descCols.push(c);
  }

  // 수준별 점수 열은 반드시 **숫자 데이터**여야 한다(평가척도가 상/중/하면 폴백).
  // 우선순위: 숫자인 평가척도 > 끝 숫자열(배점 제외) > 숫자인 배점.
  const dataRows = grid.slice(headerRow + 1);
  const numericCount = (c: number) => dataRows.filter((r) => isNumericCell(r[c] ?? '')).length;
  let perLevelScoreCol = -1;
  if (scaleCol !== null && numericCount(scaleCol) >= 2) {
    perLevelScoreCol = scaleCol;
  }
  if (perLevelScoreCol < 0) {
    for (let c = colCount - 1; c >= 0; c--) {
      if (c === totalCol) continue;
      if (numericCount(c) >= 2) {
        perLevelScoreCol = c;
        break;
      }
    }
  }
  if (perLevelScoreCol < 0 && totalCol !== null && numericCount(totalCol) >= 2) {
    perLevelScoreCol = totalCol;
  }
  if (perLevelScoreCol < 0) return null;

  const cleanedDescCols = descCols.filter((c) => c !== perLevelScoreCol && c !== totalCol);
  return { elementCol, perLevelScoreCol, totalCol, descCols: cleanedDescCols };
}

/** 한 criterion의 레벨 행들에서 행마다 달라지는 채점기준 셀만 모아 수준 설명 구성 */
function levelDescription(rows: string[][], descCols: number[]): string[] {
  // 모든 행에서 동일한 열(공유 rowspan, 예: 공통 질문 목록)은 제외
  const varying = descCols.filter((c) => {
    const vals = rows.map((r) => (r[c] ?? '').trim());
    return new Set(vals).size > 1;
  });
  const useCols = varying.length > 0 ? varying : descCols;
  return rows.map((r) => {
    // colspan 으로 한 셀이 여러 열에 복제되므로 연속 중복 값을 제거하고 합친다
    const parts: string[] = [];
    for (const c of useCols) {
      const v = (r[c] ?? '').trim();
      if (v.length > 0 && v !== parts[parts.length - 1]) parts.push(v);
    }
    return stripBullet(parts.join(' '));
  });
}

/* ──────────────── 메인 ──────────────── */

export interface ParseScoringOptions {
  readonly filename?: string;
  readonly maxGrade?: number;
}

/**
 * 평가계획 markdown 의 채점기준표들을 루브릭 후보로 파싱한다.
 * 채점기준표가 하나도 없으면 빈 배열(호출부가 단순 평가영역 파서/뷰어로 폴백).
 */
export function parseScoringRubrics(
  markdown: string,
  opts?: ParseScoringOptions,
): RubricCandidate[] {
  if (typeof markdown !== 'string' || markdown.length === 0 || markdown.length > 3_000_000) {
    return [];
  }
  const maxGrade = opts?.maxGrade ?? 6;
  const filenameGrade = gradeFromFilename(opts?.filename, maxGrade);

  const tables = extractAllTables(markdown);
  const candidates: RubricCandidate[] = [];
  let prevEnd = 0;
  const subjectSeq = new Map<string, number>(); // 과목별 일반제목 번호
  // running 상태 — 과목은 섹션 헤딩 "[과목명]"(전체명)을 우선하고, 코드는 폴백.
  // 헤딩 과목을 코드가 덮어쓰지 못하도록 둘을 분리한다(섹션마다 헤딩이 새로 갱신됨).
  let headerSubject: string | null = null;
  let codeSubject: string | null = null;
  let currentTitle: string | null = null;
  /**
   * 아직 어느 수행평가에도 붙지 않은 성취기준 코드.
   *
   * 학교 평가계획서는 보통 **성취기준표 → 채점기준표** 순서로 놓인다. 그래서 코드는 채점기준표
   * *앞*(표 사이 본문 또는 바로 앞의 성취기준표)에서 나온다. `currentTitle` 과 똑같이 모았다가
   * 채점기준표를 만나면 **붙이고 비운다** — 안 비우면 문서 뒤쪽 수행평가에까지 앞 항목의 코드가
   * 줄줄이 따라붙어 엉뚱한 성취기준이 달린다.
   */
  let pendingCodes: string[] = [];

  for (const { grid, index, endIndex } of tables) {
    const betweenRaw = markdown.slice(prevEnd, index);
    const betweenText = plainText(betweenRaw);
    prevEnd = endIndex;

    const sHeader = subjectFromHeader(betweenText);
    if (sHeader) headerSubject = sHeader;
    const sCode = subjectByCode(betweenText);
    if (sCode) codeSubject = sCode;
    // 항목명: 직전 구간의 "가./나./1) 제목"(보일러플레이트 제외) — 원문 줄 단위
    const tBetween = extractTaskTitle(betweenRaw);
    if (tBetween) currentTitle = tBetween;
    pendingCodes.push(...standardCodesIn(betweenText));

    const detected = isScoringGrid(grid);
    if (!detected) {
      // 비-채점기준표(성취기준표 등): 표 안 성취기준 코드로 과목 폴백 갱신 + 코드 자체를 챙긴다
      const gridText = grid.map((r) => r.join(' ')).join(' ');
      const sGrid = subjectByCode(gridText);
      if (sGrid) codeSubject = sGrid;
      pendingCodes.push(...standardCodesIn(gridText));
      continue;
    }
    const currentSubject = headerSubject ?? codeSubject;
    const cols = detectScoringColumns(grid, detected.headerRow);
    if (!cols) continue;

    const criteria = buildCriteria(grid, detected.headerRow, cols);
    if (criteria.length === 0) continue;

    // 채점기준표 안에 코드가 직접 적힌 양식도 있다.
    const codes = [
      ...new Set([...pendingCodes, ...standardCodesIn(grid.map((r) => r.join(' ')).join(' '))]),
    ];

    // 제목은 추출된 항목명만 우선 보관(일반 번호는 dedup 후에 매긴다).
    candidates.push({
      subject: currentSubject,
      grade: filenameGrade,
      title: currentTitle ?? '',
      criteria,
      hasScores: true,
      ...(codes.length > 0 ? { standardCodes: codes } : {}),
    });
    currentTitle = null; // 이 항목 제목 소비 — 다음 항목은 자기 제목을 다시 찾는다
    pendingCodes = []; // 코드도 함께 소비한다(안 비우면 뒤 항목에 앞 항목 코드가 따라붙는다)
  }

  // 1) 중복 제거 — **내용(평가요소·점수·설명)** 만으로 식별(과목/제목 제외).
  //    문서가 반복 수록되며 한 사본은 헤딩 과목(전체명), 다른 사본은 코드 약칭이 될 수 있으므로
  //    같은 내용의 중복 중 **더 나은 후보(전체 과목명 + 실제 항목명)**를 남긴다.
  const contentSig = (c: RubricCandidate) =>
    c.criteria
      .map(
        (cr) =>
          `${cr.name}:` +
          cr.levels.map((l) => `${l.score}/${(l.description ?? '').slice(0, 24)}`).join(','),
      )
      .join('|');
  const isBetter = (a: RubricCandidate, b: RubricCandidate) => {
    // 과목명이 더 긴(전체명) 쪽 우선, 동률이면 실제 항목명이 있는 쪽 우선
    const al = (a.subject ?? '').length;
    const bl = (b.subject ?? '').length;
    if (al !== bl) return al > bl;
    return a.title.length > 0 && b.title.length === 0;
  };
  const byContent = new Map<string, RubricCandidate>();
  for (const c of candidates) {
    const sig = contentSig(c);
    const cur = byContent.get(sig);
    if (!cur) {
      byContent.set(sig, c);
      continue;
    }
    // 같은 내용의 사본 중 더 나은 쪽을 남기되, **성취기준 코드는 양쪽을 합친다** —
    // 한 사본에만 코드가 붙어 있는 경우가 있어서, 더 나은 쪽을 고르다 코드를 잃을 수 있다.
    const winner = isBetter(c, cur) ? c : cur;
    const merged = [...new Set([...(cur.standardCodes ?? []), ...(c.standardCodes ?? [])])];
    byContent.set(sig, merged.length > 0 ? { ...winner, standardCodes: merged } : winner);
  }
  const deduped = [...byContent.values()];

  // 2) 항목명이 없는 후보에 과목별 번호 부여(dedup 후라 번호가 안정적).
  return deduped.map((c) => {
    if (c.title.length > 0) return c;
    const key = c.subject ?? '';
    const n = (subjectSeq.get(key) ?? 0) + 1;
    subjectSeq.set(key, n);
    return { ...c, title: `${c.subject ? c.subject + ' ' : ''}수행평가 ${n}` };
  });
}

/** 원문 줄에서 수행평가 항목 제목 추출 ("가./나./1) 제목", 보일러플레이트 제외, 없으면 null) */
function extractTaskTitle(raw: string): string | null {
  const BOILERPLATE =
    /성취\s*기준|평가\s*기준|채점\s*기준|평가\s*방법|성취\s*수준|반영\s*비율|유의|목적|점수|척도|역량|개요|편제|세부\s*계획|운영\s*계획|평가\s*계획/;
  const lines = raw.split('\n');
  // 1순위: "(수행평가) ○○○" 형태의 명시적 과제명 (교수·학습 운영표 등에서 흘러나온 텍스트)
  const perf = [...raw.matchAll(/\(\s*수행평가\s*\)\s*([^\n,.()]{2,40})/g)];
  if (perf.length > 0) {
    const t = perf[perf.length - 1]![1]!.trim().replace(/\s+/g, ' ');
    if (t.length >= 2 && !BOILERPLATE.test(t)) return t;
  }
  // 2순위: "가./나./1) 제목" 형태의 항목 헤딩 (가장 가까운 것)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]!.match(/^[\s\-•▪#*]*(?:[가-힣]|\d{1,2})\s*[.)]\s*(.{2,40})$/);
    if (!m) continue;
    const t = m[1]!.trim().replace(/\s+/g, ' ');
    if (t.length >= 2 && !BOILERPLATE.test(t)) return t;
  }
  return null;
}

/** grid 데이터 행 → criteria (평가요소별 그룹 → 수준 목록) */
function buildCriteria(
  grid: string[][],
  headerRow: number,
  cols: ScoringColumns,
): RubricCriterionDraft[] {
  const dataRows = grid.slice(headerRow + 1);
  const criteria: RubricCriterionDraft[] = [];

  let i = 0;
  while (i < dataRows.length) {
    // 그룹 기준은 평가요소 열 값(rowspan 펼침으로 동일 값 반복) — 점수 의미 보존
    const groupKey = stripBullet((dataRows[i]![cols.elementCol] ?? '').trim());
    let j = i;
    while (
      j < dataRows.length &&
      stripBullet((dataRows[j]![cols.elementCol] ?? '').trim()) === groupKey
    ) {
      j++;
    }
    const groupRows = dataRows.slice(i, j);
    i = j;

    // 표시 이름: 평가요소 값이 "§ A § B …" facet 목록이거나 과도하게 길면
    // 왼쪽의 짧은 그룹 라벨(평가항목, 예: '적절성')을 이름으로 채택한다.
    // (facet들은 하나의 점수밴드를 공유하므로 별도 criterion 으로 쪼개면 만점이 부풀려져 틀림)
    let name = groupKey;
    if (name.includes('§') || name.length > 30) {
      for (let lc = cols.elementCol - 1; lc >= 0; lc--) {
        const cand = stripBullet((groupRows[0]![lc] ?? '').trim());
        if (
          cand.length >= 2 &&
          cand.length <= 25 &&
          !cand.includes('§') &&
          /[가-힣A-Za-z]/.test(cand) &&
          !/^(평가|채점|배점|점수|척도|영역|만점|구분|성취)/.test(cand)
        ) {
          name = cand;
          break;
        }
      }
      name = name.replace(/\s*§\s*/g, ' / ').trim(); // 그래도 facet 목록이면 가독성 정리
    }

    if (name.length === 0 || name.length > 40) continue;
    if (/^(유의|비고|기타|합\s*계|소\s*계|평가\s*방법|교과\s*역량)/.test(name)) continue;

    const descriptions = levelDescription(groupRows, cols.descCols);
    const levels: RubricLevelDraft[] = [];
    groupRows.forEach((row, k) => {
      const raw = (row[cols.perLevelScoreCol] ?? '').trim();
      if (!isNumericCell(raw)) return;
      const score = Number(raw);
      const description = descriptions[k] ?? '';
      levels.push({
        name: `${score}점`,
        score,
        ...(description.length > 0 ? { description } : {}),
      });
    });

    if (levels.length < MIN_LEVELS_PER_CRITERION) continue;
    criteria.push({
      name,
      levels: levels.slice(0, MAX_LEVELS_PER_CRITERION),
    });
  }

  return criteria;
}
