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
  PdfTemplate,
  SignatureKind,
  SignatureParticipantRole,
} from '@domain/entities/SignatureRequest';
import type {
  PageOrientation,
  PdfRejectCode,
  PdfWarnCode,
} from '@domain/rules/pdfTemplateValidation';

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
  // Phase 2C v2 (US-2C-10): PDF 오버레이 + pre-render 결과
  readonly pdfTemplate?: { readonly pageCount: number };
  readonly regions?: ReadonlyArray<{
    readonly id: string;
    readonly pageIndex: number;
    readonly rect: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
    readonly participantId: string;
    readonly signatureKind: string;
  }>;
  readonly pagePreviewUrls?: ReadonlyArray<{
    readonly pageIndex: number;
    readonly publicUrl: string;
  }>;
  readonly regionPreviewUrls?: ReadonlyArray<{
    readonly regionId: string;
    readonly publicUrl: string;
  }>;
  readonly regionVersion?: number;
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
          // Phase 2C v2: PDF 오버레이 메타 (optional, 양식 없는 요청은 undefined)
          pdfTemplate: payload.pdfTemplate,
          regions: payload.regions?.map((region) => ({
            id: region.id,
            pageIndex: region.pageIndex,
            rect: region.rect,
            participantId: region.participantId,
            signatureKind: normalizeSignatureKinds([region.signatureKind])[0] ?? 'recipient',
          })),
          pagePreviewUrls: payload.pagePreviewUrls,
          regionPreviewUrls: payload.regionPreviewUrls,
          regionVersion: payload.regionVersion,
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
        // Phase 2C v2 (US-2C-11): 4행 동의 표 로그 전송
        consentLog: draft.consentLog,
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

interface ValidatePdfUploadOkResponse {
  readonly ok: true;
  readonly pdfTemplate: PdfTemplate;
  readonly orientations: readonly PageOrientation[];
  readonly warning?: { readonly code: PdfWarnCode; readonly message: string };
}

interface ValidatePdfUploadRejectResponse {
  readonly ok: false;
  readonly code: PdfRejectCode;
  readonly message: string;
}

export type ValidatePdfUploadResponse =
  | ValidatePdfUploadOkResponse
  | ValidatePdfUploadRejectResponse;

interface UploadSignaturePreviewBody {
  readonly requestId: string;
  readonly regionVersion: number;
  readonly kind: 'page' | 'region';
  readonly pageIndex?: number;
  readonly regionId?: string;
  readonly base64Png: string;
}

export interface UploadSignaturePreviewResult {
  readonly storagePath: string;
  readonly publicUrl: string;
}

/**
 * `File` 또는 `Blob` 을 base64 (data URL 헤더 제거된) 문자열로 변환. FileReader API 사용.
 */
export async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader 결과가 문자열이 아닙니다.'));
        return;
      }
      resolve(result.replace(/^data:[^,]+,/, ''));
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

export class SupabaseSignatureAdminClient {
  /**
   * Phase 2C: 교사가 업로드한 PDF 양식을 validate-pdf-upload Edge Function 으로 전송.
   * Edge Function 이 검증 + Storage 업로드를 수행하고, 성공 시 PdfTemplate 메타를 반환.
   *
   * caller 는 `result.ok` 분기로 거절 안내 카피 (한국어) 또는 PdfTemplate 을 처리.
   * mixed-orientation 경고는 `result.ok === true && result.warning` 으로 받아서
   * 교사 confirm 프롬프트를 띄운다 (계속 진행은 PdfTemplate 으로 이미 가능).
   */
  async uploadPdfTemplate(file: File, teacherId?: string): Promise<ValidatePdfUploadResponse> {
    const { url, anonKey } = readSupabaseEnv();
    if (!url || !anonKey) {
      throw new Error('Supabase가 설정되지 않았습니다.');
    }
    const pdfBase64 = await fileToBase64(file);
    const response = await fetch(`${url}/functions/v1/validate-pdf-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        teacherId,
        fileName: file.name,
        pdfBase64,
      }),
    });
    // 응답 자체는 4xx (reject) 도 JSON body 를 담아서 보낸다. 5xx 만 throw.
    if (response.status >= 500) {
      const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw new Error(payload.error ?? `Edge Function 오류 (HTTP ${response.status})`);
    }
    const payload = (await response.json()) as ValidatePdfUploadResponse;
    return payload;
  }

  /**
   * Phase 2C v2: 클라이언트 사이드 pre-render 결과 (페이지 PNG / region cutout PNG) 를
   * signature-previews bucket 에 업로드. 학생 hot-path 는 반환된 publicUrl 을 직접 GET.
   */
  async uploadSignaturePreview(
    body: UploadSignaturePreviewBody,
  ): Promise<UploadSignaturePreviewResult> {
    return invokeEdgeFunction<UploadSignaturePreviewResult>('upload-signature-preview', body);
  }

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
      // Phase 2C v2: PDF 양식 + 좌표 기반 region 매핑을 함께 publish.
      // server 가 region.participantId 를 clientId → serverId 로 remap.
      pdfTemplate: draft.request.pdfTemplate,
      regions: draft.request.regions.map((region) => ({
        id: region.id,
        pageIndex: region.pageIndex,
        rect: region.rect,
        participantId: region.participantId,
        signatureKind: region.signatureKind,
        autoReplicateRowSourceId: region.autoReplicateRowSourceId,
      })),
      regionVersion: draft.request.regionVersion,
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
        regions: draft.request.regions.map((region) => ({
          ...region,
          participantId: serverIdByClientId.get(region.participantId) ?? region.participantId,
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
