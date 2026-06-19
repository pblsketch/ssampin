/**
 * NEIS 전과목 성적 일람표 가져오기 — 레이아웃 자동 인식 + 행 파싱 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.3, Phase 6 / Step 3)
 * 근거: 교육부 학업성적관리 시행지침 / NEIS 성적처리 사용자 설명서
 *  - 과목별 산출 항목: 원점수, 과목평균, 과목표준편차, 성취도(수강자수), 석차(동석차수), 석차등급
 *  - 중학교는 석차등급 없음(성취도·분포비율). 본 파서는 있는 항목만 채운다.
 *
 * 레이아웃(매트릭스): 제목행 + 2행 병합 헤더(상=과목명, 하=세부필드명) + 학생 1행.
 * 결합 셀("성취도(수강자수)"=B(250), "원점수/과목평균(표준편차)"=85/72.3(12.1),
 * "석차(동석차수)"=10/1)도 분해해 채운다. 외부 의존성 import 금지(행렬 변환은 infra 담당).
 */
import type { StudentTranscript, TranscriptSubjectRow } from '@domain/entities/ImportedTranscript';
import { subjectCategoryOf } from '@domain/services/transcriptAnalysis';

export type TranscriptGrid = readonly (readonly unknown[])[];

/** 과목 블록이 가질 수 있는 세부 필드. */
export type TranscriptFieldKey =
  | '원점수'
  | '과목평균'
  | '표준편차'
  | '성취도'
  | '수강자수'
  | '석차'
  | '석차등급';

export interface SubjectBlock {
  readonly subject: string;
  /** 필드 → 열 인덱스(0-based) */
  readonly cols: Partial<Record<TranscriptFieldKey, number>>;
}

export interface TranscriptLayout {
  /** 세부 헤더 행 인덱스(0-based) */
  readonly headerRow: number;
  /** 번호 열(없으면 -1) */
  readonly numCol: number;
  /** 성명 열(없으면 -1) */
  readonly nameCol: number;
  readonly subjects: readonly SubjectBlock[];
}

export interface ParseTranscriptOptions {
  /** 학기 표기(예: '2026 1학기'). 미지정 시 빈 문자열. */
  readonly term?: string;
  /** 과목명이 비었을 때(단일 과목 시트 등) 대체 과목명(보통 시트명). */
  readonly fallbackSubject?: string;
}

function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/\s/g, '')
    .toLowerCase();
}

const NUM_ALIASES = ['번호', '연번', '순번', 'no', 'num'];
const NAME_ALIASES = ['성명', '이름', '학생명', '학생', '학생이름'];

function isNumHeader(cell: unknown): boolean {
  return NUM_ALIASES.includes(norm(cell));
}
function isNameHeader(cell: unknown): boolean {
  return NAME_ALIASES.includes(norm(cell));
}

/** 세부 헤더 셀을 필드로 매핑(석차등급 → 석차 순서 주의). 미매칭 null. */
export function fieldOf(cell: unknown): TranscriptFieldKey | null {
  const n = norm(cell);
  if (n === '') return null;
  if (n.includes('석차등급') || n === '등급') return '석차등급';
  if (n.includes('석차')) return '석차';
  // '성취도(수강자수)' 결합 헤더는 성취도로 본다(수강자수는 셀 값에서 분해) → 수강자수보다 먼저 검사.
  if (n.includes('성취도') && !n.includes('분포')) return '성취도';
  if (n.includes('수강자')) return '수강자수';
  // '원점수/과목평균(표준편차)' 결합 헤더는 원점수 열이다(셀 값 "85/72.3(12.1)"을 parseScoreCell이
  // 분해). 표준편차·과목평균보다 먼저 검사해야 결합 헤더를 표준편차로 오인하지 않는다.
  if (n.includes('원점수') || n === '원점' || n === '점수') return '원점수';
  if (n.includes('표준편차') || n === '편차') return '표준편차';
  if (n.includes('과목평균') || n === '평균') return '과목평균';
  return null;
}

/** 상단 헤더 행에서 과목명을 좌→우 carry-forward(병합 셀이 첫 칸만 채워진 경우 대응). */
function carrySubjects(top: readonly unknown[] | undefined, width: number): string[] {
  const out: string[] = [];
  let last = '';
  for (let c = 0; c < width; c += 1) {
    const raw = top?.[c];
    if (norm(raw) !== '') last = String(raw).trim();
    out[c] = last;
  }
  return out;
}

/**
 * 상위 행을 훑어 세부 헤더 행/식별 열/과목 블록을 자동 인식한다.
 * 번호 또는 성명 + 세부필드 2개 이상이 함께 있는 첫 행을 헤더로 본다. 실패 시 null.
 */
export function detectTranscriptLayout(grid: TranscriptGrid): TranscriptLayout | null {
  const scanLimit = Math.min(30, grid.length);
  for (let r = 0; r < scanLimit; r += 1) {
    const row = grid[r];
    if (row === undefined) continue;

    let numCol = -1;
    let nameCol = -1;
    const fieldCols: [number, TranscriptFieldKey][] = [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (numCol === -1 && isNumHeader(cell)) {
        numCol = c;
        continue;
      }
      if (nameCol === -1 && isNameHeader(cell)) {
        nameCol = c;
        continue;
      }
      const f = fieldOf(cell);
      if (f !== null) fieldCols.push([c, f]);
    }

    if ((nameCol !== -1 || numCol !== -1) && fieldCols.length >= 2) {
      const top = r > 0 ? grid[r - 1] : undefined;
      const carried = carrySubjects(top, row.length);

      const order: string[] = [];
      const map = new Map<
        string,
        { subject: string; cols: Partial<Record<TranscriptFieldKey, number>> }
      >();
      for (const [c, f] of fieldCols) {
        const subj = carried[c] ?? '';
        if (!map.has(subj)) {
          map.set(subj, { subject: subj, cols: {} });
          order.push(subj);
        }
        const blk = map.get(subj)!;
        if (blk.cols[f] === undefined) blk.cols[f] = c;
      }

      const subjects = order.map((s) => map.get(s)!);
      if (subjects.length === 0) continue;
      return { headerRow: r, numCol, nameCol, subjects };
    }
  }
  return null;
}

function toNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** "B(250)" → {achievement:'B', totalStudents:250}. 괄호 안 숫자는 수강자수. */
export function parseAchievementCell(value: unknown): {
  achievement?: string;
  totalStudents?: number;
} {
  const s = String(value ?? '').trim();
  if (s === '') return {};
  const achievement = s.replace(/\(.*$/, '').trim() || undefined;
  const m = s.match(/\((\d+)\)/);
  const totalStudents = m ? Number(m[1]) : undefined;
  return { achievement, totalStudents };
}

/** "85/72.3(12.1)" → {rawScore, subjectMean, stdDev}. 분리형이면 rawScore만. */
export function parseScoreCell(value: unknown): {
  rawScore?: number;
  subjectMean?: number;
  stdDev?: number;
} {
  const s = String(value ?? '').trim();
  if (s === '') return {};
  const m = s.match(/^([\d.]+)\s*\/\s*([\d.]+)\s*\(\s*([\d.]+)\s*\)/);
  if (m) {
    return { rawScore: Number(m[1]), subjectMean: Number(m[2]), stdDev: Number(m[3]) };
  }
  const n = toNum(s);
  return n !== undefined ? { rawScore: n } : {};
}

/** "10/1" → {rank:10, tieCount:1}. 단일 숫자면 rank만. */
export function parseRankCell(value: unknown): { rank?: number; tieCount?: number } {
  const s = String(value ?? '').trim();
  if (s === '') return {};
  const m = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (m) return { rank: Number(m[1]), tieCount: Number(m[2]) };
  const n = toNum(s);
  return n !== undefined ? { rank: n } : {};
}

function buildSubjectRow(
  row: readonly unknown[],
  block: SubjectBlock,
  fallbackSubject: string,
): TranscriptSubjectRow | null {
  const subject = block.subject !== '' ? block.subject : fallbackSubject;
  if (subject === '') return null;

  const score = block.cols['원점수'] !== undefined ? parseScoreCell(row[block.cols['원점수']]) : {};
  const ach =
    block.cols['성취도'] !== undefined ? parseAchievementCell(row[block.cols['성취도']]) : {};
  const rankParsed = block.cols['석차'] !== undefined ? parseRankCell(row[block.cols['석차']]) : {};

  const subjectMean =
    block.cols['과목평균'] !== undefined ? toNum(row[block.cols['과목평균']]) : score.subjectMean;
  const stdDev =
    block.cols['표준편차'] !== undefined ? toNum(row[block.cols['표준편차']]) : score.stdDev;
  const totalStudents =
    block.cols['수강자수'] !== undefined ? toNum(row[block.cols['수강자수']]) : ach.totalStudents;
  const rankGrade =
    block.cols['석차등급'] !== undefined ? toNum(row[block.cols['석차등급']]) : undefined;

  const built: TranscriptSubjectRow = {
    subject,
    category: subjectCategoryOf(subject),
    rawScore: score.rawScore,
    subjectMean,
    stdDev,
    achievement: ach.achievement,
    rank: rankParsed.rank,
    tieCount: rankParsed.tieCount,
    totalStudents,
    rankGrade,
  };

  // 의미 있는 값이 하나도 없으면(미이수 등) 제외.
  if (
    built.rawScore === undefined &&
    built.achievement === undefined &&
    built.rankGrade === undefined
  ) {
    return null;
  }
  return built;
}

/** 헤더 다음 행부터 학생 1명씩 파싱. 번호·성명이 모두 비면 건너뛴다(소계/빈 행 방지). */
export function parseTranscriptRows(
  grid: TranscriptGrid,
  layout: TranscriptLayout,
  options: ParseTranscriptOptions = {},
): StudentTranscript[] {
  const term = options.term ?? '';
  const fallbackSubject = options.fallbackSubject ?? '';
  const out: StudentTranscript[] = [];

  for (let r = layout.headerRow + 1; r < grid.length; r += 1) {
    const row = grid[r];
    if (row === undefined) continue;

    const studentName = layout.nameCol >= 0 ? String(row[layout.nameCol] ?? '').trim() : '';
    const numRaw = layout.numCol >= 0 ? row[layout.numCol] : undefined;
    const num = toNum(numRaw);
    const numText = num !== undefined ? String(num) : String(numRaw ?? '').trim();
    if (studentName === '' && numText === '') continue;

    const subjects: TranscriptSubjectRow[] = [];
    for (const block of layout.subjects) {
      const built = buildSubjectRow(row, block, fallbackSubject);
      if (built !== null) subjects.push(built);
    }
    if (subjects.length === 0) continue;

    const studentKey = numText !== '' ? numText : studentName;
    out.push({ studentKey, studentName: studentName || studentKey, term, subjects });
  }
  return out;
}
