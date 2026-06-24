/**
 * 엑셀 파싱 행 → 근거(RecordEvidence) 매핑 (순수 함수).
 *
 * - 학생 매칭: 식별키(studentRef) 우선 → 번호 → (유일한) 성명. 못 찾으면 오류로만 보고(임의 배정 금지).
 * - 한 칸의 관찰 내용은 줄바꿈으로 분리해 줄마다 1건으로 만든다.
 * - 유형(areas)은 비워 둔다(미분류) — 업로드 후 앱에서 분류.
 *
 * ParsedEvidenceRow 는 EvidenceExcel(infra)의 반환 형태와 구조적으로 호환되는 입력 계약이다.
 */

/** EvidenceExcel.parseEvidenceFromExcel 반환과 동일 형태(구조적 호환). */
export interface ParsedEvidenceRow {
  readonly rowNumber: number;
  readonly studentRef?: string;
  readonly studentNumber?: number;
  readonly name?: string;
  readonly date?: string;
  readonly content: string;
}

/** 명단 매칭용 최소 학생 형태. */
export interface ImportRosterStudent {
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
}

/** 매핑된 근거 1건(studentRef 로 연결, 유형은 호출자가 빈 배열로 추가). */
export interface MappedEvidenceItem {
  readonly studentRef: string;
  readonly content: string;
  readonly date?: string;
}

export interface EvidenceImportError {
  readonly rowNumber: number;
  readonly reason: string;
}

export interface EvidenceImportMapResult {
  readonly items: readonly MappedEvidenceItem[];
  readonly errors: readonly EvidenceImportError[];
  /** 학생 매칭에 성공해 1건 이상 만든 입력 행 수. */
  readonly matchedRows: number;
}

export function mapExcelEvidenceRows(
  rows: readonly ParsedEvidenceRow[],
  students: readonly ImportRosterStudent[],
): EvidenceImportMapResult {
  const byRef = new Map(students.map((s) => [s.studentRef, s]));
  const byNumber = new Map(students.map((s) => [s.number, s]));

  const items: MappedEvidenceItem[] = [];
  const errors: EvidenceImportError[] = [];
  let matchedRows = 0;

  for (const row of rows) {
    // 1) 식별키 → 2) 번호 → 3) 유일한 성명
    let student = row.studentRef ? byRef.get(row.studentRef) : undefined;
    if (!student && row.studentNumber !== undefined) student = byNumber.get(row.studentNumber);
    if (!student && row.name) {
      const named = students.filter((s) => s.name === row.name);
      if (named.length === 1) student = named[0];
    }
    if (!student) {
      const who = `번호 ${row.studentNumber ?? '?'}${row.name ? ` ${row.name}` : ''}`;
      errors.push({ rowNumber: row.rowNumber, reason: `학생을 찾을 수 없습니다(${who})` });
      continue;
    }

    const lines = row.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      errors.push({ rowNumber: row.rowNumber, reason: '관찰 내용이 비어 있습니다' });
      continue;
    }

    matchedRows += 1;
    for (const line of lines) {
      items.push({
        studentRef: student.studentRef,
        content: line,
        ...(row.date ? { date: row.date } : {}),
      });
    }
  }

  return { items, errors, matchedRows };
}
