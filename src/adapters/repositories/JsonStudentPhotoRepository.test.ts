/**
 * 학생 사진 저장소 — 저장·읽기 왕복과 **파기**를 시험한다.
 *
 * 파기가 특히 중요하다. 사진을 지웠다고 안내했는데 파일이 남아 있으면
 * 단순한 찌꺼기가 아니라 **개인정보 파기 실패**다. 그래서 삭제 뒤에
 * 메타뿐 아니라 **바이너리가 실제로 사라졌는지**까지 확인한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { StudentPhoto } from '@domain/entities/StudentPhoto';
import { studentPhotoStorageRef } from '@domain/rules/studentPhotoRules';
import { JsonStudentPhotoRepository } from './JsonStudentPhotoRepository';

/** 메모리 위에서 도는 저장소 — 실제 파일 시스템 없이 왕복을 검증한다 */
class FakeStorage implements IStoragePort {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  read<T>(filename: string): Promise<T | null> {
    return Promise.resolve((this.json.get(filename) as T | undefined) ?? null);
  }
  write<T>(filename: string, data: T): Promise<void> {
    this.json.set(filename, data);
    return Promise.resolve();
  }
  remove(filename: string): Promise<void> {
    this.json.delete(filename);
    return Promise.resolve();
  }
  readBinary(relPath: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.binary.get(relPath) ?? null);
  }
  writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(relPath, bytes);
    return Promise.resolve();
  }
  removeBinary(relPath: string): Promise<void> {
    this.binary.delete(relPath);
    return Promise.resolve();
  }
  listBinary(dirRelPath: string): Promise<readonly string[]> {
    const prefix = `${dirRelPath}/`;
    return Promise.resolve(
      [...this.binary.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
    );
  }
}

function makePhoto(
  subjectKey: string,
  ownerKind: StudentPhoto['ownerKind'],
  ownerKey: string,
): StudentPhoto {
  return {
    subjectKey,
    ownerKind,
    ownerKey,
    storageRef: studentPhotoStorageRef(subjectKey),
    mimeType: 'image/jpeg',
    byteSize: 3,
    width: 240,
    height: 320,
    studentNumber: 1,
    studentName: '강나영',
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

const BYTES = (seed: number) => new Uint8Array([0xff, 0xd8, seed]);

describe('JsonStudentPhotoRepository', () => {
  let storage: FakeStorage;
  let repo: JsonStudentPhotoRepository;

  beforeEach(() => {
    storage = new FakeStorage();
    repo = new JsonStudentPhotoRepository(storage);
  });

  it('저장한 사진을 그대로 다시 읽는다', async () => {
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    expect(await repo.readPhoto('s1')).toEqual(BYTES(1));
    expect(await repo.list()).toHaveLength(1);
  });

  it('사진 본체는 JSON 이 아니라 별도 파일로 나간다', async () => {
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    expect(storage.binary.has('student-photos/s1.jpg')).toBe(true);
    // 메타 JSON 에 바이너리가 섞여 들어가면 동기화가 매번 전량 전송이 된다
    expect(JSON.stringify(storage.json.get('student-photos'))).not.toContain('255');
  });

  it('같은 학생을 다시 저장하면 교체된다 (중복이 쌓이지 않는다)', async () => {
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(2));
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.readPhoto('s1')).toEqual(BYTES(2));
  });

  it('한 반을 한 번에 저장한다', async () => {
    await repo.saveMany(
      ['s1', 's2', 's3'].map((id, i) => ({
        photo: makePhoto(id, 'homeroom', 'homeroom'),
        bytes: BYTES(i),
      })),
    );
    expect(await repo.list()).toHaveLength(3);
    expect(await repo.readPhoto('s2')).toEqual(BYTES(1));
  });

  it('없는 학생을 읽으면 null (예외 아님)', async () => {
    expect(await repo.readPhoto('없음')).toBeNull();
  });

  it('한 명을 지우면 메타와 파일이 함께 사라진다', async () => {
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    await repo.delete('s1');
    expect(await repo.list()).toHaveLength(0);
    expect(storage.binary.has('student-photos/s1.jpg')).toBe(false);
    expect(await repo.readPhoto('s1')).toBeNull();
  });

  it('★반별 삭제: 그 반 사진만 사라지고 다른 반은 남는다', async () => {
    await repo.saveMany([
      { photo: makePhoto('s1', 'homeroom', 'homeroom'), bytes: BYTES(1) },
      { photo: makePhoto('s2', 'homeroom', 'homeroom'), bytes: BYTES(2) },
      { photo: makePhoto('t1', 'teaching-class', 'tc-1'), bytes: BYTES(3) },
    ]);

    await repo.deleteByOwner('homeroom', 'homeroom');

    const left = await repo.list();
    expect(left.map((p) => p.subjectKey)).toEqual(['t1']);
    // 파일도 실제로 사라졌는지 — 파기는 메타만 지우면 안 된다
    expect(storage.binary.has('student-photos/s1.jpg')).toBe(false);
    expect(storage.binary.has('student-photos/s2.jpg')).toBe(false);
    expect(storage.binary.has('student-photos/t1.jpg')).toBe(true);
  });

  it('같은 종류라도 다른 반이면 지워지지 않는다', async () => {
    await repo.saveMany([
      { photo: makePhoto('a', 'teaching-class', 'tc-1'), bytes: BYTES(1) },
      { photo: makePhoto('b', 'teaching-class', 'tc-2'), bytes: BYTES(2) },
    ]);
    await repo.deleteByOwner('teaching-class', 'tc-1');
    expect((await repo.list()).map((p) => p.subjectKey)).toEqual(['b']);
  });

  it('★전체 삭제 후 남은 사진 0장, 남은 파일 0개', async () => {
    await repo.saveMany([
      { photo: makePhoto('s1', 'homeroom', 'homeroom'), bytes: BYTES(1) },
      { photo: makePhoto('t1', 'teaching-class', 'tc-1'), bytes: BYTES(2) },
    ]);

    await repo.deleteAll();

    expect(await repo.list()).toHaveLength(0);
    expect(await storage.listBinary('student-photos')).toHaveLength(0);
  });

  it('없는 대상을 지워도 조용히 넘어간다', async () => {
    await expect(repo.delete('없음')).resolves.toBeUndefined();
    await expect(repo.deleteByOwner('homeroom', '없음')).resolves.toBeUndefined();
  });

  it('동기화용 키 목록은 메타에 등록된 것만 준다 (고아 파일은 올라가지 않는다)', async () => {
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    // 메타에 없는 고아 바이너리를 일부러 심는다
    await storage.writeBinary('student-photos/orphan.jpg', BYTES(9));

    expect(await repo.listBinaryKeys()).toEqual(['student-photos/s1.jpg']);
  });
});

/**
 * 여러 장 저장이 중간에 끊겼을 때를 시험한다.
 *
 * 되돌리지 않으면 두 가지가 깨진다. (1) 메타에 없는 얼굴 사진이 디스크에 남아 파기 실패가 되고,
 * (2) 메타는 예전 사진을 가리키는데 파일만 새 사진이라 동기화가 장부와 실제를 다르게 본다.
 */
describe('JsonStudentPhotoRepository 부분 저장 복구', () => {
  /** N 번째 바이너리 쓰기 또는 메타 쓰기에서 실패하는 저장소 */
  class FlakyStorage extends FakeStorage {
    binaryWrites = 0;
    failBinaryWriteAt: number | null = null;
    failMetaWrite = false;

    override writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
      this.binaryWrites += 1;
      if (this.failBinaryWriteAt === this.binaryWrites) {
        return Promise.reject(new Error('디스크 쓰기 실패'));
      }
      return super.writeBinary(relPath, bytes);
    }

    override write<T>(filename: string, data: T): Promise<void> {
      if (this.failMetaWrite && filename === 'student-photos') {
        return Promise.reject(new Error('메타 저장 실패'));
      }
      return super.write(filename, data);
    }
  }

  it('★두 번째 사진에서 실패하면 먼저 쓴 새 사진 파일도 남지 않는다', async () => {
    const storage = new FlakyStorage();
    const repo = new JsonStudentPhotoRepository(storage);
    storage.failBinaryWriteAt = 2;

    await expect(
      repo.saveMany([
        { photo: makePhoto('s1', 'homeroom', 'homeroom'), bytes: BYTES(1) },
        { photo: makePhoto('s2', 'homeroom', 'homeroom'), bytes: BYTES(2) },
      ]),
    ).rejects.toThrow('디스크 쓰기 실패');

    expect(await repo.list()).toHaveLength(0);
    expect(await storage.listBinary('student-photos')).toHaveLength(0);
  });

  it('★덮어쓰던 중 실패하면 이전 사진 바이트가 그대로 복구된다', async () => {
    const storage = new FlakyStorage();
    const repo = new JsonStudentPhotoRepository(storage);
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    storage.failBinaryWriteAt = storage.binaryWrites + 2;

    await expect(
      repo.saveMany([
        { photo: makePhoto('s1', 'homeroom', 'homeroom'), bytes: BYTES(7) },
        { photo: makePhoto('s2', 'homeroom', 'homeroom'), bytes: BYTES(8) },
      ]),
    ).rejects.toThrow('디스크 쓰기 실패');

    expect(await repo.readPhoto('s1')).toEqual(BYTES(1));
    expect(await storage.listBinary('student-photos')).toEqual(['s1.jpg']);
  });

  it('★메타 저장이 실패해도 사진 파일은 저장 직전 상태로 돌아간다', async () => {
    const storage = new FlakyStorage();
    const repo = new JsonStudentPhotoRepository(storage);
    await repo.save(makePhoto('s1', 'homeroom', 'homeroom'), BYTES(1));
    storage.failMetaWrite = true;

    await expect(
      repo.saveMany([
        { photo: makePhoto('s1', 'homeroom', 'homeroom'), bytes: BYTES(7) },
        { photo: makePhoto('s2', 'homeroom', 'homeroom'), bytes: BYTES(8) },
      ]),
    ).rejects.toThrow('메타 저장 실패');

    expect((await repo.list()).map((p) => p.subjectKey)).toEqual(['s1']);
    expect(await repo.readPhoto('s1')).toEqual(BYTES(1));
    expect(await storage.listBinary('student-photos')).toEqual(['s1.jpg']);
  });
});
