/**
 * 서명받기: Supabase Edge Function 클라이언트 (학생 공개 페이지 + 교사 발급 양쪽)
 *
 * - SupabaseSignaturePublicClient: 학생/학부모용 — get-signature-request-public / submit-signature
 * - SupabaseSignatureAdminClient: 교사용 — publish-signature-request
 *
 * 도메인 인터페이스 `SignaturePublicRequestClient`를 구현하며, 비-설정 환경에서는
 * `disabledSignaturePublicClient`로 폴백한다 (App.tsx에서 환경 감지).
 *
 * RLS가 모든 직접 접근을 차단하므로 모든 호출은 Edge Function 경유.
 */
import type {
  LoadSignaturePublicRequestParams,
  SignaturePublicLoadResult,
  SignaturePublicRequestClient,
  SignaturePublicSubmissionDraft,
  SignaturePublicSubmitResult,
} from '../../signature/SignatureRequestPublicClient';
import type { IssuedLinkSet } from '@domain/rules/signatureRequestPublication';
import { buildIssuedLinks } from '@domain/rules/signatureRequestPublication';
import type {
  LocalSignatureRequestDraft,
  SignatureKind,
  SignatureParticipantRole,
} from '@domain/entities/SignatureRequest';

interface ErrorResponse {
  readonly error?: string;
}

function readSupabaseEnv(): { url: string; anonKey: string } {
  const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
  const anonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = readSupabaseEnv();
  return Boolean(url) && Boolean(anonKey);
}

async function invokeEdgeFunction<T>(functionName: string, body: unknown): Promise<T> {
  const { url, anonKey } = readSupabaseEnv();
  if (!url || !anonKey) {
    throw new Error('Supabase가 설정되지 않았습니다.');
  }
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new Error(errorPayload.error ?? `Edge Function 오류 (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

interface PublicGetResponse {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly status: 'active' | 'closed';
  readonly dueAt?: string | null;
  readonly pinEnabled: boolean;
  readonly uniqueLinksEnabled: boolean;
  readonly participants: ReadonlyArray<{
    readonly id: string;
    readonly displayName: string;
    readonly requiredSignatureKinds: readonly string[];
  }>;
  readonly resolvedParticipantId?: string;
}

function normalizeSignatureKinds(values: readonly string[]): readonly SignatureKind[] {
  const allowed = new Set<SignatureKind>(['recipient', 'student', 'parent', 'guardian', 'teacher']);
  return values.filter((value): value is SignatureKind => allowed.has(value as SignatureKind));
}

export class SupabaseSignaturePublicClient implements SignaturePublicRequestClient {
  async loadRequest(params: LoadSignaturePublicRequestParams): Promise<SignaturePublicLoadResult> {
    if (!params.requestId.trim()) {
      return {
        status: 'error',
        message: '서명 요청 ID가 비어 있습니다.',
      };
    }
    try {
      const payload = await invokeEdgeFunction<PublicGetResponse>('get-signature-request-public', {
        requestId: params.requestId,
        token: params.token,
      });
      return {
        status: 'ready',
        request: {
          id: payload.id,
          title: payload.title,
          description: payload.description,
          pinEnabled: payload.pinEnabled,
          uniqueLinksEnabled: payload.uniqueLinksEnabled,
          participants: payload.participants.map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            requiredSignatureKinds: normalizeSignatureKinds(participant.requiredSignatureKinds),
          })),
        },
        resolvedParticipantId: payload.resolvedParticipantId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        message: message || '서명 요청을 불러오지 못했습니다.',
      };
    }
  }

  async submitSignature(
    draft: SignaturePublicSubmissionDraft,
  ): Promise<SignaturePublicSubmitResult> {
    try {
      const payload = await invokeEdgeFunction<{ submissionId: string }>('submit-signature', {
        requestId: draft.requestId,
        participantId: draft.participantId,
        token: draft.token,
        pin: draft.pin,
        signatureKind: draft.signatureKind,
        signerName: draft.signerName,
        signatureImageDataUrl: draft.signatureImageDataUrl,
      });
      return { status: 'accepted', submissionId: payload.submissionId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'rejected',
        message: message || '서명 제출에 실패했습니다.',
      };
    }
  }
}

interface PublishParticipantResponse {
  readonly id: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly studentNumber?: number;
}

interface PublishResponse {
  readonly requestId: string;
  readonly adminKey: string;
  readonly participants: readonly PublishParticipantResponse[];
}

export interface PublishDraftResult {
  readonly requestId: string;
  readonly adminKey: string;
  readonly issuedLinks: IssuedLinkSet;
}

function normalizeRole(role: string): SignatureParticipantRole {
  const allowed: readonly SignatureParticipantRole[] = [
    'teacher',
    'student',
    'parent',
    'guardian',
    'staff',
    'custom',
  ];
  return (allowed as readonly string[]).includes(role)
    ? (role as SignatureParticipantRole)
    : 'staff';
}

export class SupabaseSignatureAdminClient {
  async publishDraft(
    draft: LocalSignatureRequestDraft,
    baseUrl: string,
  ): Promise<PublishDraftResult> {
    const tokenByParticipantId = new Map<string, string | undefined>();
    const pinByParticipantId = new Map<string, string | undefined>();
    for (const secret of draft.participantAccessSecrets) {
      tokenByParticipantId.set(secret.participantId, secret.uniqueLinkToken);
      pinByParticipantId.set(secret.participantId, secret.pin);
    }
    const payload = await invokeEdgeFunction<PublishResponse>('publish-signature-request', {
      title: draft.request.title,
      description: draft.request.description,
      templateKind: draft.request.templateKind,
      templateSource: draft.request.templateSource,
      mapping: draft.request.mapping,
      access: draft.request.access,
      participants: draft.request.participants.map((participant) => ({
        clientId: participant.id,
        displayName: participant.displayName,
        role: participant.role,
        studentNumber: participant.studentNumber,
        className: participant.className,
        requiredSignatureKinds: participant.requiredSignatureKinds,
        uniqueLinkToken: tokenByParticipantId.get(participant.id),
        pin: pinByParticipantId.get(participant.id),
      })),
    });

    const serverIdByClientId = new Map(
      payload.participants.map((entry) => [entry.clientId, entry.id]),
    );

    const remappedDraft: LocalSignatureRequestDraft = {
      request: {
        ...draft.request,
        id: payload.requestId,
        status: 'active',
        participants: draft.request.participants.map((participant) => ({
          ...participant,
          id: serverIdByClientId.get(participant.id) ?? participant.id,
          role: normalizeRole(participant.role),
        })),
      },
      participantAccessSecrets: draft.participantAccessSecrets.map((secret) => ({
        ...secret,
        participantId: serverIdByClientId.get(secret.participantId) ?? secret.participantId,
      })),
    };

    const issuedLinks = buildIssuedLinks({ draft: remappedDraft, baseUrl });
    return {
      requestId: payload.requestId,
      adminKey: payload.adminKey,
      issuedLinks,
    };
  }
}
