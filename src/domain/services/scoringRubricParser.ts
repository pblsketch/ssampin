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

/** 채점기준표 grid 인지 — "평가 요소및 채점 기준" 라벨 셀로 식별 */
function isScoringGrid(grid: string[][]): { headerRow: number } | null {
  for (let r = 0; r < grid.length; r++) {
    if (grid[r]!.some((c) => /평가\s*요소\s*및|평가\s*요소및/.test(c))) {
      // 같은 행에 '평가요소'/'채점기준' 하위 헤더가 있어야 채점기준표로 인정
      const joined = grid[r]!.join(' ');
      if (/평가\s*요소/.test(joined) && /채점\s*기준/.test(joined)) return { headerRow: r };
    }
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

  // 평가요소(가장 오른쪽 '평가 요소' 헤더 = 가장 세분 요소)
  let elementCol = -1;
  for (let c = 0; c < colCount; c++) {
    if (/^평가\s*요소$/.test((header[c] ?? '').trim())) elementCol = c;
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
  // 정확 일치 — 라벨 "평가 요소및 채점 기준"이 채점기준 열로 오탐되지 않게
  const descCols: number[] = [];
  for (let c = 0; c < colCount; c++) {
    if (/^채점\s*기준$/.test((header[c] ?? '').trim())) descCols.push(c);
  }

  // 수준별 점수 열: 평가척도 > 끝 숫자열(배점 제외) > 배점
  let perLevelScoreCol = scaleCol ?? -1;
  if (perLevelScoreCol < 0) {
    const dataRows = grid.slice(headerRow + 1);
    for (let c = colCount - 1; c >= 0; c--) {
      if (c === totalCol) continue;
      const numericRows = dataRows.filter((r) => isNumericCell(r[c] ?? '')).length;
      if (numericRows >= 2) {
        perLevelScoreCol = c;
        break;
      }
    }
  }
  if (perLevelScoreCol < 0) perLevelScoreCol = totalCol ?? -1;
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
  let titleSeq = 0;
  // running 상태 — 과목/항목명은 채점기준표보다 앞선 표(성취기준표)·텍스트에서 결정된다.
  let currentSubject: string | null = null;
  let currentTitle: string | null = null;

  for (const { grid, index, endIndex } of tables) {
    const betweenRaw = markdown.slice(prevEnd, index);
    const betweenText = plainText(betweenRaw);
    prevEnd = endIndex;

    // 과목: 직전 구간 텍스트의 성취기준 코드
    const sBetween = subjectByCode(betweenText);
    if (sBetween) currentSubject = sBetween;
    // 항목명: 직전 구간의 "가./나./1) 제목"(보일러플레이트 제외) — 원문 줄 단위
    const tBetween = extractTaskTitle(betweenRaw);
    if (tBetween) currentTitle = tBetween;

    const detected = isScoringGrid(grid);
    if (!detected) {
      // 비-채점기준표(성취기준표 등): 표 안 성취기준 코드로 과목 갱신
      const sGrid = subjectByCode(grid.map((r) => r.join(' ')).join(' '));
      if (sGrid) currentSubject = sGrid;
      continue;
    }
    const cols = detectScoringColumns(grid, detected.headerRow);
    if (!cols) continue;

    const criteria = buildCriteria(grid, detected.headerRow, cols);
    if (criteria.length === 0) continue;

    titleSeq++;
    const title =
      currentTitle ??
      `${currentSubject ? currentSubject + ' ' : ''}수행평가${titleSeq > 1 ? ` ${titleSeq}` : ''}`;
    candidates.push({
      subject: currentSubject,
      grade: filenameGrade,
      title,
      criteria,
      hasScores: true,
    });
    currentTitle = null; // 이 항목 제목 소비 — 다음 항목은 자기 제목을 다시 찾는다
  }

  return candidates;
}

/** 원문 줄에서 수행평가 항목 제목 추출 ("가./나./1) 제목", 보일러플레이트 제외, 없으면 null) */
function extractTaskTitle(raw: string): string | null {
  const BOILERPLATE =
    /성취\s*기준|평가\s*기준|채점\s*기준|평가\s*방법|성취\s*수준|반영\s*비율|유의|목적|점수|척도|역량|개요|편제/;
  const lines = raw.split('\n');
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
    const name = stripBullet((dataRows[i]![cols.elementCol] ?? '').trim());
    // 같은 평가요소(rowspan 펼침으로 동일 값 반복)의 연속 행을 한 묶음으로
    let j = i;
    while (
      j < dataRows.length &&
      stripBullet((dataRows[j]![cols.elementCol] ?? '').trim()) === name
    ) {
      j++;
    }
    const groupRows = dataRows.slice(i, j);
    i = j;

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
