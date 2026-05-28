/**
 * Phase 2C step 1: new entity types (PdfTemplate, SignatureRegion, ComposedPdf) are introduced
 * additively while keeping schemaVersion at 1. The bump to v2 + cascade refactor of consumers
 * is intentionally deferred to a focused follow-up session (see PRD US-2C-01 deferral note).
 */
export const SIGNATURE_REQUEST_SCHEMA_VERSION = 1;

export type SignatureTemplateKind =
  | 'general-register'
  | 'training-register'
  | 'absence-form'
  | 'notice-form'
  | 'custom';

export type SignatureTemplateSourceType = 'google-docs' | 'google-sheets' | 'pdf';

export interface SignatureTemplateSource {
  readonly type: SignatureTemplateSourceType;
  readonly url: string;
  readonly fileId?: string;
  readonly title?: string;
}

/**
 * Phase 2C target type — `'pdf-region'` is the canonical new value used by SignatureRegion-based layouts.
 *
 * @deprecated The legacy literals (`'docs-placeholder'`, `'sheets-cell'`, `'sheets-named-range'`,
 * `'generated-table-column'`) remain in this union ONLY so the v1→v2 migration shim and existing
 * fixtures continue to type-check. New code MUST use `'pdf-region'`. A follow-up commit will narrow
 * this union to `'pdf-region'` after all consumers are migrated (see plan US-2C-01 follow-up).
 */
export type SignatureMappingTargetType = 'pdf-region' | LegacySignatureMappingTargetType;

/** @deprecated Legacy v1 mapping targets retained for migration only. */
export type LegacySignatureMappingTargetType =
  | 'docs-placeholder'
  | 'sheets-cell'
  | 'sheets-named-range'
  | 'generated-table-column';

export interface SignatureMappingTarget {
  readonly type: SignatureMappingTargetType;
  readonly value: string;
  readonly sheetName?: string;
}

export type SignatureTextFieldKey =
  | 'recipientName'
  | 'studentNumber'
  | 'className'
  | 'absencePeriod'
  | 'absenceReason'
  | 'submittedAt'
  | 'signatureStatus'
  | 'custom';

export interface SignatureTextFieldMapping {
  readonly id: string;
  readonly key: SignatureTextFieldKey;
  readonly label: string;
  readonly target: SignatureMappingTarget;
  readonly required: boolean;
}

export type SignatureKind = 'recipient' | 'student' | 'parent' | 'guardian' | 'teacher';

export interface SignatureSlotMapping {
  readonly id: string;
  readonly kind: SignatureKind;
  readonly label: string;
  readonly target: SignatureMappingTarget;
  readonly required: boolean;
}

export interface SignatureTemplateMapping {
  readonly textFields: readonly SignatureTextFieldMapping[];
  readonly signatureSlots: readonly SignatureSlotMapping[];
}

export type SignatureParticipantRole =
  | 'teacher'
  | 'student'
  | 'parent'
  | 'guardian'
  | 'staff'
  | 'custom';

export interface SignatureParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly role: SignatureParticipantRole;
  readonly studentNumber?: number;
  readonly className?: string;
  readonly requiredSignatureKinds: readonly SignatureKind[];
  readonly uniqueLinkTokenHash?: string;
  readonly pinHash?: string;
}

export interface SignatureRequestAccessOptions {
  readonly uniqueLinksEnabled: boolean;
  readonly pinEnabled: boolean;
}

export type SignatureRequestStatus =
  | 'draft'
  | 'publishing'
  | 'active'
  | 'closed'
  | 'archived'
  | 'publish_failed';

/**
 * Phase 2C: metadata for a teacher-uploaded PDF template stored in Supabase Storage.
 */
export interface PdfTemplate {
  readonly storagePath: string;
  readonly pageCount: number;
  readonly fileSize: number;
  readonly uploadedAt: string;
}

/**
 * Phase 2C: rectangle on a PDF page in normalized 0~1 coordinates.
 * Origin is the top-left corner of the page; w/h are fractions of page width/height.
 */
export interface PdfRegionRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Phase 2C: a single signature region bound to a participant + signature kind.
 * Replaces SignatureSlotMapping for new PDF-overlay layouts. Auto-replicated regions
 * carry `autoReplicateRowSourceId` pointing to the first manually-drawn region in their row.
 */
export interface SignatureRegion {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: PdfRegionRect;
  readonly participantId: string;
  readonly signatureKind: SignatureKind;
  readonly autoReplicateRowSourceId?: string;
}

/**
 * Phase 2C: composition result tracking. A new version is written each time the teacher
 * presses '결과 PDF 생성'. Storage path follows `signature-results/{requestId}/v{version}.pdf`.
 */
export interface ComposedPdf {
  readonly requestId: string;
  readonly version: number;
  readonly storagePath: string;
  readonly composedAt: string;
  readonly submissionCount: number;
  readonly participantCount: number;
}

export interface SignatureImageRef {
  readonly storagePath: string;
  readonly mimeType: 'image/png' | 'image/webp';
  readonly sizeBytes: number;
}

export interface SignatureSubmission {
  readonly id: string;
  readonly participantId: string;
  readonly signatureKind: SignatureKind;
  readonly signerName: string;
  readonly submittedAt: string;
  readonly image: SignatureImageRef;
}

export interface SignatureRequestFirstReleaseScope {
  readonly legalEffect: 'none';
  readonly automaticReminders: false;
  readonly strongIdentityRequired: false;
}

export const SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE: SignatureRequestFirstReleaseScope = {
  legalEffect: 'none',
  automaticReminders: false,
  strongIdentityRequired: false,
};

export interface SignatureRequest {
  readonly schemaVersion: typeof SIGNATURE_REQUEST_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly templateKind: SignatureTemplateKind;
  readonly templateSource: SignatureTemplateSource;
  readonly mapping: SignatureTemplateMapping;
  /**
   * Phase 2C step 1: PDF template metadata. Optional during the additive-only step;
   * a follow-up commit makes this canonical (required for new drafts via builder).
   */
  readonly pdfTemplate?: PdfTemplate;
  /**
   * Phase 2C step 1: signature regions drawn on the PDF template. Optional during the
   * additive-only step; defaults to `[]` when omitted. Becomes required in follow-up.
   */
  readonly regions?: readonly SignatureRegion[];
  /**
   * Phase 2C step 1: increments each time regions are edited. Cache-bust segment in pre-render
   * Storage paths (`.../v{regionVersion}/page-{i}.png`). Optional during additive-only step.
   */
  readonly regionVersion?: number;
  readonly participants: readonly SignatureParticipant[];
  readonly submissions: readonly SignatureSubmission[];
  readonly access: SignatureRequestAccessOptions;
  readonly scope: SignatureRequestFirstReleaseScope;
  readonly status: SignatureRequestStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dueAt?: string;
  /**
   * @deprecated Phase 2C: prefer reading from a `ComposedPdf` entity via the
   * `getResultUrl(request)` helper in `useSignatureRequestStore`. This field is retained
   * solely for back-compat with v1 drafts created before Phase 2C. New compositions write
   * to `ComposedPdf` (Storage path `signature-results/{requestId}/v{version}.pdf`).
   */
  readonly resultFileUrl?: string;
}

export interface SignatureParticipantLocalAccessSecret {
  readonly participantId: string;
  readonly uniqueLinkToken?: string;
  readonly pin?: string;
}

export interface LocalSignatureRequestDraft {
  readonly request: SignatureRequest;
  readonly participantAccessSecrets: readonly SignatureParticipantLocalAccessSecret[];
}

export interface SignatureRequestDraftsData {
  readonly drafts: readonly LocalSignatureRequestDraft[];
}

export type SignatureParticipantStatus = 'unsigned' | 'partiallySigned' | 'signed';

export interface SignatureParticipantProgress {
  readonly participantId: string;
  readonly status: SignatureParticipantStatus;
  readonly submitted: number;
  readonly required: number;
}

export interface SignatureRequestProgress {
  readonly signedParticipants: number;
  readonly partialParticipants: number;
  readonly unsignedParticipants: number;
  readonly submittedSignatures: number;
  readonly requiredSignatures: number;
  readonly percentage: number;
}
