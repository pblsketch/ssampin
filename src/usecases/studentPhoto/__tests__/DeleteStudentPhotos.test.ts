/**
 * 학생 사진 파기.
 *
 * 여기서 지키는 것은 하나다 — **"지웠습니다"가 사실이어야 한다.**
 * 사진을 드라이브로 동기화하기로 했으므로 로컬만 지우면 클라우드에는 그대로 남는다.
 * 그 상태로 파기했다고 안내하면 개인정보 처리방침 위반이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StudentPhoto } from '@domain/entities/StudentPhoto';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import { studentPhotoStorageRef } from '@domain/rules/studentPhotoRules';
import { deleteStudentPhotos } from '../DeleteStudentPhotos';

function makePhoto(
  subjectKey: string,
  ownerKind: StudentPhoto['ownerKind'] = 'homeroom',
  ownerKey = 'homeroom',
): StudentPhoto {
  return {
    subjectKey,
    ownerKind,
    ownerKey,
    storageRef: studentPhotoStorageRef(subjectKey),
    mimeType: 'image/jpeg',
    byteSize: 10,
    width: 240,
    height: 320,
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

class FakeRepository implements IStudentPhotoRepository {
  photos: StudentPhoto[] = [];
  calls: string[] = [];
  list(): Promise<readonly StudentPhoto[]> {
    return Promise.resolve(this.photos);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveMany(): Promise<void> {
    return Promise.resolve();
  }
  readPhoto(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  delete(subjectKey: string): Promise<void> {
    this.calls.push(`delete:${subjectKey}`);
    this.photos = this.photos.filter((p) => p.subjectKey !== subjectKey);
    return Promise.resolve();
  }
  deleteByOwner(kind: StudentPhoto['ownerKind'], key: string): Promise<void> {
    this.calls.push(`deleteByOwner:${kind}:${key}`);
    this.photos = this.photos.filter((p) => !(p.ownerKind === kind && p.ownerKey === key));
    return Promise.resolve();
  }
  deleteAll(): Promise<void> {
    this.calls.push('deleteAll');
    this.photos = [];
    return Promise.resolve();
  }
  listBinaryKeys(): Promise<string[]> {
    return Promise.resolve(this.photos.map((p) => p.storageRef));
  }
}

let repository: FakeRepository;

beforeEach(() => {
  repository = new FakeRepository();
  repository.photos = [makePhoto('s1'), makePhoto('s2'), makePhoto('t1', 'teaching-class', 'tc-1')];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deleteStudentPhotos — 로컬', () => {
  it('전체 삭제', async () => {
    const result = await deleteStudentPhotos({ repository }, { scope: 'all' });
    expect(result.deletedCount).toBe(3);
    expect(repository.calls).toEqual(['deleteAll']);
    expect(repository.photos).toHaveLength(0);
  });

  it('반별 삭제 — 그 반만 지우고 다른 반은 남긴다', async () => {
    const result = await deleteStudentPhotos(
      { repository },
      { scope: 'owner', ownerKind: 'homeroom', ownerKey: 'homeroom' },
    );
    expect(result.deletedCount).toBe(2);
    expect(repository.photos.map((p) => p.subjectKey)).toEqual(['t1']);
  });

  it('한 명만 삭제', async () => {
    const result = await deleteStudentPhotos(
      { repository },
      { scope: 'student', subjectKey: 's1' },
    );
    expect(result.deletedCount).toBe(1);
    expect(repository.calls).toEqual(['delete:s1']);
  });

  it('지울 게 없으면 아무 일도 하지 않는다', async () => {
    const result = await deleteStudentPhotos(
      { repository },
      { scope: 'student', subjectKey: '없음' },
    );
    expect(result).toEqual({ deletedCount: 0, cloudFailures: [] });
    expect(repository.calls).toEqual([]);
  });
});

describe('deleteStudentPhotos — 클라우드까지 파기', () => {
  it('★로컬뿐 아니라 클라우드에서도 같은 파일을 지운다', async () => {
    const deleteSyncFile = vi.fn().mockResolvedValue(undefined);

    const result = await deleteStudentPhotos(
      { repository, cloud: { port: { deleteSyncFile }, folderId: 'folder-1' } },
      { scope: 'owner', ownerKind: 'homeroom', ownerKey: 'homeroom' },
    );

    expect(result.cloudFailures).toEqual([]);
    expect(deleteSyncFile).toHaveBeenCalledTimes(2);
    // 업로드 때와 같은 파일명 규칙이어야 실제로 지워진다
    expect(deleteSyncFile).toHaveBeenCalledWith('folder-1', 'student-photos__s1.jpg.json');
    expect(deleteSyncFile).toHaveBeenCalledWith('folder-1', 'student-photos__s2.jpg.json');
  });

  it('동기화를 안 쓰는 상태면 로컬만 지우고 끝난다', async () => {
    const result = await deleteStudentPhotos({ repository }, { scope: 'all' });
    expect(result.cloudFailures).toEqual([]);
  });

  it('★클라우드 삭제가 실패해도 로컬은 지우고, 남은 파일을 사실대로 알린다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteSyncFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('인터넷 끊김'))
      .mockResolvedValue(undefined);

    const result = await deleteStudentPhotos(
      { repository, cloud: { port: { deleteSyncFile }, folderId: 'folder-1' } },
      { scope: 'owner', ownerKind: 'homeroom', ownerKey: 'homeroom' },
    );

    // 로컬 파기는 반드시 끝난다 (인터넷이 없다고 파기가 막히면 안 된다)
    expect(repository.photos.map((p) => p.subjectKey)).toEqual(['t1']);
    // 그러나 클라우드에 남은 것을 조용히 넘기지 않는다
    expect(result.cloudFailures).toEqual(['student-photos/s1.jpg']);
    expect(result.deletedCount).toBe(2);
  });

  it('클라우드가 전부 실패해도 예외를 던지지 않는다 (파기 자체는 진행돼야 한다)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteSyncFile = vi.fn().mockRejectedValue(new Error('로그인 만료'));

    const result = await deleteStudentPhotos(
      { repository, cloud: { port: { deleteSyncFile }, folderId: 'f' } },
      { scope: 'all' },
    );

    expect(repository.photos).toHaveLength(0);
    expect(result.cloudFailures).toHaveLength(3);
  });
});

/**
 * ★ QA 발견 C2 — 지운 사진이 동기화 장부에 남으면 안 된다.
 *
 * 장부에만 남으면 다음 동기화가 "있어야 할 파일이 없다"고 판단해 무결성 오류를 던지고,
 * 그 오류는 사이클 전체를 멈춘다 — 사진과 무관한 출결·기록 동기화까지 함께 죽는다.
 */
describe('deleteStudentPhotos — 동기화 장부 정리 (C2)', () => {
  function fakeSyncRepo(files: Record<string, unknown>) {
    const state = {
      manifest: {
        version: 1,
        lastSyncedAt: '2026-08-19T00:00:00.000Z',
        deviceId: 'dev-1',
        deviceName: '내 기기',
        files,
      },
    };
    return {
      state,
      repo: {
        getLocalManifest: () => Promise.resolve(state.manifest as never),
        saveLocalManifest: (m: never) => {
          state.manifest = m;
          return Promise.resolve();
        },
      },
    };
  }

  it('★지운 사진의 항목이 장부에서 빠진다', async () => {
    const entry = { lastModified: '', checksum: 'x', size: 1 };
    const { state, repo } = fakeSyncRepo({
      'student-photos/s1.jpg': entry,
      'student-photos/s2.jpg': entry,
      'obs-attachments/keep.png': entry,
      students: entry,
    });

    await deleteStudentPhotos(
      { repository, syncRepository: repo },
      { scope: 'owner', ownerKind: 'homeroom', ownerKey: 'homeroom' },
    );

    expect(Object.keys(state.manifest.files).sort()).toEqual([
      'obs-attachments/keep.png',
      'students',
    ]);
  });

  it('장부 정리에 실패해도 파기 자체는 되돌리지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = {
      getLocalManifest: () => Promise.reject(new Error('장부 못 읽음')),
      saveLocalManifest: () => Promise.resolve(),
    };

    const result = await deleteStudentPhotos(
      { repository, syncRepository: repo },
      { scope: 'all' },
    );

    expect(result.deletedCount).toBe(3);
    expect(repository.photos).toHaveLength(0);
  });
});
