/**
 * rosterImportRules.ts
 * 명렬 붙여넣기 가져오기 — 순수 도메인 로직 (외부 의존 없음)
 */

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export type ColumnType =
  | 'number'           // 번호
  | 'name'             // 이름
  | 'phone'            // 학생연락처
  | 'parentPhoneLabel' // 보호자1관계
  | 'parentPhone'      // 보호자1연락처
  | 'parentPhone2Label'// 보호자2관계
  | 'parentPhone2'     // 보호자2연락처
  | 'birthDate'        // 생년월일
  | 'remarks'          // 비고
  | 'skip';            // 건너뛰기

export interface ColumnMapping {
  index: number;
  type: ColumnType;
  /** 원본 헤더 텍스트 (헤더가 없으면 '열 N') */
  headerText: string;
  /** 자동 감지 신뢰도 */
  confidence: 'high' | 'medium' | 'low';
}

export interface RowError {
  columnIndex: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParsedRow {
  /** 원본 셀 값 배열 */
  cells: string[];
  errors: RowError[];
}

export interface ParseResult {
  hasHeader: boolean;
  columns: ColumnMapping[];
  rows: ParsedRow[];
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  errors: { rowIndex: number; errors: RowError[] }[];
}

export interface ImportReadyStudent {
  name: string;
  studentNumber: number;
  phone: string;
  parentPhone: string;
  parentPhoneLabel: string;
  parentPhone2: string;
  parentPhone2Label: string;
  birthDate: string;
  isVacant: boolean;
}

// ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────

// Header regex patterns — same as ExcelExporter.ts for consistency
const HEADER_PATTERNS: Record<Exclude<ColumnType, 'skip'>, RegExp> = {
  number: /^(번호|No|no|#|학번)$/i,
  name: /^(이름|성명|학생명|name)$/i,
  phone: /^(전화|연락처|학생연락처|학생전화|phone)$/i,
  parentPhoneLabel: /^(보호자1?관계|관계|relationship)$/i,
  parentPhone: /^(학부모|보호자|학부모연락처|보호자연락처|보호자1연락처|parentPhone)$/i,
  parentPhone2Label: /^(보호자2관계)$/i,
  parentPhone2: /^(보호자2|보호자2연락처|parentPhone2)$/i,
  birthDate: /^(생년월일|생일|birthDate|birthday|birth)$/i,
  remarks: /^(비고|remarks|메모|결번)$/i,
};

const PHONE_RE = /^0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}$/;
const MOBILE_DIGITS_RE = /^01\d{8,9}$/;
const HANGUL_NAME_RE = /^[\uAC00-\uD7A3]{2,4}$/;
const NUMERIC_RE = /^\d+$/;

function looksLikePhone(v: string): boolean {
  const stripped = v.replace(/[-.\s]/g, '');
  return PHONE_RE.test(v.trim()) || MOBILE_DIGITS_RE.test(stripped);
}

function looksLikeNumber(v: string): boolean {
  return NUMERIC_RE.test(v.trim()) && Number(v.trim()) < 200;
}

function matchHeaderToType(header: string): ColumnType | null {
  const trimmed = header.trim();
  for (const [type, pattern] of Object.entries(HEADER_PATTERNS) as [Exclude<ColumnType, 'skip'>, RegExp][]) {
    if (pattern.test(trimmed)) return type;
  }
  return null;
}

function isHeaderRow(cells: string[]): boolean {
  return cells.some((cell) => matchHeaderToType(cell) !== null);
}

function hasNumericValues(row: string[]): boolean {
  return row.some((cell) => NUMERIC_RE.test(cell.trim()) && cell.trim() !== '');
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 열 값과 선택적 헤더 텍스트로 컬럼 타입과 신뢰도를 자동 감지한다.
 */
export function detectColumnType(
  values: string[],
  headerText?: string,
): { type: ColumnType; confidence: 'high' | 'medium' | 'low' } {
  if (headerText) {
    const matched = matchHeaderToType(headerText);
    if (matched !== null) return { type: matched, confidence: 'high' };
  }

  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return { type: 'skip', confidence: 'low' };

  const phoneCount = nonEmpty.filter(looksLikePhone).length;
  const nameCount = nonEmpty.filter((v) => HANGUL_NAME_RE.test(v.trim())).length;
  const numericCount = nonEmpty.filter(looksLikeNumber).length;

  const ratio = (count: number) => count / nonEmpty.length;

  if (ratio(nameCount) >= 0.7) return { type: 'name', confidence: 'medium' };
  if (ratio(phoneCount) >= 0.7) return { type: 'phone', confidence: 'medium' };
  if (ratio(numericCount) >= 0.8) return { type: 'number', confidence: 'medium' };

  return { type: 'skip', confidence: 'low' };
}

/**
 * 클립보드 텍스트를 파싱하여 ParseResult를 반환한다.
 * 탭/줄바꿈 기준으로 분리하며 첫 행 헤더 여부를 자동 감지한다.
 */
export function parseClipboardText(text: string): ParseResult {
  const rawLines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (rawLines.length === 0) {
    return { hasHeader: false, columns: [], rows: [] };
  }

  const allCells = rawLines.map((line) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (line.includes(',')) return line.split(',').map((c) => c.trim());
    return [line.trim()];
  });

  // 이름 단일 열 모드 (기존 일괄 추가 하위 호환)
  const isNameOnly = allCells.every((cells) => cells.length === 1);
  if (isNameOnly) {
    const columns: ColumnMapping[] = [
      { index: 0, type: 'name', headerText: '이름', confidence: 'medium' },
    ];
    const rows: ParsedRow[] = allCells.map((cells) => ({ cells, errors: [] }));
    return { hasHeader: false, columns, rows };
  }

  const colCount = Math.max(...allCells.map((r) => r.length));

  // 패딩 — 모든 행을 동일한 열 수로
  const paddedRows = allCells.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push('');
    return padded;
  });

  // 첫 행 헤더 감지
  const firstRow = paddedRows[0] ?? [];
  const secondRow = paddedRows[1] ?? [];
  const hasHeader =
    isHeaderRow(firstRow) ||
    (!hasNumericValues(firstRow) && hasNumericValues(secondRow));

  const dataRows = hasHeader ? paddedRows.slice(1) : paddedRows;

  // 컬럼 매핑 추론
  const columns: ColumnMapping[] = [];
  for (let i = 0; i < colCount; i++) {
    const headerText = hasHeader ? (firstRow[i] ?? `열 ${i + 1}`) : `열 ${i + 1}`;
    const colValues = dataRows.map((row) => row[i] ?? '');
    const detected = detectColumnType(colValues, hasHeader ? headerText : undefined);
    columns.push({ index: i, type: detected.type, headerText, confidence: detected.confidence });
  }

  const rows: ParsedRow[] = dataRows.map((cells) => ({ cells, errors: [] }));

  return { hasHeader, columns, rows };
}

/**
 * 전화번호 형식을 정규화한다.
 * 010-1234-5678 형식으로 변환. 인식 불가능한 값은 빈 문자열 반환.
 */
export function normalizePhone(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const stripped = raw.replace(/[-.\s]/g, '');

  // 휴대폰 (01x, 11자리 또는 10자리)
  const mobileMatch = stripped.match(/^(01\d)(\d{3,4})(\d{4})$/);
  if (mobileMatch) return `${mobileMatch[1]}-${mobileMatch[2]}-${mobileMatch[3]}`;

  // 서울 지역번호 (02)
  const seoulMatch = stripped.match(/^(02)(\d{3,4})(\d{4})$/);
  if (seoulMatch) return `${seoulMatch[1]}-${seoulMatch[2]}-${seoulMatch[3]}`;

  // 기타 지역번호 (0xx)
  const landlineMatch = stripped.match(/^(0\d{2})(\d{3,4})(\d{4})$/);
  if (landlineMatch) return `${landlineMatch[1]}-${landlineMatch[2]}-${landlineMatch[3]}`;

  return '';
}

function getColIndex(columns: ColumnMapping[], type: ColumnType): number {
  return columns.find((c) => c.type === type)?.index ?? -1;
}

function cellAt(row: ParsedRow, idx: number): string {
  if (idx < 0) return '';
  return (row.cells[idx] ?? '').trim();
}

/**
 * 파싱된 행과 컬럼 매핑으로 유효성 검사 결과를 반환한다.
 */
export function validateRows(
  rows: ParsedRow[],
  columns: ColumnMapping[],
): ValidationSummary {
  const nameIdx = getColIndex(columns, 'name');
  const phoneIdx = getColIndex(columns, 'phone');
  const parentPhoneIdx = getColIndex(columns, 'parentPhone');
  const parent2PhoneIdx = getColIndex(columns, 'parentPhone2');

  const seenNames: string[] = [];
  const errorList: { rowIndex: number; errors: RowError[] }[] = [];
  let errorRows = 0;
  let warningRows = 0;

  rows.forEach((row, rowIndex) => {
    const rowErrors: RowError[] = [];

    const name = cellAt(row, nameIdx);
    if (nameIdx >= 0 && name === '') {
      rowErrors.push({ columnIndex: nameIdx, message: '이름이 비어 있습니다.', severity: 'error' });
    }
    if (name !== '') {
      if (seenNames.includes(name)) {
        rowErrors.push({ columnIndex: nameIdx, message: `중복된 이름입니다: ${name}`, severity: 'warning' });
      }
      seenNames.push(name);
    }

    for (const idx of [phoneIdx, parentPhoneIdx, parent2PhoneIdx]) {
      if (idx < 0) continue;
      const raw = cellAt(row, idx);
      if (raw !== '' && normalizePhone(raw) === '') {
        rowErrors.push({
          columnIndex: idx,
          message: `올바르지 않은 전화번호 형식입니다: ${raw}`,
          severity: 'warning',
        });
      }
    }

    if (rowErrors.length > 0) {
      const hasError = rowErrors.some((e) => e.severity === 'error');
      const hasWarning = rowErrors.some((e) => e.severity === 'warning');
      if (hasError) errorRows++;
      else if (hasWarning) warningRows++;
      errorList.push({ rowIndex, errors: rowErrors });
    }
  });

  return {
    totalRows: rows.length,
    validRows: rows.length - errorRows - warningRows,
    errorRows,
    warningRows,
    errors: errorList,
  };
}

/**
 * 파싱 행과 매핑으로 ImportReadyStudent 배열을 생성한다.
 */
export function toImportStudents(
  rows: ParsedRow[],
  columns: ColumnMapping[],
): ImportReadyStudent[] {
  const numberIdx = getColIndex(columns, 'number');
  const nameIdx = getColIndex(columns, 'name');
  const phoneIdx = getColIndex(columns, 'phone');
  const parentLabelIdx = getColIndex(columns, 'parentPhoneLabel');
  const parentPhoneIdx = getColIndex(columns, 'parentPhone');
  const parent2LabelIdx = getColIndex(columns, 'parentPhone2Label');
  const parent2PhoneIdx = getColIndex(columns, 'parentPhone2');
  const birthDateIdx = getColIndex(columns, 'birthDate');
  const remarksIdx = getColIndex(columns, 'remarks');

  let autoNumber = 1;

  return rows
    .filter((row) => {
      if (nameIdx >= 0) return (row.cells[nameIdx] ?? '').trim().length > 0;
      return row.cells.some((c) => c.trim().length > 0);
    })
    .map((row) => {
      const remarks = cellAt(row, remarksIdx);
      const isVacant = /결번/.test(remarks);

      const rawNumber = cellAt(row, numberIdx);
      const parsedNumber = rawNumber !== '' ? parseInt(rawNumber, 10) : NaN;
      const studentNumber = !isNaN(parsedNumber) ? parsedNumber : autoNumber;
      autoNumber = studentNumber + 1;

      return {
        name: cellAt(row, nameIdx),
        studentNumber,
        phone: normalizePhone(cellAt(row, phoneIdx)),
        parentPhoneLabel: cellAt(row, parentLabelIdx),
        parentPhone: normalizePhone(cellAt(row, parentPhoneIdx)),
        parentPhone2Label: cellAt(row, parent2LabelIdx),
        parentPhone2: normalizePhone(cellAt(row, parent2PhoneIdx)),
        birthDate: cellAt(row, birthDateIdx),
        isVacant,
      };
    });
}

/** 미리보기 예시 데이터를 생성한다 (textarea에 채워넣기용) */
export function generateSampleData(): string {
  return [
    '번호\t이름\t학생연락처\t보호자1관계\t보호자1연락처',
    '1\t홍길동\t010-1234-5678\t어머니\t010-9876-5432',
    '2\t김영희\t010-2345-6789\t아버지\t010-8765-4321',
    '3\t이철수\t\t어머니\t010-7654-3210',
    '4\t박민준\t010-3456-7890\t\t',
    '5\t최수아\t010-4567-8901\t조부모\t010-6543-2109',
  ].join('\n');
}
