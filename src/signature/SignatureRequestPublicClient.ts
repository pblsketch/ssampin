import type { PdfRegionRect, SignatureKind } from '@domain/entities/SignatureRequest';
import type { PrivacyConsentLogEntry } from './PrivacyConsentTable';

export type SignaturePublicLoadStatus = 'ready' | 'not-found' | 'not-configured' | 'error';
export type SignaturePublicSubmitStatus = 'accepted' | 'not-configured' | 'rejected' | 'error';

export interface SignaturePublicParticipantView {
  readonly id: string;
  readonly displayName: string;
  readonly requiredSignatureKinds: readonly SignatureKind[];
}

/**
 * Phase 2C v2: 학생 페이지 표시용 region 메타 (참여자 매핑 + 좌표).
 * `participantId` 는 server UUID (publish 시 clientId → serverId remap 됨).
 */
export interface SignaturePublicRegionView {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: PdfRegionRect;
  readonly participantId: string;
  readonly signatureKind: SignatureKind;
}

export interface SignaturePublicPagePreview {
  readonly pageIndex: number;
  readonly publicUrl: string;
}

export interface SignaturePublicRegionPreview {
  readonly regionId: string;
  readonly publicUrl: string;
}

export interface SignaturePublicRequestView {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly participants: readonly SignaturePublicParticipantView[];
  readonly pinEnabled: boolean;
  readonly uniqueLinksEnabled: boolean;
  /** Phase 2C v2: PDF 양식이 있을 때만 채워진다. 페이지 수만 노출 (storagePath 등 내부 메타 비노출). */
  readonly pdfTemplate?: { readonly pageCount: number };
  /** Phase 2C v2: signature-previews bucket 의 페이지 PNG publicUrls (pageCount 만큼). */
  readonly pagePreviewUrls?: readonly SignaturePublicPagePreview[];
  /** Phase 2C v2: signature-previews bucket 의 region cutout PNG publicUrls. */
  readonly regionPreviewUrls?: readonly SignaturePublicRegionPreview[];
  /** Phase 2C v2: 좌표 기반 region 목록 (학생 페이지에서 본인 칸 강조용). */
  readonly regions?: readonly SignaturePublicRegionView[];
  /** Phase 2C v2: region revision counter — preview cache-bust 용도. */
  readonly regionVersion?: number;
}

export interface LoadSignaturePublicRequestParams {
  readonly requestId: string;
  readonly token?: string;
}

export type SignaturePublicLoadResult =
  | {
      readonly status: 'ready';
      readonly request: SignaturePublicRequestView;
      readonly resolvedParticipantId?: string;
    }
  | {
      readonly status: Exclude<SignaturePublicLoadStatus, 'ready'>;
      readonly message: string;
    };

export interface SignaturePublicSubmissionDraft {
  readonly requestId: string;
  readonly participantId?: string;
  readonly token?: string;
  readonly pin?: string;
  readonly signatureKind: SignatureKind;
  readonly signerName: string;
  readonly signatureImageDataUrl: string;
  readonly submittedAt: string;
  /**
   * Phase 2C v2 (US-2C-11): 학생 페이지 4행 동의 표 결과 로그.
   * 4 개 모두 체크되었을 때만 채워지며, submit-signature 가 consent_log + consent_ip_hash 로 저장한다.
   */
  readonly consentLog?: readonly PrivacyConsentLogEntry[];
}

export type SignaturePublicSubmitResult =
  | {
      readonly status: 'accepted';
      readonly submissionId: string;
    }
  | {
      readonly status: Exclude<SignaturePublicSubmitStatus, 'accepted'>;
      readonly message: string;
    };

export interface SignaturePublicRequestClient {
  loadRequest(params: LoadSignaturePublicRequestParams): Promise<SignaturePublicLoadResult>;
  submitSignature(draft: SignaturePublicSubmissionDraft): Promise<SignaturePublicSubmitResult>;
}

export const disabledSignaturePublicClient: SignaturePublicRequestClient = {
  async loadRequest() {
    return {
      status: 'not-configured',
      message:
        '아직 서명을 받을 준비가 끝나지 않은 화면이에요. 링크가 맞는지 선생님께 다시 확인해 주세요.',
    };
  },

  async submitSignature() {
    return {
      status: 'not-configured',
      message: '지금은 서명 제출이 열려 있지 않아요. 선생님이 링크를 발급한 뒤 다시 시도해 주세요.',
    };
  },
};
