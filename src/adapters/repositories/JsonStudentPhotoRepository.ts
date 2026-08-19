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

  async saveMany(
    entries: ReadonlyArray<{ photo: StudentPhoto; bytes: Uint8Array }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    for (const { photo, bytes } of entries) {
      await this.storage.writeBinary(photo.storageRef, bytes);
    }
    const all = await this.list();
    const incoming = new Set(entries.map((e) => e.photo.studentId));
    const kept = all.filter((p) => !incoming.has(p.studentId));
    await this.writeMeta([...kept, ...entries.map((e) => e.photo)]);
  }

  async readPhoto(studentId: string): Promise<Uint8Array | null> {
    const target = (await this.list()).find((p) => p.studentId === studentId);
    if (!target) return null;
    return this.storage.readBinary(target.storageRef);
  }

  async delete(studentId: string): Promise<void> {
    const all = await this.list();
    const target = all.find((p) => p.studentId === studentId);
    if (!target) return;
    await this.storage.removeBinary(target.storageRef);
    await this.writeMeta(all.filter((p) => p.studentId !== studentId));
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
