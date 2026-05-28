import { create } from 'zustand';
import type {
  LocalSignatureRequestDraft,
  SignatureMappingTarget,
  SignatureParticipant,
  SignatureParticipantLocalAccessSecret,
  SignatureRequest,
  SignatureRequestAccessOptions,
  SignatureRequestStatus,
  SignatureTemplateKind,
  SignatureTemplateMapping,
  SignatureTemplateSource,
} from '@domain/entities/SignatureRequest';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  SIGNATURE_REQUEST_SCHEMA_VERSION,
} from '@domain/entities/SignatureRequest';
import { signatureRequestRepository } from '@adapters/di/container';

const DEFAULT_SIGNATURE_TARGET: SignatureMappingTarget = {
  // Phase 2C v2: 매핑은 PDF 오버레이 (`SignatureRegion`) 로 이전됐다. legacy slot 의 target
  // 은 의미가 없어졌지만 v1 호환을 위해 'pdf-region' literal 로 placeholder 만 둔다.
  type: 'pdf-region',
  value: '서명',
};

const DEFAULT_MAPPING: SignatureTemplateMapping = {
  textFields: [],
  signatureSlots: [
    {
      id: 'signature-recipient',
      kind: 'recipient',
      label: '서명',
      required: true,
      target: DEFAULT_SIGNATURE_TARGET,
    },
  ],
};

const DEFAULT_ACCESS: SignatureRequestAccessOptions = {
  uniqueLinksEnabled: true,
  pinEnabled: false,
};

export interface CreateSignatureRequestDraftInput {
  readonly title: string;
  readonly templateKind: SignatureTemplateKind;
  readonly templateSource: SignatureTemplateSource;
  readonly description?: string;
  readonly mapping?: SignatureTemplateMapping;
  readonly participants?: readonly SignatureParticipant[];
  readonly participantAccessSecrets?: readonly SignatureParticipantLocalAccessSecret[];
  readonly access?: SignatureRequestAccessOptions;
  readonly dueAt?: string;
  readonly status?: SignatureRequestStatus;
}

export interface UpdateSignatureRequestDraftInput {
  readonly title?: string;
  readonly description?: string;
  readonly templateKind?: SignatureTemplateKind;
  readonly templateSource?: SignatureTemplateSource;
  readonly mapping?: SignatureTemplateMapping;
  readonly participants?: readonly SignatureParticipant[];
  readonly participantAccessSecrets?: readonly SignatureParticipantLocalAccessSecret[];
  readonly access?: SignatureRequestAccessOptions;
  readonly dueAt?: string | null;
  readonly resultFileUrl?: string | null;
  readonly status?: SignatureRequestStatus;
}

interface SignatureRequestStoreState {
  readonly drafts: readonly LocalSignatureRequestDraft[];
  readonly loaded: boolean;
  readonly isSaving: boolean;
  readonly selectedDraftId: string | null;
  readonly load: () => Promise<void>;
  readonly selectDraft: (id: string | null) => void;
  readonly getDraft: (id: string) => LocalSignatureRequestDraft | undefined;
  readonly createDraft: (
    input: CreateSignatureRequestDraftInput,
  ) => Promise<LocalSignatureRequestDraft>;
  readonly updateDraft: (id: string, input: UpdateSignatureRequestDraftInput) => Promise<void>;
  readonly setStatus: (id: string, status: SignatureRequestStatus) => Promise<void>;
  readonly deleteDraft: (id: string) => Promise<void>;
}

type SignatureRequestStoreSet = (state: Partial<SignatureRequestStoreState>) => void;

export const useSignatureRequestStore = create<SignatureRequestStoreState>((set, get) => ({
  drafts: [],
  loaded: false,
  isSaving: false,
  selectedDraftId: null,

  load: async () => {
    if (get().loaded) return;
    const drafts = await signatureRequestRepository.list();
    set({ drafts, loaded: true });
  },

  selectDraft: (id) => {
    set({ selectedDraftId: id });
  },

  getDraft: (id) => {
    return get().drafts.find((draft) => draft.request.id === id);
  },

  createDraft: async (input) => {
    const now = new Date().toISOString();
    const request: SignatureRequest = {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id: createId('sigreq'),
      title: input.title.trim() || '새 서명받기',
      description: input.description,
      templateKind: input.templateKind,
      templateSource: input.templateSource,
      mapping: cloneMapping(input.mapping ?? DEFAULT_MAPPING),
      // Phase 2C v2: 신규 draft 는 regions 가 비어 있는 상태로 시작한다. PDF 업로드 + 디자이너에서
      // 사각형을 그리면 채워진다. regionVersion 은 디자이너 편집마다 증분된다.
      regions: [],
      regionVersion: 0,
      participants: [...(input.participants ?? [])],
      submissions: [],
      access: input.access ?? DEFAULT_ACCESS,
      scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
      status: input.status ?? 'draft',
      createdAt: now,
      updatedAt: now,
      dueAt: input.dueAt,
    };
    const draft: LocalSignatureRequestDraft = {
      request,
      participantAccessSecrets: [...(input.participantAccessSecrets ?? [])],
    };
    await persistDraft(draft, set, get);
    return draft;
  },

  updateDraft: async (id, input) => {
    const current = get().drafts.find((draft) => draft.request.id === id);
    if (!current) return;

    const request: SignatureRequest = {
      ...current.request,
      title:
        input.title !== undefined
          ? input.title.trim() || current.request.title
          : current.request.title,
      description:
        input.description !== undefined ? input.description : current.request.description,
      templateKind: input.templateKind ?? current.request.templateKind,
      templateSource: input.templateSource ?? current.request.templateSource,
      mapping: input.mapping ? cloneMapping(input.mapping) : current.request.mapping,
      participants: input.participants ? [...input.participants] : current.request.participants,
      access: input.access ?? current.request.access,
      status: input.status ?? current.request.status,
      updatedAt: new Date().toISOString(),
      dueAt: input.dueAt === null ? undefined : (input.dueAt ?? current.request.dueAt),
      resultFileUrl:
        input.resultFileUrl === null
          ? undefined
          : (input.resultFileUrl ?? current.request.resultFileUrl),
    };
    const draft: LocalSignatureRequestDraft = {
      request,
      participantAccessSecrets: input.participantAccessSecrets
        ? [...input.participantAccessSecrets]
        : current.participantAccessSecrets,
    };
    await persistDraft(draft, set, get);
  },

  setStatus: async (id, status) => {
    await get().updateDraft(id, { status });
  },

  deleteDraft: async (id) => {
    set({ isSaving: true });
    try {
      await signatureRequestRepository.delete(id);
      set({
        drafts: get().drafts.filter((draft) => draft.request.id !== id),
        loaded: true,
        selectedDraftId: get().selectedDraftId === id ? null : get().selectedDraftId,
      });
    } finally {
      set({ isSaving: false });
    }
  },
}));

async function persistDraft(
  draft: LocalSignatureRequestDraft,
  set: SignatureRequestStoreSet,
  get: typeof useSignatureRequestStore.getState,
): Promise<void> {
  set({ isSaving: true });
  try {
    await signatureRequestRepository.upsert(draft);
    set({
      drafts: [draft, ...get().drafts.filter((item) => item.request.id !== draft.request.id)],
      loaded: true,
      selectedDraftId: draft.request.id,
    });
  } finally {
    set({ isSaving: false });
  }
}

function cloneMapping(mapping: SignatureTemplateMapping): SignatureTemplateMapping {
  return {
    textFields: mapping.textFields.map((field) => ({ ...field, target: { ...field.target } })),
    signatureSlots: mapping.signatureSlots.map((slot) => ({ ...slot, target: { ...slot.target } })),
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
