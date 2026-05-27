/**
 * Google Sheets CSV에서 추출한 헤더와 데이터 행을 보고
 * 서명받기 매핑·명단·시나리오를 자동으로 추정한다.
 *
 * 순수 함수. Electron/Network API에 의존하지 않는다.
 */

import type {
  SignatureKind,
  SignatureMappingTarget,
  SignatureParticipant,
  SignatureParticipantRole,
  SignatureSlotMapping,
  SignatureTemplateKind,
  SignatureTemplateMapping,
  SignatureTextFieldKey,
  SignatureTextFieldMapping,
} from '@domain/entities/SignatureRequest';

export interface SignatureMappingInferenceInput {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface SignatureMappingInferenceResult {
  readonly mapping: SignatureTemplateMapping;
  readonly participants: readonly SignatureParticipant[];
  readonly suggestedTemplateKind: SignatureTemplateKind;
  readonly warnings: readonly string[];
}

interface HeaderClassification {
  readonly kind:
    | { type: 'text'; key: SignatureTextFieldKey }
    | { type: 'signature'; kind: SignatureKind }
    | { type: 'role' }
    | { type: 'custom' };
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

const SIGNATURE_KEYWORDS: { kind: SignatureKind; patterns: readonly string[] }[] = [
  // 학생/학부모/교사 등 한정자가 붙은 서명은 먼저 매칭한다 (recipient 일반 서명보다 우선).
  { kind: 'parent', patterns: ['학부모서명', '보호자서명', '부모서명'] },
  { kind: 'student', patterns: ['학생서명', '본인서명'] },
  { kind: 'teacher', patterns: ['교사서명', '담임서명'] },
  { kind: 'guardian', patterns: ['보호자서명'] },
  { kind: 'recipient', patterns: ['서명', '사인', '서명(정자)'] },
];

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

export function inferSignatureMappingFromCsv(
  input: SignatureMappingInferenceInput,
): SignatureMappingInferenceResult {
  const warnings: string[] = [];
  const headers = input.headers.map((header) => header.trim());

  if (headers.length === 0) {
    return {
      mapping: { textFields: [], signatureSlots: [] },
      participants: [],
      suggestedTemplateKind: 'custom',
      warnings: ['헤더 행을 찾지 못했습니다. 시트의 첫 행에 컬럼 이름이 있는지 확인해 주세요.'],
    };
  }

  const classifications = headers.map((header) => classifyHeader(header));

  const textFields: SignatureTextFieldMapping[] = [];
  const signatureSlots: SignatureSlotMapping[] = [];
  const seenSignatureKinds = new Set<SignatureKind>();
  let recipientNameColumn: number | null = null;
  let studentNumberColumn: number | null = null;
  let classNameColumn: number | null = null;
  let roleColumn: number | null = null;

  classifications.forEach((classification, index) => {
    const header = headers[index]!;
    if (!header) return;
    const target: SignatureMappingTarget = {
      type: 'generated-table-column',
      value: header,
    };

    if (classification.kind.type === 'signature') {
      if (seenSignatureKinds.has(classification.kind.kind)) {
        warnings.push(`서명 컬럼 "${header}"이(가) 중복되어 첫 번째만 사용했습니다.`);
        return;
      }
      seenSignatureKinds.add(classification.kind.kind);
      signatureSlots.push({
        id: `slot-inferred-${index + 1}`,
        kind: classification.kind.kind,
        label: header,
        required: true,
        target,
      });
      return;
    }

    if (classification.kind.type === 'role') {
      roleColumn = index;
      return;
    }

    if (classification.kind.type === 'text') {
      const key = classification.kind.key;
      if (key === 'recipientName') recipientNameColumn = index;
      if (key === 'studentNumber') studentNumberColumn = index;
      if (key === 'className') classNameColumn = index;
      textFields.push({
        id: `field-inferred-${index + 1}`,
        key,
        label: header,
        required: key === 'recipientName',
        target,
      });
      return;
    }

    textFields.push({
      id: `field-inferred-${index + 1}`,
      key: 'custom',
      label: header,
      required: false,
      target,
    });
  });

  if (signatureSlots.length === 0) {
    warnings.push(
      '서명 컬럼을 찾지 못했습니다. 시트에 "서명" 또는 "학생서명/학부모서명" 같은 컬럼이 있는지 확인해 주세요.',
    );
  }

  if (recipientNameColumn === null) {
    warnings.push('이름 컬럼을 찾지 못해 명단을 자동으로 채우지 못했습니다.');
  }

  const participants =
    recipientNameColumn === null
      ? []
      : buildParticipantsFromRows({
          rows: input.rows,
          recipientNameColumn,
          studentNumberColumn,
          classNameColumn,
          roleColumn,
        });

  const suggestedTemplateKind = pickTemplateKind(seenSignatureKinds, participants.length);

  return {
    mapping: { textFields, signatureSlots },
    participants,
    suggestedTemplateKind,
    warnings,
  };
}

function classifyHeader(header: string): HeaderClassification {
  const normalized = normalizeHeader(header);
  if (!normalized) return { kind: { type: 'custom' } };

  for (const { kind, patterns } of SIGNATURE_KEYWORDS) {
    if (patterns.some((pattern) => normalized.includes(normalizeHeader(pattern)))) {
      return { kind: { type: 'signature', kind } };
    }
  }

  for (const pattern of ROLE_HEADER_PATTERNS) {
    if (normalized === normalizeHeader(pattern) || normalized.includes(normalizeHeader(pattern))) {
      return { kind: { type: 'role' } };
    }
  }

  for (const [key, patterns] of Object.entries(TEXT_KEYWORDS) as [
    SignatureTextFieldKey,
    readonly string[],
  ][]) {
    if (key === 'custom') continue;
    if (patterns.some((pattern) => matchesTextHeader(normalized, normalizeHeader(pattern)))) {
      return { kind: { type: 'text', key } };
    }
  }

  return { kind: { type: 'custom' } };
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

function pickTemplateKind(
  signatureKinds: ReadonlySet<SignatureKind>,
  participantCount: number,
): SignatureTemplateKind {
  const hasStudent = signatureKinds.has('student');
  const hasParent = signatureKinds.has('parent');
  if (hasStudent && hasParent) return 'absence-form';
  if (hasParent && !hasStudent) return 'notice-form';
  if (signatureKinds.size === 1 && participantCount >= 2) return 'training-register';
  if (signatureKinds.size === 1 && participantCount <= 1) return 'general-register';
  return 'custom';
}
