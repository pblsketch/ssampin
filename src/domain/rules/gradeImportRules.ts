/**
 * 성적 엑셀 가져오기 — 컬럼 자동 인식 + 데이터행 파싱 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§8.1)
 * NEIS·채점프로그램 양식이 제각각이라 헤더 별칭 사전으로 열을 자동 감지하고,
 * 실패 시 호출자가 수동 매핑(DetectedGradeColumns 직접 주입)할 수 있게 한다.
 * 외부 의존성 import 금지. (xlsx 바이트 → 행렬 변환은 infrastructure 담당)
 */

export type GradeColumnRole = 'num' | 'name' | 'score';

export interface DetectedGradeColumns {
  /** 번호 열 인덱스(0-based). -1 = 미감지 */
  readonly num: number;
  readonly name: number;
  readonly score: number;
  /** 헤더가 있던 행 인덱스(0-based) */
  readonly headerRow: number;
}

/** 헤더 별칭 — num/name 은 정확 일치, score 는 부분 일치(원점수/취득점수 등 변형 대응). */
export const GRADE_HEADER_ALIASES: Readonly<Record<GradeColumnRole, readonly string[]>> = {
  num: ['번호', '연번', '순번', 'no', 'num'],
  name: ['성명', '이름', '학생명', '학생', '학생이름'],
  score: ['점수', '원점수', '득점', '취득점수', '환산점수'],
};

function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/\s/g, '')
    .toLowerCase();
}

function matchRole(cell: unknown, role: GradeColumnRole): boolean {
  const n = norm(cell);
  if (n === '') return false;
  const aliases = GRADE_HEADER_ALIASES[role];
  if (role === 'score') return aliases.some((a) => n.includes(a.toLowerCase()));
  return aliases.some((a) => n === a.toLowerCase());
}

/**
 * 상위 행을 훑어 헤더 행과 번호/이름/점수 열을 자동 감지한다.
 * 점수 열 + (이름 또는 번호) 열이 함께 발견된 첫 행을 헤더로 본다. 실패 시 null.
 */
export function autoDetectColumns(
  rows: readonly (readonly unknown[])[],
): DetectedGradeColumns | null {
  const scanLimit = Math.min(30, rows.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;
    let num = -1;
    let name = -1;
    let score = -1;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (num === -1 && matchRole(cell, 'num')) num = c;
      if (name === -1 && matchRole(cell, 'name')) name = c;
      if (score === -1 && matchRole(cell, 'score')) score = c;
    }
    if (score !== -1 && (name !== -1 || num !== -1)) {
      return { num, name, score, headerRow: i };
    }
  }
  return null;
}

export interface ParsedScoreRow {
  readonly number: number | null;
  readonly name: string;
  readonly score: number | null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 헤더 다음 행부터 데이터행을 파싱한다. 번호·이름이 모두 비면 건너뛴다(빈 행/소계 행 방지).
 */
export function parseScoreRows(
  rows: readonly (readonly unknown[])[],
  cols: DetectedGradeColumns,
): ParsedScoreRow[] {
  const out: ParsedScoreRow[] = [];
  for (let i = cols.headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;
    const name = cols.name >= 0 ? String(row[cols.name] ?? '').trim() : '';
    const number = cols.num >= 0 ? toNumberOrNull(row[cols.num]) : null;
    const score = cols.score >= 0 ? toNumberOrNull(row[cols.score]) : null;
    if (name === '' && number === null) continue;
    out.push({ number, name, score });
  }
  return out;
}
