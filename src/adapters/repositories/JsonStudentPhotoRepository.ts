import type { StudentPhoto, StudentPhotosData } from '@domain/entities/StudentPhoto';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { IStoragePort } from '@domain/ports/IStoragePort';

const PHOTOS_KEY = 'student-photos';

/**
 * 학생 사진 저장소 구현 — 관찰 첨부(`JsonObservationAttachmentRepository`)와 동일 패턴.
 * 메타는 JSON, 사진 본체는 바이너리 스토어에 분리 저장한다.
 *
 * 삭제는 **바이너리를 먼저 지우고 메타를 갱신한다.** 순서를 바꾸면 중간에 실패했을 때
 * 메타에는 없는데 파일은 남는 "지웠다고 했는데 안 지워진" 상태가 되는데,
 * 얼굴 사진에서 그건 단순 찌꺼기가 아니라 개인정보 파기 실패다.
 * (반대로 파일만 지워지고 메타가 남으면 다음 읽기에서 null 이라 조용히 복구된다)
 */
export class JsonStudentPhotoRepository implements IStudentPhotoRepository {
  constructor(private readonly storage: IStoragePort) {}

  async list(): Promise<readonly StudentPhoto[]> {
    const data = await this.storage.read<StudentPhotosData>(PHOTOS_KEY);
    return data?.photos ?? [];
  }

  private async writeMeta(photos: readonly StudentPhoto[]): Promise<void> {
    await this.storage.write<StudentPhotosData>(PHOTOS_KEY, { photos });
  }

  async save(photo: StudentPhoto, bytes: Uint8Array): Promise<void> {
    await this.saveMany([{ photo, bytes }]);
  }

  /**
   * 여러 장을 한 번에 저장한다.
   *
   * ⚠️ **부분 실패를 남기지 않는다.** 도중에 한 장이라도 실패하면 이미 쓴 사진 파일을
   * 저장 직전 상태로 되돌린다 — 원래 없던 파일은 지우고, 덮어쓴 파일은 이전 바이트를 복구한다.
   * 되돌리지 않으면 (1) 메타에 없는 얼굴 사진이 디스크에 남아 **개인정보 파기 실패**가 되거나,
   * (2) 메타는 예전 사진을 가리키는데 파일만 새 사진인 어긋난 상태가 되어
   * 동기화가 장부와 실제 데이터를 다르게 보게 된다.
   */
  async saveMany(
    entries: ReadonlyArray<{ photo: StudentPhoto; bytes: Uint8Array }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    const written: Array<{ relPath: string; previous: Uint8Array | null }> = [];
    try {
      for (const { photo, bytes } of entries) {
        const previous = await this.storage.readBinary(photo.storageRef);
        await this.storage.writeBinary(photo.storageRef, bytes);
        written.push({ relPath: photo.storageRef, previous });
      }
      const all = await this.list();
      const incoming = new Set(entries.map((e) => e.photo.subjectKey));
      const kept = all.filter((p) => !incoming.has(p.subjectKey));
      await this.writeMeta([...kept, ...entries.map((e) => e.photo)]);
    } catch (error) {
      await this.restoreBinaries(written);
      throw error;
    }
  }

  /**
   * 부분 저장을 되돌린다. 나중에 쓴 것부터 되돌려야 같은 경로를 두 번 쓴 경우에도
   * 가장 처음 상태로 돌아간다. 되돌리기 자체의 실패는 삼킨다 — 사용자에게 보여야 할 것은
   * 원래의 저장 실패 원인이지, 복구 과정의 2차 오류가 아니다.
   */
  private async restoreBinaries(
    written: ReadonlyArray<{ relPath: string; previous: Uint8Array | null }>,
  ): Promise<void> {
    for (const { relPath, previous } of [...written].reverse()) {
      try {
        if (previous === null) {
          await this.storage.removeBinary(relPath);
        } else {
          await this.storage.writeBinary(relPath, previous);
        }
      } catch {
        // 원래 오류를 가리지 않는다
      }
    }
  }

  async readPhoto(subjectKey: string): Promise<Uint8Array | null> {
    const target = (await this.list()).find((p) => p.subjectKey === subjectKey);
    if (!target) return null;
    return this.storage.readBinary(target.storageRef);
  }

  async delete(subjectKey: string): Promise<void> {
    const all = await this.list();
    const target = all.find((p) => p.subjectKey === subjectKey);
    if (!target) return;
    await this.storage.removeBinary(target.storageRef);
    await this.writeMeta(all.filter((p) => p.subjectKey !== subjectKey));
  }

  async deleteByOwner(ownerKind: StudentPhoto['ownerKind'], ownerKey: string): Promise<void> {
    const all = await this.list();
    const targets = all.filter((p) => p.ownerKind === ownerKind && p.ownerKey === ownerKey);
    if (targets.length === 0) return;
    for (const target of targets) {
      await this.storage.removeBinary(target.storageRef);
    }
    await this.writeMeta(
      all.filter((p) => !(p.ownerKind === ownerKind && p.ownerKey === ownerKey)),
    );
  }

  async deleteAll(): Promise<void> {
    const all = await this.list();
    for (const photo of all) {
      await this.storage.removeBinary(photo.storageRef);
    }
    await this.writeMeta([]);
  }

  async listBinaryKeys(): Promise<string[]> {
    return (await this.list()).map((p) => p.storageRef);
  }
}
