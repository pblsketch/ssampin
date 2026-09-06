import type {
  ObservationAttachment,
  ObservationAttachmentSource,
} from '@domain/entities/ObservationAttachment';

/**
 * 저장 대기 첨부 한 건 — **pendingKey 로 식별한다.**
 *
 * 파일 이름이나 배열 위치로 식별하면 안 된다. 같은 이름의 파일을 두 번 고르는 일이 흔하고,
 * 일부만 성공한 뒤 목록에서 제거하면 위치가 밀린다. 고른 순간 붙인 키만 끝까지 유효하다.
 */
export interface PendingAttachmentItem {
  readonly pendingKey: string;
  readonly file: File;
  readonly source: ObservationAttachmentSource;
}

/** 파일별 결과 — 성공한 것과 실패한 것을 **구별해서** 돌려준다(계획 §5.1-2). */
export interface AttachmentCommitResult {
  readonly succeeded: readonly { readonly pendingKey: string; readonly attachmentId: string }[];
  readonly failed: readonly { readonly pendingKey: string; readonly message: string }[];
}

let pendingKeySeq = 0;

/**
 * 파일을 고르는 순간 붙이는 세션 키. 저장·재시도 내내 이 값이 그 파일의 이름이다.
 * 저장되지 않는 화면 안 식별자라 UUID 가 필요 없다 — 한 세션에서 겹치지만 않으면 된다.
 */
export function newPendingKey(): string {
  pendingKeySeq += 1;
  return `pf-${pendingKeySeq}`;
}

/**
 * 대기 첨부를 저장된 원본에 붙인다. **개별 실패가 전체를 멈추지 않고**, 무엇이 성공하고
 * 무엇이 실패했는지 파일 단위로 돌려준다.
 *
 * 이전에는 실패를 토스트로만 흘리고 `void` 를 반환해서, 화면이 "3개 중 2개만 붙었다"를
 * 알 길이 없었다 — 성공한 파일까지 대기 목록에서 지워지거나, 재시도가 성공분을 또 올렸다.
 * 재시도는 이 결과의 `failed` 만 다시 넘기면 된다.
 */
export async function commitObservationAttachments(
  observationId: string,
  items: readonly PendingAttachmentItem[],
  addAttachment: (params: {
    observationId: string;
    file: File;
    source: ObservationAttachmentSource;
  }) => Promise<ObservationAttachment>,
): Promise<AttachmentCommitResult> {
  const succeeded: { pendingKey: string; attachmentId: string }[] = [];
  const failed: { pendingKey: string; message: string }[] = [];
  for (const item of items) {
    try {
      const saved = await addAttachment({
        observationId,
        file: item.file,
        source: item.source,
      });
      succeeded.push({ pendingKey: item.pendingKey, attachmentId: saved.id });
    } catch (e) {
      failed.push({
        pendingKey: item.pendingKey,
        message: e instanceof Error ? e.message : '첨부 저장 실패',
      });
    }
  }
  return { succeeded, failed };
}

/** 실패한 것만 남긴다 — 성공한 파일을 다시 올리지 않기 위한 대기 목록 정리. */
export function keepFailed(
  items: readonly PendingAttachmentItem[],
  result: AttachmentCommitResult,
): PendingAttachmentItem[] {
  const stillPending = new Set(result.failed.map((f) => f.pendingKey));
  return items.filter((i) => stillPending.has(i.pendingKey));
}

/** 화면 문구 — 부분 성공을 "저장됨"으로 뭉뚱그리지 않는다. 성공 0건이면 null(별도 오류 문구). */
export function partialAttachmentMessage(result: AttachmentCommitResult): string | null {
  if (result.failed.length === 0) return null;
  return `기록은 저장됐습니다 · 첨부 ${result.failed.length}개를 붙이지 못했습니다. 다시 시도해 주세요.`;
}
