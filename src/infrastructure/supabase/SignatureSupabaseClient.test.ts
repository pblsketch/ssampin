import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SupabaseSignatureAdminClient,
  SupabaseSignaturePublicClient,
  isSupabaseConfigured,
} from './SignatureSupabaseClient';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LocalSignatureRequestDraft,
} from '@domain/entities/SignatureRequest';

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key');
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.unstubAllEnvs();
});

describe('isSupabaseConfigured', () => {
  it('VITE 환경변수가 채워져 있으면 true', () => {
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('환경변수가 비어 있으면 false', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isSupabaseConfigured()).toBe(false);
  });
});

describe('SupabaseSignaturePublicClient.loadRequest', () => {
  it('Edge Function 응답을 ready 결과로 정규화한다', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'req-1',
            title: '3월 연수 등록부',
            description: undefined,
            status: 'active',
            dueAt: null,
            pinEnabled: false,
            uniqueLinksEnabled: true,
            participants: [
              { id: 'p1', displayName: '홍길동', requiredSignatureKinds: ['recipient'] },
            ],
            resolvedParticipantId: 'p1',
          }),
          { status: 200 },
        ),
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.loadRequest({ requestId: 'req-1', token: 'tok' });

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.request.id).toBe('req-1');
      expect(result.request.title).toBe('3월 연수 등록부');
      expect(result.request.participants[0]?.requiredSignatureKinds).toEqual(['recipient']);
      expect(result.resolvedParticipantId).toBe('p1');
    }
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    expect(String(calls[0]?.[0] ?? '')).toContain('/functions/v1/get-signature-request-public');
    expect(calls[0]?.[1]?.method).toBe('POST');
  });

  it('Edge Function 에러를 error 결과로 변환한다', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: '서명 요청을 찾을 수 없습니다.' }), { status: 404 }),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.loadRequest({ requestId: 'unknown' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('찾을 수 없습니다');
    }
  });

  it('빈 requestId는 즉시 rejected 반환 (서버 호출 안 함)', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.loadRequest({ requestId: '' });
    expect(result.status).not.toBe('ready');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('알 수 없는 requiredSignatureKinds는 필터링되어 정규화된다', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'req-1',
            title: 'T',
            status: 'active',
            pinEnabled: false,
            uniqueLinksEnabled: false,
            participants: [
              { id: 'p1', displayName: 'X', requiredSignatureKinds: ['recipient', 'unknown-kind'] },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.loadRequest({ requestId: 'req-1' });
    if (result.status === 'ready') {
      expect(result.request.participants[0]?.requiredSignatureKinds).toEqual(['recipient']);
    }
  });
});

describe('SupabaseSignaturePublicClient.submitSignature', () => {
  it('성공 응답은 accepted + submissionId', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ submissionId: 'sub-1' }), { status: 200 }),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.submitSignature({
      requestId: 'req-1',
      participantId: 'p1',
      signatureKind: 'recipient',
      signerName: '홍길동',
      signatureImageDataUrl: 'data:image/png;base64,XXX',
      submittedAt: '2026-05-27T00:00:00Z',
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.submissionId).toBe('sub-1');
    }
  });

  it('실패 응답은 rejected + 한국어 메시지', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'PIN이 일치하지 않습니다.' }), { status: 403 }),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignaturePublicClient();
    const result = await client.submitSignature({
      requestId: 'req-1',
      token: 'tok',
      signatureKind: 'recipient',
      signerName: '홍',
      signatureImageDataUrl: 'data:image/png;base64,X',
      submittedAt: '2026-05-27T00:00:00Z',
    });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.message).toContain('PIN');
    }
  });
});

function makeDraft(overrides: {
  uniqueLinksEnabled: boolean;
  pinEnabled: boolean;
}): LocalSignatureRequestDraft {
  return {
    request: {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id: 'signature-request-local',
      title: '5월 결석계 서명',
      templateKind: 'absence-form',
      templateSource: { type: 'google-sheets', url: 'https://docs.google.com/spreadsheets/d/abc' },
      mapping: { textFields: [], signatureSlots: [] },
      regions: [],
      regionVersion: 0,
      participants: [
        {
          id: 'participant-1-홍길동',
          displayName: '홍길동',
          role: 'student',
          studentNumber: 1,
          requiredSignatureKinds: ['student', 'parent'],
        },
      ],
      submissions: [],
      access: { ...overrides },
      scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
      status: 'draft',
      createdAt: '2026-05-27T00:00:00Z',
      updatedAt: '2026-05-27T00:00:00Z',
    },
    participantAccessSecrets: [
      { participantId: 'participant-1-홍길동', uniqueLinkToken: 'tok-1', pin: '4827' },
    ],
  };
}

describe('SupabaseSignatureAdminClient.publishDraft', () => {
  it('publish 응답을 받아 server id로 매핑한 issuedLinks를 반환한다 (개별 모드 + PIN)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            requestId: 'server-req-1',
            adminKey: 'admin-1',
            participants: [
              {
                id: 'server-p1',
                clientId: 'participant-1-홍길동',
                displayName: '홍길동',
                studentNumber: 1,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const client = new SupabaseSignatureAdminClient();
    const result = await client.publishDraft(
      makeDraft({ uniqueLinksEnabled: true, pinEnabled: true }),
      'https://sign.ssampin.app',
    );

    expect(result.requestId).toBe('server-req-1');
    expect(result.adminKey).toBe('admin-1');
    expect(result.issuedLinks.mode).toBe('per-participant');
    expect(result.issuedLinks.participantLinks).toHaveLength(1);
    expect(result.issuedLinks.participantLinks?.[0]).toMatchObject({
      participantId: 'server-p1',
      displayName: '홍길동',
      pin: '4827',
    });
    expect(result.issuedLinks.participantLinks?.[0]?.url).toContain(
      'https://sign.ssampin.app/sign/server-req-1',
    );
    expect(result.issuedLinks.participantLinks?.[0]?.url).toContain('token=tok-1');

    // 요청 본문 확인: token/pin은 client에서 그대로 보내고 (서버가 sha256 처리)
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const body = JSON.parse(calls[0]?.[1]?.body as string);
    expect(body.participants[0].uniqueLinkToken).toBe('tok-1');
    expect(body.participants[0].pin).toBe('4827');
    expect(body.access).toEqual({ uniqueLinksEnabled: true, pinEnabled: true });
  });

  it('공통 모드: uniqueLinksEnabled=false → 단일 commonUrl만 발급', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            requestId: 'server-req-2',
            adminKey: 'admin-2',
            participants: [
              {
                id: 'server-p1',
                clientId: 'participant-1-홍길동',
                displayName: '홍길동',
                studentNumber: 1,
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignatureAdminClient();
    const result = await client.publishDraft(
      makeDraft({ uniqueLinksEnabled: false, pinEnabled: false }),
      'https://sign.ssampin.app',
    );

    expect(result.issuedLinks.mode).toBe('common');
    expect(result.issuedLinks.commonUrl).toBe('https://sign.ssampin.app/sign/server-req-2');
    expect(result.issuedLinks.participantLinks).toBeUndefined();
  });

  it('Edge Function 에러는 throw로 전달된다', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: '요청이 너무 많습니다.' }), { status: 429 }),
    ) as unknown as typeof global.fetch;

    const client = new SupabaseSignatureAdminClient();
    await expect(
      client.publishDraft(
        makeDraft({ uniqueLinksEnabled: false, pinEnabled: false }),
        'https://sign.ssampin.app',
      ),
    ).rejects.toThrow('요청이 너무 많습니다.');
  });
});
