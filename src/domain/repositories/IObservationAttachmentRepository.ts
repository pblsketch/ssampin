import type { ObservationAttachment } from '../entities/ObservationAttachment';

/**
 * 관찰 첨부 저장소.
 * 메타데이터는 JSON('observation-attachments')에, 파일 본체는 바이너리 스토어(storageRef)에 분리 저장한다.
 */
export interface IObservationAttachmentRepository {
  /** 전체 첨부 메타 목록. */
  list(): Promise<readonly ObservationAttachment[]>;
  /** 메타 + 파일 바이너리를 함께 저장(같은 id 있으면 교체). */
  create(attachment: ObservationAttachment, fileBytes: Uint8Array): Promise<void>;
  /** 메타 + 바이너리를 함께 삭제(미존재 시 no-op). */
  delete(id: string): Promise<void>;
  /** 한 관찰에 속한 모든 첨부(메타+바이너리) 삭제(관찰 삭제 시 cascade). */
  deleteByObservationId(observationId: string): Promise<void>;
  /** 첨부 파일 바이너리 읽기. 메타/파일 미존재 시 null. */
  readFile(id: string): Promise<Uint8Array | null>;
}
