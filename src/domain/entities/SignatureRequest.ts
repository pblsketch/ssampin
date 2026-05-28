/**
 * Phase 2C v2 (PRD US-2C-01 strict cascade): PDF 오버레이 + `SignatureRegion` 단일 매핑 모델.
 *
 * - `SIGNATURE_REQUEST_SCHEMA_VERSION` 가 2 로 bump 되었고, `SignatureRequest.regions` /
 *   `regionVersion` 가 필수 필드가 되었다.
 * - `SignatureMappingTargetType` 는 `'pdf-region'` 단일 literal 로 좁혀졌다. 4개 레거시
 *   타입(`'docs-placeholder'` / `'sheets-cell'` / `'sheets-named-range'` / `'generated-table-column'`)
 *   은 `LegacySignatureMappingTargetType` 와 `LegacySignatureRequest` 인터페이스에서만 사용된다.
 * - 로컬에 저장된 v1 draft 는 `signatureSchemaMigration.migrateV1ToV2()` 를 통해 자동으로 v2 로
 *   coerce 되며, repository load 시점에 write-back 된다 (US-2C-04).
 */
export const SIGNATURE_REQUEST_SCHEMA_VERSION = 2;

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
 * Phase 2C v2: canonical mapping target type. 좌표 기반 `SignatureRegion` 으로 모든
 * 매핑이 이동했기 때문에 단일 literal 만 남는다. 새 코드는 `SignatureRegion` 을 직접
 * 사용하고, `SignatureTemplateMapping.signatureSlots` / `textFields` 는 v1 호환을 위해
 * 빈 배열로 유지된다.
 */
export type SignatureMappingTargetType = 'pdf-region';

/**
 * v1 mapping 타깃 종류. `LegacySignatureRequest` 와 `migrateV1ToV2()` 내부에서만 사용된다.
 * 새 v2 코드에서 직접 참조 금지.
 */
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

/** v1 mapping 타깃. migration shim 안에서만 사용. */
export interface LegacySignatureMappingTarget {
  readonly type: LegacySignatureMappingTargetType;
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

/** v1 텍스트 필드 매핑. migration shim 안에서만 사용. */
export interface LegacySignatureTextFieldMapping {
  readonly id: string;
  readonly key: SignatureTextFieldKey;
  readonly label: string;
  readonly target: LegacySignatureMappingTarget;
  readonly required: boolean;
}

/** v1 서명 슬롯 매핑. migration shim 안에서만 사용. */
export interface LegacySignatureSlotMapping {
  readonly id: string;
  readonly kind: SignatureKind;
  readonly label: string;
  readonly target: LegacySignatureMappingTarget;
  readonly required: boolean;
}

export interface LegacySignatureTemplateMapping {
  readonly textFields: readonly LegacySignatureTextFieldMapping[];
  readonly signatureSlots: readonly LegacySignatureSlotMapping[];
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
  /**
   * Phase 2C v2: 항상 빈 객체 `{ textFields: [], signatureSlots: [] }` 로 유지된다.
   * 실제 매핑은 `regions` 에 저장된다. 이 필드는 v1 호환과 일부 미감각 검증 경로 보존용.
   */
  readonly mapping: SignatureTemplateMapping;
  /**
   * Phase 2C v2: 교사가 업로드한 PDF 양식 메타데이터. v1 draft 가 마이그레이션될 때 null
   * 일 수 있으므로 optional 유지. 새 v2 draft 는 PDF 업로드 직후 채워진다.
   */
  readonly pdfTemplate?: PdfTemplate;
  /**
   * Phase 2C v2: 좌표 기반 서명 영역. 매핑의 canonical 위치. 비어 있어도 OK (PDF 미업로드 + region 미설정 단계).
   */
  readonly regions: readonly SignatureRegion[];
  /**
   * Phase 2C v2: 디자이너에서 region 편집 시마다 증분. pre-render Storage 경로
   * `.../v{regionVersion}/page-{i}.png` 의 cache-bust 세그먼트.
   */
  readonly regionVersion: number;
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

/**
 * v1 `SignatureRequest` 스냅샷. `migrateV1ToV2()` 에서만 사용된다. 이전 운영 draft 가
 * v1 4가지 mapping target 타입을 그대로 가질 수 있도록 wide-mapping 타입을 허용한다.
 */
export interface LegacySignatureRequest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly templateKind: SignatureTemplateKind;
  readonly templateSource: SignatureTemplateSource;
  readonly mapping: LegacySignatureTemplateMapping;
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

export interface LegacyLocalSignatureRequestDraft {
  readonly request: LegacySignatureRequest;
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
