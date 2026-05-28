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
