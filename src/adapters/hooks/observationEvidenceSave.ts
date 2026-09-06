import type { RecordArea } from '@domain/entities/RecordDraft';
import type { EvidenceSourceType } from '@domain/entities/RecordEvidence';
import {
  commitObservationAttachments,
  keepFailed,
  type AttachmentCommitResult,
  type PendingAttachmentItem,
} from '@adapters/hooks/observationAttachmentCommit';

/**
 * 관찰 저장의 세 단계 — 어디까지 갔는지가 곧 다음에 무엇을 다시 할지다(계획 §5.1-8, §5.2).
 *
 * `source` 원본 저장 → `attachments` 첨부 붙이기 → `link` 근거 생성·주제 연결.
 * 앞 단계가 성공하지 않으면 다음으로 넘어가지 않는다. **성공한 단계는 다시 하지 않는다** —
 * 재시도가 원본을 또 만들면 같은 기록이 두 벌 생긴다.
 */
export type ObservationSaveStage = 'source' | 'attachments' | 'link';

/**
 * 진행 중 저장의 체크포인트. **현재 페이지 세션 메모리**에만 둔다(계획 §5.2 — 영구 큐·스키마 추가 없음).
 * 강제 종료 후 자동 재시도를 약속하지 않는다. 다시 실행하면 디스크에 성공한 원본은 보드 거울로,
 * 저장된 미분류 근거는 미분류로 보여 직접 연결할 수 있다 — 이것이 복구의 지속 경계다.
 */
export interface ObservationSaveCheckpoint {
  /** 저장이 **확인된** 원본 id. null 이면 아직 원본이 없다. */
  readonly sourceId: string | null;
  /** 아직 붙이지 못한 첨부. 성공한 파일은 여기 없다(재시도가 또 올리지 않게). */
  readonly attachmentsPending: readonly PendingAttachmentItem[];
  /**
   * 첨부 커밋을 **한 번이라도 돌렸는지**. `attachmentsPending` 이 비었다는 것만으로는
   * "전부 성공"과 "아직 안 함"을 구별할 수 없다 — 구별하지 않으면 재시도가 이미 붙은
   * 파일을 다시 올려 첨부가 두 벌 생긴다.
   */
  readonly attachmentsAttempted: boolean;
  /** 저장이 확인된 근거 id. */
  readonly evidenceId: string | null;
  /** 연결하려던 주제. 실패 후 재시도가 같은 주제로 가도록 들고 있는다. */
  readonly threadId: string | null;
  /** 이 저장이 어느 학생 것이었는지 — 화면이 이미 다음 학생으로 넘어갔을 수 있다. */
  readonly studentRef: string;
}

export interface ObservationEvidenceSaveInput {
  readonly studentRef: string;
  readonly areas: readonly RecordArea[];
  readonly content: string;
  readonly sourceType: EvidenceSourceType;
  readonly classId?: string;
  readonly date?: string;
  readonly slots?: readonly string[];
  /** 고른 주제. 없으면 근거를 미분류로 저장한다(주제 미선택이 저장을 막지 않는다). */
  readonly threadId?: string;
  readonly attachments: readonly PendingAttachmentItem[];
}

export interface ObservationEvidenceSaveOutcome {
  readonly ok: boolean;
  /** 실패했다면 어느 단계에서인지. 성공이면 null. */
  readonly failedStage: ObservationSaveStage | null;
  readonly checkpoint: ObservationSaveCheckpoint;
  readonly attachments: AttachmentCommitResult | null;
  readonly error: unknown;
}

/** 저장에 필요한 바깥 동작들 — 스토어를 직접 부르지 않고 주입받아 테스트가 실패를 넣을 수 있게 한다. */
export interface ObservationEvidenceSaveDeps {
  /** 원본을 저장하고 확정된 id 를 돌려준다. */
  readonly saveSource: (input: ObservationEvidenceSaveInput) => Promise<string>;
  readonly addAttachment: Parameters<typeof commitObservationAttachments>[2];
  /** 원본 하나당 근거 하나 관문. 이미 있으면 그 id 를 재사용한다. */
  readonly ensureEvidence: (params: {
    readonly studentRef: string;
    readonly areas: readonly RecordArea[];
    readonly content: string;
    readonly sourceType: EvidenceSourceType;
    readonly sourceId: string;
    readonly classId?: string;
    readonly date?: string;
    readonly slots?: readonly string[];
    readonly threadId?: string;
  }) => Promise<{ readonly evidenceId: string }>;
}

function emptyCheckpoint(studentRef: string, threadId?: string): ObservationSaveCheckpoint {
  return {
    sourceId: null,
    attachmentsPending: [],
    attachmentsAttempted: false,
    evidenceId: null,
    threadId: threadId ?? null,
    studentRef,
  };
}

/**
 * 원본 저장 → 첨부 → 근거·주제 연결을 한 흐름으로 조정한다.
 *
 * 순수 함수다(React 밖). 실패를 넣어 각 단계를 따로 검증할 수 있어야 하기 때문이다.
 * `prior` 를 주면 **그 단계부터 이어서** 한다 — 이미 저장된 원본을 새 id 로 다시 만들지 않는다.
 *
 * 첨부가 일부 실패해도 **연결까지 간다.** 첨부는 근거의 전제가 아니고, 여기서 멈추면
 * 교사가 쓴 기록이 주제에 안 붙은 채로 남는다. 실패한 파일은 체크포인트에 남아 다시 시도한다.
 */
export async function runObservationEvidenceSave(
  input: ObservationEvidenceSaveInput,
  deps: ObservationEvidenceSaveDeps,
  prior?: ObservationSaveCheckpoint | null,
): Promise<ObservationEvidenceSaveOutcome> {
  let checkpoint: ObservationSaveCheckpoint =
    prior && prior.studentRef === input.studentRef
      ? prior
      : emptyCheckpoint(input.studentRef, input.threadId);

  // 1) 원본 — 이미 확정된 id 가 있으면 다시 만들지 않는다.
  let sourceId: string;
  if (checkpoint.sourceId !== null) {
    sourceId = checkpoint.sourceId;
  } else {
    try {
      sourceId = await deps.saveSource(input);
      checkpoint = { ...checkpoint, sourceId };
    } catch (error) {
      return { ok: false, failedStage: 'source', checkpoint, attachments: null, error };
    }
  }

  // 2) 첨부 — 아직 안 붙은 것만. 부분 실패는 흐름을 멈추지 않는다.
  // 이미 한 번 돌렸으면 **남은 것만**, 아니면 입력 전체. 이 구별이 없으면 재시도가
  // 이미 성공한 파일을 다시 올린다(첨부 두 벌).
  const toCommit = checkpoint.attachmentsAttempted
    ? checkpoint.attachmentsPending
    : input.attachments;
  let attachments: AttachmentCommitResult | null = null;
  if (toCommit.length > 0) {
    attachments = await commitObservationAttachments(sourceId, toCommit, deps.addAttachment);
    checkpoint = {
      ...checkpoint,
      attachmentsPending: keepFailed(toCommit, attachments),
      attachmentsAttempted: true,
    };
  } else {
    checkpoint = { ...checkpoint, attachmentsPending: [], attachmentsAttempted: true };
  }

  // 3) 근거·주제 연결 — 이미 확정된 근거가 있으면 다시 만들지 않는다.
  if (checkpoint.evidenceId === null) {
    try {
      const { evidenceId } = await deps.ensureEvidence({
        studentRef: input.studentRef,
        areas: input.areas,
        content: input.content,
        sourceType: input.sourceType,
        sourceId,
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.slots !== undefined ? { slots: input.slots } : {}),
        ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      });
      checkpoint = { ...checkpoint, evidenceId };
    } catch (error) {
      // 원본은 저장됐다. 연결만 실패했으므로 원본을 되돌리지 않는다 —
      // 되돌리면 교사가 쓴 기록이 사라진다. '연결 다시 시도'로 이 단계만 다시 한다.
      return { ok: false, failedStage: 'link', checkpoint, attachments, error };
    }
  }

  // 첨부만 남은 실패는 "저장 실패"가 아니다 — 기록은 저장됐고 주제도 연결됐다.
  return {
    ok: checkpoint.attachmentsPending.length === 0,
    failedStage: checkpoint.attachmentsPending.length === 0 ? null : 'attachments',
    checkpoint,
    attachments,
    error: null,
  };
}
