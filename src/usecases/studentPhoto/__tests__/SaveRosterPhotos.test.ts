/**
 * 명렬표 사진 저장 — **한 장이 실패해도 나머지는 저장된다**는 게 핵심이다.
 * 반 전체가 통째로 실패하면 교사는 왜 안 되는지 알 수 없다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IImageResizerPort, ResizedImage } from '@domain/ports/IImageResizerPort';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhoto } from '@domain/entities/StudentPhoto';
import { STUDENT_PHOTO_LIMITS } from '@domain/rules/studentPhotoRules';
import { saveRosterPhotos, type RosterPhotoToSave } from '../SaveRosterPhotos';

const NOW = '2026-08-19T09:00:00.000Z';

/** 저장된 것만 기억하는 가짜 저장소 */
class FakeRepository implements IStudentPhotoRepository {
  saved: Array<{ photo: StudentPhoto; bytes: Uint8Array }> = [];
  list(): Promise<readonly StudentPhoto[]> {
    return Promise.resolve(this.saved.map((s) => s.photo));
  }
  save(photo: StudentPhoto, bytes: Uint8Array): Promise<void> {
    this.saved.push({ photo, bytes });
    return Promise.resolve();
  }
  saveMany(entries: ReadonlyArray<{ photo: StudentPhoto; bytes: Uint8Array }>): Promise<void> {
    this.saved.push(...entries);
    return Promise.resolve();
  }
  readPhoto(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  deleteByOwner(): Promise<void> {
    return Promise.resolve();
  }
  deleteAll(): Promise<void> {
    return Promise.resolve();
  }
  listBinaryKeys(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/** 원하는 크기·동작을 지정할 수 있는 가짜 축소기 */
class FakeResizer implements IImageResizerPort {
  calls = 0;
  constructor(
    private readonly behavior: (
      bytes: Uint8Array,
      quality: number,
      call: number,
    ) => ResizedImage | Error = (bytes) => ({
      bytes: bytes.subarray(0, 10),
      mimeType: 'image/jpeg',
      width: 240,
      height: 320,
    }),
  ) {}
  resize(bytes: Uint8Array, _mime: string, _max: number, quality: number): Promise<ResizedImage> {
    this.calls += 1;
    const result = this.behavior(bytes, quality, this.calls);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  }
}

function candidate(overrides: Partial<RosterPhotoToSave> = {}): RosterPhotoToSave {
  return {
    studentId: 's1',
    studentNumber: 1,
    studentName: '강나영',
    bytes: new Uint8Array(1000).fill(1),
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

describe('saveRosterPhotos', () => {
  let repository: FakeRepository;
  beforeEach(() => {
    repository = new FakeRepository();
  });

  it('정상 사진을 줄여서 저장한다', async () => {
    const result = await saveRosterPhotos(
      { repository, resizer: new FakeResizer() },
      { ownerKind: 'homeroom', ownerKey: 'homeroom', photos: [candidate()], now: NOW },
    );

    expect(result.savedCount).toBe(1);
    expect(result.skipped).toEqual([]);
    const saved = repository.saved[0]!;
    expect(saved.photo).toMatchObject({
      studentId: 's1',
      ownerKind: 'homeroom',
      storageRef: 'student-photos/s1.jpg',
      width: 240,
      height: 320,
      byteSize: 10,
      updatedAt: NOW,
    });
  });

  it('학번·이름은 표시용으로만 함께 저장된다 (식별은 studentId 로)', async () => {
    await saveRosterPhotos(
      { repository, resizer: new FakeResizer() },
      { ownerKind: 'teaching-class', ownerKey: 'tc-1', photos: [candidate()], now: NOW },
    );
    expect(repository.saved[0]!.photo.studentNumber).toBe(1);
    expect(repository.saved[0]!.photo.studentName).toBe('강나영');
  });

  it('★한 장이 실패해도 나머지는 저장하고, 누가 왜 빠졌는지 알려 준다', async () => {
    const resizer = new FakeResizer((bytes) =>
      bytes[0] === 9
        ? new Error('깨진 이미지')
        : { bytes: bytes.subarray(0, 10), mimeType: 'image/jpeg', width: 240, height: 320 },
    );

    const result = await saveRosterPhotos(
      { repository, resizer },
      {
        ownerKind: 'homeroom',
        ownerKey: 'homeroom',
        photos: [
          candidate({ studentId: 'ok1' }),
          candidate({
            studentId: 'bad',
            studentName: '김가영',
            bytes: new Uint8Array(1000).fill(9),
          }),
          candidate({ studentId: 'ok2' }),
        ],
        now: NOW,
      },
    );

    expect(result.savedCount).toBe(2);
    expect(repository.saved.map((s) => s.photo.studentId)).toEqual(['ok1', 'ok2']);
    expect(result.skipped).toEqual([
      { studentId: 'bad', studentName: '김가영', reason: 'RESIZE_FAILED' },
    ]);
  });

  it('허용하지 않는 형식은 축소를 시도하지도 않는다', async () => {
    const resizer = new FakeResizer();
    const result = await saveRosterPhotos(
      { repository, resizer },
      {
        ownerKind: 'homeroom',
        ownerKey: 'homeroom',
        photos: [candidate({ mimeType: 'image/gif' })],
        now: NOW,
      },
    );
    expect(resizer.calls).toBe(0);
    expect(result.skipped[0]!.reason).toBe('UNSUPPORTED_MIME');
  });

  it('원본이 상한을 넘으면 건너뛴다', async () => {
    const huge = new Uint8Array(STUDENT_PHOTO_LIMITS.MAX_SOURCE_BYTES + 1);
    const result = await saveRosterPhotos(
      { repository, resizer: new FakeResizer() },
      {
        ownerKind: 'homeroom',
        ownerKey: 'homeroom',
        photos: [candidate({ bytes: huge })],
        now: NOW,
      },
    );
    expect(result.skipped[0]!.reason).toBe('SOURCE_TOO_LARGE');
  });

  it('상한을 넘으면 품질을 낮춰 한 번 더 줄인다', async () => {
    const big = new Uint8Array(STUDENT_PHOTO_LIMITS.MAX_STORED_BYTES + 100);
    const small = new Uint8Array(1000);
    const resizer = new FakeResizer((_bytes, quality) => ({
      bytes: quality < STUDENT_PHOTO_LIMITS.JPEG_QUALITY ? small : big,
      mimeType: 'image/jpeg',
      width: 240,
      height: 320,
    }));

    const result = await saveRosterPhotos(
      { repository, resizer },
      { ownerKind: 'homeroom', ownerKey: 'homeroom', photos: [candidate()], now: NOW },
    );

    expect(resizer.calls).toBe(2);
    expect(result.savedCount).toBe(1);
    expect(repository.saved[0]!.photo.byteSize).toBe(1000);
  });

  it('두 번 줄여도 상한을 넘으면 그 학생만 뺀다', async () => {
    const big = new Uint8Array(STUDENT_PHOTO_LIMITS.MAX_STORED_BYTES + 100);
    const resizer = new FakeResizer(() => ({
      bytes: big,
      mimeType: 'image/jpeg',
      width: 240,
      height: 320,
    }));

    const result = await saveRosterPhotos(
      { repository, resizer },
      { ownerKind: 'homeroom', ownerKey: 'homeroom', photos: [candidate()], now: NOW },
    );

    expect(result.savedCount).toBe(0);
    expect(result.skipped[0]!.reason).toBe('STILL_TOO_LARGE');
  });

  it('사진이 0장이면 저장을 시도하지 않는다', async () => {
    const result = await saveRosterPhotos(
      { repository, resizer: new FakeResizer() },
      { ownerKind: 'homeroom', ownerKey: 'homeroom', photos: [], now: NOW },
    );
    expect(result).toEqual({ savedCount: 0, skipped: [] });
    expect(repository.saved).toHaveLength(0);
  });
});
