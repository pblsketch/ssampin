import type { SignatureKind } from '@domain/entities/SignatureRequest';

export type SignaturePublicLoadStatus = 'ready' | 'not-found' | 'not-configured' | 'error';
export type SignaturePublicSubmitStatus = 'accepted' | 'not-configured' | 'rejected' | 'error';

export interface SignaturePublicParticipantView {
  readonly id: string;
  readonly displayName: string;
  readonly requiredSignatureKinds: readonly SignatureKind[];
}

export interface SignaturePublicRequestView {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly participants: readonly SignaturePublicParticipantView[];
  readonly pinEnabled: boolean;
  readonly uniqueLinksEnabled: boolean;
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
