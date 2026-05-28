/**
 * Google Sheets CSV에서 추출한 헤더와 데이터 행을 보고 서명받기 명단을 자동으로 추정한다.
 *
 * Phase 2C 리팩터 (PRD US-2C-06):
 *   - 매핑 추론(`signatureSlots` 자동 생성)을 완전히 제거.
 *   - 명단/역할 컬럼 검출은 `inferParticipantColumns()` 로 분리.
 *   - 반환되는 `mapping` 은 항상 빈 객체 `{ textFields: [], signatureSlots: [] }`.
 *     실제 매핑은 PDF 오버레이 위 `SignatureRegion` 으로 대체된다.
 *
 * 순수 함수. Electron/Network API에 의존하지 않는다.
 */

import type {
  SignatureParticipant,
  SignatureParticipantRole,
  SignatureTemplateKind,
  SignatureTemplateMapping,
  SignatureTextFieldKey,
} from '@domain/entities/SignatureRequest';

export interface SignatureMappingInferenceInput {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface SignatureMappingInferenceResult {
  /**
   * Phase 2C 리팩터: mapping 은 더 이상 자동 추론되지 않는다. 항상 빈 객체.
   * 실제 매핑은 PDF 오버레이 위에 교사가 직접 사각형으로 그린다.
   */
  readonly mapping: SignatureTemplateMapping;
  readonly participants: readonly SignatureParticipant[];
  readonly suggestedTemplateKind: SignatureTemplateKind;
  readonly warnings: readonly string[];
}

export interface ParticipantColumnIndices {
  readonly recipientNameColumn: number | null;
  readonly studentNumberColumn: number | null;
  readonly classNameColumn: number | null;
  readonly roleColumn: number | null;
}

const TEXT_KEYWORDS: Record<SignatureTextFieldKey, readonly string[]> = {
  recipientName: ['성명', '이름', '학생명', '이름(한글)', '학생'],
  studentNumber: ['학번', '번호', '연번', '순번', '일련번호'],
  className: ['학년반', '반', '학급', '소속', '학교', '부서', '소속(학교명)'],
  absencePeriod: ['결석기간', '결석일', '기간'],
  absenceReason: ['결석사유', '사유', '이유'],
  submittedAt: ['제출일', '제출시각', '일자', '일시', '날짜'],
  signatureStatus: ['상태', '확인여부'],
  custom: [],
};

const ROLE_KEYWORDS_TEACHER = [
  '교사',
  '부장교사',
  '수석교사',
  '진로전담',
  '교감',
  '교장',
  '담임',
  '기간제교사',
];

const ROLE_HEADER_PATTERNS = ['직위', '직책'];

const EMPTY_MAPPING: SignatureTemplateMapping = {
  textFields: [],
  signatureSlots: [],
};

/**
 * 헤더에서 명단·역할 컬럼 인덱스를 검출한다. Phase 2C 리팩터로 매핑 자동 추론은
 * 제거되었지만, 명단 자동 채우기(이름/학번/소속/직위)는 그대로 유지된다.
 *
 * @param headers 시트 첫 행 헤더
 * @param _sampleRows 선택적 샘플 행 — 현재 구현에서는 사용되지 않지만, 향후 휴리스틱
 *   (예: studentNumber 컬럼이 숫자만 담는지 검증) 을 추가할 자리.
 */
export function inferParticipantColumns(
  headers: readonly string[],
  _sampleRows: readonly (readonly string[])[] = [],
): ParticipantColumnIndices {
  let recipientNameColumn: number | null = null;
  let studentNumberColumn: number | null = null;
  let classNameColumn: number | null = null;
  let roleColumn: number | null = null;

  headers.forEach((rawHeader, index) => {
    const header = rawHeader.trim();
    if (!header) return;
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    if (roleColumn === null && isRoleHeader(normalized)) {
      roleColumn = index;
      return;
    }

    const textKey = classifyTextHeader(normalized);
    if (textKey === 'recipientName' && recipientNameColumn === null) {
      recipientNameColumn = index;
      return;
    }
    if (textKey === 'studentNumber' && studentNumberColumn === null) {
      studentNumberColumn = index;
      return;
    }
    if (textKey === 'className' && classNameColumn === null) {
      classNameColumn = index;
      return;
    }
  });

  return { recipientNameColumn, studentNumberColumn, classNameColumn, roleColumn };
}

export function inferSignatureMappingFromCsv(
  input: SignatureMappingInferenceInput,
): SignatureMappingInferenceResult {
  const warnings: string[] = [];
  const headers = input.headers.map((header) => header.trim());

  if (headers.length === 0) {
    return {
      mapping: EMPTY_MAPPING,
      participants: [],
      suggestedTemplateKind: 'custom',
      warnings: ['헤더 행을 찾지 못했습니다. 시트의 첫 행에 컬럼 이름이 있는지 확인해 주세요.'],
    };
  }

  const columns = inferParticipantColumns(headers, input.rows);

  if (columns.recipientNameColumn === null) {
    warnings.push('이름 컬럼을 찾지 못해 명단을 자동으로 채우지 못했습니다.');
  }

  const participants =
    columns.recipientNameColumn === null
      ? []
      : buildParticipantsFromRows({
          rows: input.rows,
          recipientNameColumn: columns.recipientNameColumn,
          studentNumberColumn: columns.studentNumberColumn,
          classNameColumn: columns.classNameColumn,
          roleColumn: columns.roleColumn,
        });

  const suggestedTemplateKind = pickTemplateKind(participants);

  return {
    mapping: EMPTY_MAPPING,
    participants,
    suggestedTemplateKind,
    warnings,
  };
}

function classifyTextHeader(normalized: string): SignatureTextFieldKey | null {
  for (const [key, patterns] of Object.entries(TEXT_KEYWORDS) as [
    SignatureTextFieldKey,
    readonly string[],
  ][]) {
    if (key === 'custom') continue;
    if (patterns.some((pattern) => matchesTextHeader(normalized, normalizeHeader(pattern)))) {
      return key;
    }
  }
  return null;
}

function isRoleHeader(normalized: string): boolean {
  return ROLE_HEADER_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeHeader(pattern);
    return normalized === normalizedPattern || normalized.includes(normalizedPattern);
  });
}

function matchesTextHeader(normalizedHeader: string, normalizedPattern: string): boolean {
  if (!normalizedPattern) return false;
  if (normalizedHeader === normalizedPattern) return true;
  if (normalizedHeader.includes(normalizedPattern)) return true;
  return false;
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function buildParticipantsFromRows({
  rows,
  recipientNameColumn,
  studentNumberColumn,
  classNameColumn,
  roleColumn,
}: {
  rows: readonly (readonly string[])[];
  recipientNameColumn: number;
  studentNumberColumn: number | null;
  classNameColumn: number | null;
  roleColumn: number | null;
}): SignatureParticipant[] {
  const participants: SignatureParticipant[] = [];
  rows.forEach((row, index) => {
    const rawName = row[recipientNameColumn]?.trim() ?? '';
    if (!rawName) return;
    const role = inferRoleFromRow({ row, roleColumn, studentNumberColumn });
    const studentNumber = readStudentNumber(row, studentNumberColumn);
    const className = classNameColumn !== null ? (row[classNameColumn]?.trim() ?? '') : '';
    participants.push({
      id: createParticipantId(index, rawName),
      displayName: rawName,
      role,
      studentNumber,
      className: className || undefined,
      requiredSignatureKinds: ['recipient'],
    });
  });
  return participants;
}

function inferRoleFromRow({
  row,
  roleColumn,
  studentNumberColumn,
}: {
  row: readonly string[];
  roleColumn: number | null;
  studentNumberColumn: number | null;
}): SignatureParticipantRole {
  if (roleColumn !== null) {
    const value = row[roleColumn]?.trim() ?? '';
    if (value && ROLE_KEYWORDS_TEACHER.some((keyword) => value.includes(keyword))) {
      return 'teacher';
    }
    if (value) return 'staff';
  }
  if (studentNumberColumn !== null) {
    const value = row[studentNumberColumn]?.trim() ?? '';
    if (value && /^\d+$/.test(value)) return 'student';
  }
  return 'staff';
}

function readStudentNumber(
  row: readonly string[],
  studentNumberColumn: number | null,
): number | undefined {
  if (studentNumberColumn === null) return undefined;
  const raw = row[studentNumberColumn]?.trim() ?? '';
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function createParticipantId(index: number, displayName: string): string {
  const safeName = displayName.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
  return `participant-${index + 1}-${safeName || 'unknown'}`;
}

/**
 * Phase 2C 리팩터: signature 슬롯이 없으므로 참여자 수와 역할 분포만으로 추정한다.
 *   - 참여자 1명 → `general-register`
 *   - 모두 teacher → `training-register`
 *   - 그 외 → `custom` (PDF 디자이너에서 교사가 명시적으로 선택)
 */
function pickTemplateKind(participants: readonly SignatureParticipant[]): SignatureTemplateKind {
  if (participants.length === 0) return 'custom';
  if (participants.length === 1) return 'general-register';
  const allTeacher = participants.every((p) => p.role === 'teacher');
  if (allTeacher) return 'training-register';
  return 'custom';
}
