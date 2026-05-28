import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LocalSignatureRequestDraft,
} from '@domain/entities/SignatureRequest';

const repository = vi.hoisted(() => ({
  list: vi.fn<() => Promise<readonly LocalSignatureRequestDraft[]>>(),
  upsert: vi.fn<(draft: LocalSignatureRequestDraft) => Promise<void>>(),
  delete: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock('@adapters/di/container', () => ({
  signatureRequestRepository: repository,
}));

import { useSignatureRequestStore } from './useSignatureRequestStore';

describe('useSignatureRequestStore', () => {
  beforeEach(() => {
    repository.list.mockReset();
    repository.upsert.mockReset();
    repository.delete.mockReset();
    repository.list.mockResolvedValue([]);
    repository.upsert.mockResolvedValue(undefined);
    repository.delete.mockResolvedValue(undefined);
    useSignatureRequestStore.setState({
      drafts: [],
      loaded: false,
      isSaving: false,
      selectedDraftId: null,
      composedPdfsByRequestId: new Map(),
    });
  });

  it('loads local drafts once from repository', async () => {
    const existing = makeDraft('req-existing');
    repository.list.mockResolvedValueOnce([existing]);

    await useSignatureRequestStore.getState().load();
    await useSignatureRequestStore.getState().load();

    expect(repository.list).toHaveBeenCalledTimes(1);
    expect(useSignatureRequestStore.getState().drafts).toEqual([existing]);
  });

  it('creates a local draft while keeping PIN originals only in participantAccessSecrets', async () => {
    const draft = await useSignatureRequestStore.getState().createDraft({
      title: '  결석계 서명  ',
      templateKind: 'absence-form',
      templateSource: {
        type: 'google-docs',
        url: 'https://docs.google.com/document/d/template',
      },
      participants: [
        {
          id: 'student-1',
          displayName: '홍길동',
          role: 'student',
          requiredSignatureKinds: ['student', 'parent'],
        },
      ],
      participantAccessSecrets: [
        {
          participantId: 'student-1',
          uniqueLinkToken: 'token-original',
          pin: '1234',
        },
      ],
      access: {
        uniqueLinksEnabled: true,
        pinEnabled: true,
      },
    });

    expect(draft.request.title).toBe('결석계 서명');
    expect(draft.request.scope).toEqual({
      legalEffect: 'none',
      automaticReminders: false,
      strongIdentityRequired: false,
    });
    expect(draft.request.participants[0]?.pinHash).toBeUndefined();
    expect(draft.participantAccessSecrets).toEqual([
      {
        participantId: 'student-1',
        uniqueLinkToken: 'token-original',
        pin: '1234',
      },
    ]);
    expect(repository.upsert).toHaveBeenCalledWith(draft);
    expect(useSignatureRequestStore.getState().selectedDraftId).toBe(draft.request.id);
  });

  it('updates status and clears selected draft on delete', async () => {
    const existing = makeDraft('req-1');
    useSignatureRequestStore.setState({
      drafts: [existing],
      loaded: true,
      selectedDraftId: 'req-1',
    });

    await useSignatureRequestStore.getState().setStatus('req-1', 'active');
    await useSignatureRequestStore.getState().deleteDraft('req-1');

    const saved = repository.upsert.mock.calls[0]?.[0];
    expect(saved?.request.status).toBe('active');
    expect(useSignatureRequestStore.getState().drafts).toEqual([]);
    expect(useSignatureRequestStore.getState().selectedDraftId).toBeNull();
  });
});

describe('Phase 2C US-2C-13: getResultUrl 헬퍼 (ComposedPdf 우선, resultFileUrl fallback)', () => {
  beforeEach(() => {
    useSignatureRequestStore.setState({
      drafts: [],
      loaded: false,
      isSaving: false,
      selectedDraftId: null,
      composedPdfsByRequestId: new Map(),
    });
  });

  it('ComposedPdf 가 캐시되어 있고 만료 전이면 signedUrl 을 반환한다', () => {
    const draft = makeDraft('req-1');
    useSignatureRequestStore.getState().setComposedPdf('req-1', {
      version: 1,
      storagePath: 'signature-results/req-1/v1.pdf',
      fileName: '연수등록부_쌤핀_행정용_v1.pdf',
      signedUrl: 'https://supabase.test/v1.pdf?token=abc',
      submissionCount: 5,
      participantCount: 10,
      composedAt: '2026-05-28T00:00:00.000Z',
      signedUrlTtlMs: 60_000,
    });
    const url = useSignatureRequestStore.getState().getResultUrl(draft.request);
    expect(url).toBe('https://supabase.test/v1.pdf?token=abc');
  });

  it('ComposedPdf 캐시가 없으면 레거시 resultFileUrl 로 fallback', () => {
    const draft = makeDraft('req-2');
    const requestWithLegacy = {
      ...draft.request,
      resultFileUrl: 'https://docs.example.com/legacy-results.pdf',
    };
    const url = useSignatureRequestStore.getState().getResultUrl(requestWithLegacy);
    expect(url).toBe('https://docs.example.com/legacy-results.pdf');
  });

  it('ComposedPdf signedUrl 이 만료되면 resultFileUrl 로 fallback', () => {
    const draft = makeDraft('req-3');
    const requestWithLegacy = {
      ...draft.request,
      resultFileUrl: 'https://docs.example.com/legacy.pdf',
    };
    // TTL=1ms 후 즉시 만료
    useSignatureRequestStore.getState().setComposedPdf('req-3', {
      version: 2,
      storagePath: 'signature-results/req-3/v2.pdf',
      fileName: 'r3.pdf',
      signedUrl: 'https://supabase.test/expired',
      submissionCount: 1,
      participantCount: 1,
      composedAt: '2026-05-28T00:00:00.000Z',
      signedUrlTtlMs: 1,
    });
    // 만료 보장 — Date.now() advance 시뮬레이션 대신 entry 직접 덮어쓰기
    const cache = new Map(useSignatureRequestStore.getState().composedPdfsByRequestId);
    const expired = cache.get('req-3');
    if (expired) {
      cache.set('req-3', { ...expired, signedUrlExpiresAt: Date.now() - 1000 });
      useSignatureRequestStore.setState({ composedPdfsByRequestId: cache });
    }
    const url = useSignatureRequestStore.getState().getResultUrl(requestWithLegacy);
    expect(url).toBe('https://docs.example.com/legacy.pdf');
  });

  it('둘 다 없으면 undefined 반환', () => {
    const draft = makeDraft('req-4');
    const url = useSignatureRequestStore.getState().getResultUrl(draft.request);
    expect(url).toBeUndefined();
  });

  it('deleteDraft 시 해당 요청의 ComposedPdf 캐시도 비워진다', async () => {
    const existing = makeDraft('req-5');
    useSignatureRequestStore.setState({ drafts: [existing], loaded: true });
    useSignatureRequestStore.getState().setComposedPdf('req-5', {
      version: 1,
      storagePath: 'signature-results/req-5/v1.pdf',
      fileName: 'r5.pdf',
      signedUrl: 'https://supabase.test/v1.pdf',
      submissionCount: 3,
      participantCount: 3,
      composedAt: '2026-05-28T00:00:00.000Z',
    });
    expect(useSignatureRequestStore.getState().composedPdfsByRequestId.has('req-5')).toBe(true);
    await useSignatureRequestStore.getState().deleteDraft('req-5');
    expect(useSignatureRequestStore.getState().composedPdfsByRequestId.has('req-5')).toBe(false);
  });
});

function makeDraft(id: string): LocalSignatureRequestDraft {
  return {
    request: {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id,
      title: '연수 등록부',
      templateKind: 'training-register',
      templateSource: { type: 'pdf', url: 'https://example.com/template.pdf' },
      // Phase 2C v2: mapping 은 빈 객체. 실제 매핑은 regions 에 저장된다.
      mapping: { textFields: [], signatureSlots: [] },
      regions: [],
      regionVersion: 0,
      participants: [],
      submissions: [],
      access: { uniqueLinksEnabled: true, pinEnabled: false },
      scope: {
        legalEffect: 'none',
        automaticReminders: false,
        strongIdentityRequired: false,
      },
      status: 'draft',
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
    },
    participantAccessSecrets: [],
  };
}
