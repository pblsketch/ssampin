/**
 * 자리배치표용 사진 읽기 — **열쇠 변환**이 핵심이다.
 *
 * 저장소는 사진을 담임이면 `Student.id`, 수업반이면 `{반id}--{학년-반-번호}` 로 갖고 있다.
 * 좌석표는 담임이면 `Student.id`, 수업반이면 `학년-반-번호` 로 학생을 찾는다.
 * 이 변환이 어긋나면 **사진이 조용히 한 장도 안 붙는다** — 파일은 정상으로 만들어지므로
 * 실제로 열어 보기 전에는 모른다. 그래서 여기서 못 박아 둔다.
 */
import { describe, it, expect } from 'vitest';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhoto } from '@domain/entities/StudentPhoto';
import { loadSeatingPhotos, hasSeatingPhotos } from '../LoadSeatingPhotos';

function photo(over: Partial<StudentPhoto> & Pick<StudentPhoto, 'subjectKey'>): StudentPhoto {
  return {
    ownerKind: 'homeroom',
    ownerKey: 'homeroom',
    storageRef: `student-photos/${over.subjectKey}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 3,
    width: 240,
    height: 320,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function makeRepo(
  photos: readonly StudentPhoto[],
  bytesBySubject: Record<string, Uint8Array | null> = {},
): IStudentPhotoRepository {
  return {
    list: async () => photos,
    readPhoto: async (subjectKey: string) =>
      subjectKey in bytesBySubject ? bytesBySubject[subjectKey]! : new Uint8Array([1, 2, 3]),
    save: async () => {},
    saveMany: async () => {},
    delete: async () => {},
    deleteByOwner: async () => {},
    deleteAll: async () => {},
    listBinaryKeys: async () => [],
  };
}

describe('loadSeatingPhotos', () => {
  it('담임 — 열쇠가 Student.id 그대로다', async () => {
    const repo = makeRepo([photo({ subjectKey: 'stu-1' }), photo({ subjectKey: 'stu-2' })]);

    const result = await loadSeatingPhotos(repo, { ownerKind: 'homeroom', ownerKey: 'homeroom' });

    expect([...result.keys()].sort()).toEqual(['stu-1', 'stu-2']);
    expect(result.get('stu-1')?.width).toBe(240);
  });

  it('수업반 — 반 번호 접두사를 떼고 `학년-반-번호` 로 바꾼다', async () => {
    const repo = makeRepo([
      photo({ subjectKey: 'tc-9--1-3-05', ownerKind: 'teaching-class', ownerKey: 'tc-9' }),
      photo({ subjectKey: 'tc-9--1-3-06', ownerKind: 'teaching-class', ownerKey: 'tc-9' }),
    ]);

    const result = await loadSeatingPhotos(repo, {
      ownerKind: 'teaching-class',
      ownerKey: 'tc-9',
    });

    // 좌석표가 쓰는 열쇠로 나와야 한다 (반 id 접두사가 남아 있으면 사진이 안 붙는다)
    expect([...result.keys()].sort()).toEqual(['1-3-05', '1-3-06']);
  });

  it('다른 명단의 사진은 섞이지 않는다', async () => {
    const repo = makeRepo([
      photo({ subjectKey: 'stu-1' }), // 담임
      photo({ subjectKey: 'tc-9--1-3-05', ownerKind: 'teaching-class', ownerKey: 'tc-9' }),
      photo({ subjectKey: 'tc-7--1-3-05', ownerKind: 'teaching-class', ownerKey: 'tc-7' }),
    ]);

    const mine = await loadSeatingPhotos(repo, { ownerKind: 'teaching-class', ownerKey: 'tc-9' });
    expect([...mine.keys()]).toEqual(['1-3-05']);

    const homeroom = await loadSeatingPhotos(repo, {
      ownerKind: 'homeroom',
      ownerKey: 'homeroom',
    });
    expect([...homeroom.keys()]).toEqual(['stu-1']);
  });

  it('사진 본체를 못 읽은 학생은 조용히 빠진다 (배치표 전체는 살린다)', async () => {
    const repo = makeRepo([photo({ subjectKey: 'stu-1' }), photo({ subjectKey: 'stu-2' })], {
      'stu-2': null,
    });

    const result = await loadSeatingPhotos(repo, { ownerKind: 'homeroom', ownerKey: 'homeroom' });

    expect([...result.keys()]).toEqual(['stu-1']);
  });

  it('빈 파일도 없는 것으로 친다', async () => {
    const repo = makeRepo([photo({ subjectKey: 'stu-1' })], { 'stu-1': new Uint8Array() });

    const result = await loadSeatingPhotos(repo, { ownerKind: 'homeroom', ownerKey: 'homeroom' });

    expect(result.size).toBe(0);
  });
});

describe('hasSeatingPhotos', () => {
  it('그 명단에 사진이 있을 때만 참이다', async () => {
    const repo = makeRepo([
      photo({ subjectKey: 'tc-9--1-3-05', ownerKind: 'teaching-class', ownerKey: 'tc-9' }),
    ]);

    expect(await hasSeatingPhotos(repo, { ownerKind: 'teaching-class', ownerKey: 'tc-9' })).toBe(
      true,
    );
    expect(await hasSeatingPhotos(repo, { ownerKind: 'teaching-class', ownerKey: 'tc-7' })).toBe(
      false,
    );
    expect(await hasSeatingPhotos(repo, { ownerKind: 'homeroom', ownerKey: 'homeroom' })).toBe(
      false,
    );
  });
});
