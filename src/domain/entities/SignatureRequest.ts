export const SIGNATURE_REQUEST_SCHEMA_VERSION = 1;

export type SignatureTemplateKind =
  | 'general-register'
  | 'training-register'
  | 'absence-form'
  | 'notice-form'
  | 'custom';

export type SignatureTemplateSourceType = 'google-docs' | 'google-sheets';

export interface SignatureTemplateSource {
  readonly type: SignatureTemplateSourceType;
  readonly url: string;
  readonly fileId?: string;
  readonly title?: string;
}

export type SignatureMappingTargetType =
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

export type SignatureRequestStatus = 'draft' | 'active' | 'closed' | 'archived';

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
  readonly participants: readonly SignatureParticipant[];
  readonly submissions: readonly SignatureSubmission[];
  readonly access: SignatureRequestAccessOptions;
  readonly scope: SignatureRequestFirstReleaseScope;
  readonly status: SignatureRequestStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dueAt?: string;
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
