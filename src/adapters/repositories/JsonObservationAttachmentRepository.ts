import type {
  ObservationAttachment,
  ObservationAttachmentsData,
} from '@domain/entities/ObservationAttachment';
import type { IObservationAttachmentRepository } from '@domain/repositories/IObservationAttachmentRepository';
import type { IStoragePort } from '@domain/ports/IStoragePort';

const ATTACHMENTS_KEY = 'observation-attachments';

/**
 * 관찰 첨부 저장소 구현 — 서식관리(JsonFormTemplateRepository)와 동일 패턴:
 * 메타데이터는 JSON 파일, 파일 본체는 바이너리 스토어(storageRef)에 분리 저장한다.
 */
export class JsonObservationAttachmentRepository implements IObservationAttachmentRepository {
  constructor(private readonly storage: IStoragePort) {}

  async list(): Promise<readonly ObservationAttachment[]> {
    const data = await this.storage.read<ObservationAttachmentsData>(ATTACHMENTS_KEY);
    return data?.attachments ?? [];
  }

  async create(attachment: ObservationAttachment, fileBytes: Uint8Array): Promise<void> {
    await this.storage.writeBinary(attachment.storageRef, fileBytes);
    const all = await this.list();
    // 같은 id 가 있으면 교체(업서트), 없으면 append
    const filtered = all.filter((a) => a.id !== attachment.id);
    await this.storage.write<ObservationAttachmentsData>(ATTACHMENTS_KEY, {
      attachments: [...filtered, attachment],
    });
  }

  async delete(id: string): Promise<void> {
    const all = await this.list();
    const target = all.find((a) => a.id === id);
    if (!target) return;
    await this.storage.removeBinary(target.storageRef);
    await this.storage.write<ObservationAttachmentsData>(ATTACHMENTS_KEY, {
      attachments: all.filter((a) => a.id !== id),
    });
  }

  async deleteByObservationId(observationId: string): Promise<void> {
    const all = await this.list();
    const targets = all.filter((a) => a.observationId === observationId);
    if (targets.length === 0) return;
    for (const t of targets) {
      await this.storage.removeBinary(t.storageRef);
    }
    await this.storage.write<ObservationAttachmentsData>(ATTACHMENTS_KEY, {
      attachments: all.filter((a) => a.observationId !== observationId),
    });
  }

  async readFile(id: string): Promise<Uint8Array | null> {
    const all = await this.list();
    const target = all.find((a) => a.id === id);
    if (!target) return null;
    return this.storage.readBinary(target.storageRef);
  }

  async listBinaryKeys(): Promise<string[]> {
    const all = await this.list();
    // 메타에 등록된 storageRef만 반환 — 고아 바이너리는 자연히 제외된다.
    return all.map((a) => a.storageRef);
  }
}
