import { describe, expect, it } from 'vitest';
import { buildIssuedLinks, formatIssuedLinksAsText } from './signatureRequestPublication';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LocalSignatureRequestDraft,
} from '@domain/entities/SignatureRequest';

function makeDraft(overrides: {
  uniqueLinksEnabled: boolean;
  pinEnabled: boolean;
  participants: ReadonlyArray<{ id: string; displayName: string }>;
  secrets: ReadonlyArray<{ participantId: string; token?: string; pin?: string }>;
}): LocalSignatureRequestDraft {
  return {
    request: {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id: 'request-1',
      title: '3월 교직원 연수 등록부',
      templateKind: 'training-register',
      templateSource: { type: 'google-sheets', url: 'https://docs.google.com/...' },
      mapping: { textFields: [], signatureSlots: [] },
      participants: overrides.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        role: 'staff',
        requiredSignatureKinds: ['recipient'],
      })),
      submissions: [],
      access: {
        uniqueLinksEnabled: overrides.uniqueLinksEnabled,
        pinEnabled: overrides.pinEnabled,
      },
      scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
      status: 'draft',
      createdAt: '2026-05-27T00:00:00Z',
      updatedAt: '2026-05-27T00:00:00Z',
    },
    participantAccessSecrets: overrides.secrets.map((s) => ({
      participantId: s.participantId,
      uniqueLinkToken: s.token,
      pin: s.pin,
    })),
  };
}

describe('buildIssuedLinks', () => {
  it('공통 모드: uniqueLinksEnabled=false → 단일 commonUrl만 반환', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: false,
      pinEnabled: false,
      participants: [
        { id: 'p1', displayName: '홍길동' },
        { id: 'p2', displayName: '김민서' },
      ],
      secrets: [],
    });

    const issued = buildIssuedLinks({ draft, baseUrl: 'https://sign.ssampin.app' });
    expect(issued.mode).toBe('common');
    expect(issued.commonUrl).toBe('https://sign.ssampin.app/sign/request-1');
    expect(issued.participantLinks).toBeUndefined();
  });

  it('개별 모드: 각 participant에 토큰 URL이 발급되고 commonUrl은 없음', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: true,
      pinEnabled: false,
      participants: [
        { id: 'p1', displayName: '홍길동' },
        { id: 'p2', displayName: '김민서' },
      ],
      secrets: [
        { participantId: 'p1', token: 'tok-a' },
        { participantId: 'p2', token: 'tok-b' },
      ],
    });

    const issued = buildIssuedLinks({ draft, baseUrl: 'https://sign.ssampin.app/' });
    expect(issued.mode).toBe('per-participant');
    expect(issued.commonUrl).toBeUndefined();
    expect(issued.participantLinks).toEqual([
      {
        participantId: 'p1',
        displayName: '홍길동',
        url: 'https://sign.ssampin.app/sign/request-1?token=tok-a',
        pin: undefined,
      },
      {
        participantId: 'p2',
        displayName: '김민서',
        url: 'https://sign.ssampin.app/sign/request-1?token=tok-b',
        pin: undefined,
      },
    ]);
  });

  it('개별+PIN 모드: PIN 값이 각 링크에 포함되지만 URL에는 들어가지 않는다', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: true,
      pinEnabled: true,
      participants: [{ id: 'p1', displayName: '홍길동' }],
      secrets: [{ participantId: 'p1', token: 'tok-a', pin: '482917' }],
    });

    const issued = buildIssuedLinks({ draft, baseUrl: 'https://sign.ssampin.app' });
    expect(issued.mode).toBe('per-participant');
    expect(issued.participantLinks?.[0]).toMatchObject({
      participantId: 'p1',
      pin: '482917',
      url: 'https://sign.ssampin.app/sign/request-1?token=tok-a',
    });
    expect(issued.participantLinks?.[0]?.url).not.toContain('482917');
  });

  it('pinEnabled=false면 secret.pin이 있어도 발급 결과에서 무시한다', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: true,
      pinEnabled: false,
      participants: [{ id: 'p1', displayName: '홍길동' }],
      secrets: [{ participantId: 'p1', token: 'tok-a', pin: '999999' }],
    });

    const issued = buildIssuedLinks({ draft, baseUrl: 'https://sign.ssampin.app' });
    expect(issued.participantLinks?.[0]?.pin).toBeUndefined();
  });

  it('개별 모드인데 token이 없는 participant는 토큰 없는 URL로 폴백한다 (안전)', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: true,
      pinEnabled: false,
      participants: [{ id: 'p1', displayName: '홍길동' }],
      secrets: [],
    });

    const issued = buildIssuedLinks({ draft, baseUrl: 'https://sign.ssampin.app' });
    expect(issued.participantLinks?.[0]?.url).toBe('https://sign.ssampin.app/sign/request-1');
  });

  it('baseUrl 끝의 슬래시는 제거된다', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: false,
      pinEnabled: false,
      participants: [],
      secrets: [],
    });
    const issued = buildIssuedLinks({ draft, baseUrl: 'http://localhost:5173/' });
    expect(issued.commonUrl).toBe('http://localhost:5173/sign/request-1');
  });

  it('requestId에 특수문자가 들어가면 URL 인코딩된다', () => {
    const draft = makeDraft({
      uniqueLinksEnabled: false,
      pinEnabled: false,
      participants: [],
      secrets: [],
    });
    const draftWithSpace: LocalSignatureRequestDraft = {
      ...draft,
      request: { ...draft.request, id: 'req with space' },
    };
    const issued = buildIssuedLinks({ draft: draftWithSpace, baseUrl: 'https://x.io' });
    expect(issued.commonUrl).toBe('https://x.io/sign/req%20with%20space');
  });
});

describe('formatIssuedLinksAsText', () => {
  it('공통 모드: 안내 + URL을 텍스트로 정렬', () => {
    const text = formatIssuedLinksAsText(
      { mode: 'common', commonUrl: 'https://x.io/sign/r1' },
      '5월 가정통신문',
    );
    expect(text).toContain('5월 가정통신문 서명 링크');
    expect(text).toContain('https://x.io/sign/r1');
    expect(text).toContain('아래 명단에서 본인을 선택');
  });

  it('개별 모드: 각 줄에 이름·PIN·URL', () => {
    const text = formatIssuedLinksAsText(
      {
        mode: 'per-participant',
        participantLinks: [
          { participantId: 'p1', displayName: '홍길동', url: 'https://x.io/sign/r1?token=a' },
          {
            participantId: 'p2',
            displayName: '김학부모',
            url: 'https://x.io/sign/r1?token=b',
            pin: '4827',
          },
        ],
      },
      '5월 결석계',
    );
    expect(text).toContain('5월 결석계 개인 서명 링크');
    expect(text).toContain('- 홍길동\n  https://x.io/sign/r1?token=a');
    expect(text).toContain('- 김학부모 (PIN: 4827)\n  https://x.io/sign/r1?token=b');
  });

  it('빈 결과는 빈 문자열을 반환', () => {
    expect(formatIssuedLinksAsText({ mode: 'common' }, 'X')).toBe('');
    expect(formatIssuedLinksAsText({ mode: 'per-participant', participantLinks: [] }, 'X')).toBe(
      '',
    );
  });
});
