import type {
  SignatureMappingTarget,
  SignatureSlotMapping,
  SignatureTemplateMapping,
  SignatureTemplateSource,
  SignatureTextFieldMapping,
} from '@domain/entities/SignatureRequest';

export type SignatureImageUrlDurability = 'durable-public' | 'signed-short-lived' | 'private';

export interface SignatureImageUrlRef {
  readonly url: string;
  readonly durability: SignatureImageUrlDurability;
}

export interface SignatureWritebackSubmission {
  readonly id: string;
  readonly participantId: string;
  readonly signatureKind: string;
  readonly signerName: string;
  readonly submittedAt: string;
  readonly imageUrl?: SignatureImageUrlRef;
}

export interface SheetsValueUpdatePlan {
  readonly range: string;
  readonly values: readonly (string | number | boolean)[][];
  readonly valueInputOption: 'USER_ENTERED' | 'RAW';
  readonly reason: string;
}

export interface DocsBatchRequestPlan {
  readonly requestType: 'replaceAllText' | 'insertInlineImage';
  readonly placeholder: string;
  readonly imageUrl?: string;
  readonly reason: string;
}

export interface SignatureGoogleWritebackPlan {
  readonly templateFileId: string | null;
  readonly resultCopy: {
    readonly api: 'drive.files.copy';
    readonly feasible: boolean;
    readonly requiredScopes: readonly string[];
  };
  readonly sheetsValueUpdates: readonly SheetsValueUpdatePlan[];
  readonly docsBatchRequests: readonly DocsBatchRequestPlan[];
  readonly warnings: readonly string[];
}

export const SIGNATURE_GOOGLE_SPIKE_SOURCES = [
  'https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy',
  'https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update',
  'https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request',
  'https://support.google.com/docs/answer/3093333',
] as const;

export function extractGoogleFileId(url: string): string | null {
  const trimmed = url.trim();
  const directMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (directMatch?.[1]) return directMatch[1];

  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get('id');
  } catch {
    return null;
  }
}

export function buildSheetsImageFormula(
  imageUrl: SignatureImageUrlRef,
  width = 180,
  height = 60,
): { formula?: string; warning?: string } {
  const feasibility = checkSheetsImageFormulaFeasibility(imageUrl);
  if (!feasibility.feasible) return { warning: feasibility.reason };
  const escapedUrl = imageUrl.url.replaceAll('"', '""');
  return { formula: `=IMAGE("${escapedUrl}",4,${height},${width})` };
}

export function checkSheetsImageFormulaFeasibility(imageUrl: SignatureImageUrlRef): {
  feasible: boolean;
  reason?: string;
} {
  if (!/^https?:\/\//.test(imageUrl.url)) {
    return { feasible: false, reason: 'Sheets IMAGE 함수는 http/https URL이 필요합니다.' };
  }
  const host = safeHost(imageUrl.url);
  if (host === 'drive.google.com' || host.endsWith('.drive.google.com')) {
    return {
      feasible: false,
      reason: 'Google Sheets IMAGE 함수는 drive.google.com 호스팅 URL을 직접 사용할 수 없습니다.',
    };
  }
  if (imageUrl.durability !== 'durable-public') {
    return {
      feasible: false,
      reason:
        'Sheets IMAGE 함수는 셀 렌더링 시 URL을 다시 참조하므로 만료되는 signed URL이나 private URL은 내구성이 부족합니다.',
    };
  }
  return { feasible: true };
}

export function planSignatureGoogleWriteback({
  templateSource,
  mapping,
  submissions,
}: {
  readonly templateSource: SignatureTemplateSource;
  readonly mapping: SignatureTemplateMapping;
  readonly submissions: readonly SignatureWritebackSubmission[];
}): SignatureGoogleWritebackPlan {
  const warnings: string[] = [];
  const sheetsValueUpdates: SheetsValueUpdatePlan[] = [];
  const docsBatchRequests: DocsBatchRequestPlan[] = [];

  if (templateSource.type === 'google-sheets') {
    for (const field of mapping.textFields) {
      const update = planSheetsTextField(field, submissions[0]);
      if (update) sheetsValueUpdates.push(update);
    }
    for (const slot of mapping.signatureSlots) {
      for (const submission of submissions.filter((item) => item.signatureKind === slot.kind)) {
        const update = planSheetsSignatureSlot(slot, submission);
        if (update.update) sheetsValueUpdates.push(update.update);
        if (update.warning) warnings.push(update.warning);
      }
    }
  } else {
    for (const field of mapping.textFields) {
      const request = planDocsTextField(field, submissions[0]);
      if (request) docsBatchRequests.push(request);
    }
    for (const slot of mapping.signatureSlots) {
      for (const submission of submissions.filter((item) => item.signatureKind === slot.kind)) {
        const request = planDocsSignatureSlot(slot, submission);
        if (request.request) docsBatchRequests.push(request.request);
        if (request.warning) warnings.push(request.warning);
      }
    }
  }

  return {
    templateFileId: extractGoogleFileId(templateSource.url),
    resultCopy: {
      api: 'drive.files.copy',
      feasible: extractGoogleFileId(templateSource.url) !== null,
      requiredScopes: ['https://www.googleapis.com/auth/drive.file'],
    },
    sheetsValueUpdates,
    docsBatchRequests,
    warnings,
  };
}

function planSheetsTextField(
  field: SignatureTextFieldMapping,
  submission: SignatureWritebackSubmission | undefined,
): SheetsValueUpdatePlan | null {
  if (!submission) return null;
  const range = toSheetsRange(field.target);
  if (!range) return null;
  return {
    range,
    values: [[textFieldValue(field, submission)]],
    valueInputOption: 'USER_ENTERED',
    reason: `${field.label} 텍스트 값을 Sheets 범위에 씁니다.`,
  };
}

function planSheetsSignatureSlot(
  slot: SignatureSlotMapping,
  submission: SignatureWritebackSubmission,
): { update?: SheetsValueUpdatePlan; warning?: string } {
  const range = toSheetsRange(slot.target);
  if (!range) return { warning: `${slot.label} 서명 위치가 Sheets 범위가 아닙니다.` };
  if (!submission.imageUrl) return { warning: `${slot.label} 서명 이미지 URL이 없습니다.` };

  const formula = buildSheetsImageFormula(submission.imageUrl);
  if (!formula.formula) return { warning: formula.warning };

  return {
    update: {
      range,
      values: [[formula.formula]],
      valueInputOption: 'USER_ENTERED',
      reason: `${slot.label} 서명을 IMAGE 함수로 셀에 표시합니다.`,
    },
  };
}

function planDocsTextField(
  field: SignatureTextFieldMapping,
  submission: SignatureWritebackSubmission | undefined,
): DocsBatchRequestPlan | null {
  if (!submission || field.target.type !== 'docs-placeholder') return null;
  return {
    requestType: 'replaceAllText',
    placeholder: field.target.value,
    reason: `${field.label} 치환자를 제출 값으로 바꿉니다: ${textFieldValue(field, submission)}`,
  };
}

function planDocsSignatureSlot(
  slot: SignatureSlotMapping,
  submission: SignatureWritebackSubmission,
): { request?: DocsBatchRequestPlan; warning?: string } {
  if (slot.target.type !== 'docs-placeholder') {
    return { warning: `${slot.label} 서명 위치가 Docs 치환자가 아닙니다.` };
  }
  if (!submission.imageUrl) return { warning: `${slot.label} 서명 이미지 URL이 없습니다.` };
  if (submission.imageUrl.durability === 'private') {
    return { warning: 'Docs inline image 삽입은 Google이 접근 가능한 URL이 필요합니다.' };
  }
  return {
    request: {
      requestType: 'insertInlineImage',
      placeholder: slot.target.value,
      imageUrl: submission.imageUrl.url,
      reason:
        'Docs API는 삽입 시점에 이미지를 가져와 문서에 복사하므로, 삽입 중 접근 가능한 signed URL 전략이 가능 후보입니다.',
    },
  };
}

function toSheetsRange(target: SignatureMappingTarget): string | null {
  if (target.type === 'sheets-cell' || target.type === 'sheets-named-range') {
    return target.sheetName ? `${quoteSheetName(target.sheetName)}!${target.value}` : target.value;
  }
  if (target.type === 'generated-table-column') {
    return target.value;
  }
  return null;
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replaceAll("'", "''")}'`;
}

function textFieldValue(
  field: SignatureTextFieldMapping,
  submission: SignatureWritebackSubmission,
): string {
  if (field.key === 'submittedAt') return submission.submittedAt;
  if (field.key === 'recipientName') return submission.signerName;
  return '';
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
