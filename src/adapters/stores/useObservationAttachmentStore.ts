import { create } from 'zustand';
import type {
  ObservationAttachment,
  ObservationAttachmentSource,
  ObservationTextQuality,
} from '@domain/entities/ObservationAttachment';
import {
  OBSERVATION_ATTACHMENT_LIMITS,
  validateAttachmentFile,
  canAddAttachment,
  storageRefFor,
  truncateExtractedText,
} from '@domain/rules/observationAttachmentRules';
import { observationAttachmentRepository, documentParserPort } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

interface AddAttachmentParams {
  readonly observationId: string;
  readonly file: File;
  readonly source: ObservationAttachmentSource;
}

interface ObservationAttachmentState {
  attachments: readonly ObservationAttachment[];
  loaded: boolean;

  load: () => Promise<void>;
  /**
   * 파일을 첨부한다. 검증 실패(형식·크기·개수)는 Error 를 throw 하므로 호출 측에서 catch 해 안내한다.
   * 원본을 그대로 저장한다(리사이즈 없음 — 생기부 근거로 원본 보존, 크기 한도가 안전판).
   */
  addAttachment: (params: AddAttachmentParams) => Promise<ObservationAttachment>;
  deleteAttachment: (id: string) => Promise<void>;
  deleteByObservationId: (observationId: string) => Promise<void>;
  getByObservation: (observationId: string) => readonly ObservationAttachment[];
  readFile: (id: string) => Promise<Uint8Array | null>;
}

export const useObservationAttachmentStore = create<ObservationAttachmentState>((set, get) => ({
  attachments: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const attachments = await observationAttachmentRepository.list();
      set({ attachments, loaded: true });
    } catch (err) {
      console.error('[ObservationAttachmentStore] load failed:', err);
      set({ loaded: true });
    }
  },

  addAttachment: async ({ observationId, file, source }) => {
    const current = get().attachments.filter((a) => a.observationId === observationId);
    if (!canAddAttachment(current.length)) {
      throw new Error(
        `첨부는 관찰 1건당 최대 ${OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION}개까지 가능합니다.`,
      );
    }
    const validation = validateAttachmentFile(file.name, file.size);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const id = generateUUID();

    // 문서 첨부는 저장 시점에 텍스트를 추출한다(데스크톱 전용 kordoc). 원문 그대로 저장하고
    // (마스킹하지 않음), AI 노출이 필요할 때 ai-bridge egress 에서 탈식별한다(관찰 content 와 동일 모델).
    // 추출 실패(브라우저/모바일·파싱 오류)는 무시하고 첨부 자체는 저장한다.
    let extractedText: string | undefined;
    let textQuality: ObservationTextQuality | undefined;
    if (validation.kind === 'document') {
      try {
        const outcome = await documentParserPort.parseBytes(bytes, file.name);
        if (outcome.status === 'ok') {
          const md = outcome.document.markdown.trim();
          if (md.length > 0) extractedText = truncateExtractedText(md);
          if (outcome.document.textQuality) textQuality = outcome.document.textQuality;
        }
      } catch {
        // 추출 불가(데스크톱 아님) 또는 파싱 오류 — 첨부는 그대로 저장, 텍스트만 생략
      }
    }

    const attachment: ObservationAttachment = {
      id,
      observationId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      kind: validation.kind,
      byteSize: file.size,
      storageRef: storageRefFor(id, file.name),
      source,
      createdAt: new Date().toISOString(),
      ...(extractedText !== undefined ? { extractedText } : {}),
      ...(textQuality !== undefined ? { textQuality } : {}),
    };

    await observationAttachmentRepository.create(attachment, bytes);
    set((s) => ({ attachments: [...s.attachments, attachment] }));
    return attachment;
  },

  deleteAttachment: async (id) => {
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }));
    await observationAttachmentRepository.delete(id);
  },

  deleteByObservationId: async (observationId) => {
    set((s) => ({
      attachments: s.attachments.filter((a) => a.observationId !== observationId),
    }));
    await observationAttachmentRepository.deleteByObservationId(observationId);
  },

  getByObservation: (observationId) => {
    return get().attachments.filter((a) => a.observationId === observationId);
  },

  readFile: (id) => observationAttachmentRepository.readFile(id),
}));
