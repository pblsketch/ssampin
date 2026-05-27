/**
 * 서명받기 공개 링크 발급 도메인 함수.
 *
 * `access.uniqueLinksEnabled` 정책에 따라 두 가지 모드 중 하나로 발급한다:
 *   - 공통 링크 (common): 모두 같은 URL을 받고 명단에서 본인을 선택한다.
 *   - 개별 링크 (per-participant): 각자 다른 토큰이 포함된 URL을 받는다.
 *
 * PIN 옵션이 켜지면 개별 링크 모드에서 교사가 학생/학부모에게 별도 채널로
 * 안내할 PIN이 함께 포함된다 (URL에는 절대 포함되지 않는다).
 *
 * 순수 함수. 외부 의존 없음.
 */

import type { LocalSignatureRequestDraft } from '@domain/entities/SignatureRequest';

export type IssuedLinkMode = 'common' | 'per-participant';

export interface IssuedParticipantLink {
  readonly participantId: string;
  readonly displayName: string;
  readonly url: string;
  readonly pin?: string;
}

export interface IssuedLinkSet {
  readonly mode: IssuedLinkMode;
  readonly commonUrl?: string;
  readonly participantLinks?: readonly IssuedParticipantLink[];
}

export interface BuildIssuedLinksInput {
  readonly draft: LocalSignatureRequestDraft;
  readonly baseUrl: string;
}

export function buildIssuedLinks({ draft, baseUrl }: BuildIssuedLinksInput): IssuedLinkSet {
  const requestId = draft.request.id;
  const normalizedBase = stripTrailingSlash(baseUrl);

  if (!draft.request.access.uniqueLinksEnabled) {
    return {
      mode: 'common',
      commonUrl: buildSignUrl(normalizedBase, requestId),
    };
  }

  const pinByParticipantId = new Map<string, string>();
  for (const secret of draft.participantAccessSecrets) {
    if (draft.request.access.pinEnabled && secret.pin) {
      pinByParticipantId.set(secret.participantId, secret.pin);
    }
  }
  const tokenByParticipantId = new Map<string, string>();
  for (const secret of draft.participantAccessSecrets) {
    if (secret.uniqueLinkToken) {
      tokenByParticipantId.set(secret.participantId, secret.uniqueLinkToken);
    }
  }

  const participantLinks = draft.request.participants.map((participant) => {
    const token = tokenByParticipantId.get(participant.id);
    return {
      participantId: participant.id,
      displayName: participant.displayName,
      url: token
        ? buildSignUrl(normalizedBase, requestId, token)
        : buildSignUrl(normalizedBase, requestId),
      pin: pinByParticipantId.get(participant.id),
    };
  });

  return {
    mode: 'per-participant',
    participantLinks,
  };
}

export function formatIssuedLinksAsText(issued: IssuedLinkSet, requestTitle: string): string {
  if (issued.mode === 'common') {
    if (!issued.commonUrl) return '';
    return [
      `${requestTitle} 서명 링크`,
      issued.commonUrl,
      '아래 명단에서 본인을 선택해 서명해 주세요.',
    ].join('\n');
  }

  const rows = (issued.participantLinks ?? []).map((link) => {
    const pinSegment = link.pin ? ` (PIN: ${link.pin})` : '';
    return `- ${link.displayName}${pinSegment}\n  ${link.url}`;
  });
  if (rows.length === 0) return '';
  return [`${requestTitle} 개인 서명 링크`, ...rows].join('\n');
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildSignUrl(baseUrl: string, requestId: string, token?: string): string {
  const encodedId = encodeURIComponent(requestId);
  const path = `${baseUrl}/sign/${encodedId}`;
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}
