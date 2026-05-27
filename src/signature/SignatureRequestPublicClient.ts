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
      message: '아직 Supabase 공개 서명 계약이 연결되지 않았습니다.',
    };
  },

  async submitSignature() {
    return {
      status: 'not-configured',
      message: '서명 제출 저장은 Supabase 계약 연결 후 활성화됩니다.',
    };
  },
};
