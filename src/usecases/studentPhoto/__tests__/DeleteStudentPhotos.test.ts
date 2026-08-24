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
import { withDataOperationLock } from '@usecases/shared/dataOperationMutex';

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
    expect(result).toEqual({ deletedCount: 0, cloudFailures: [], cloudPendingCount: 0 });
    expect(repository.calls).toEqual([]);
  });
});

describe('deleteStudentPhotos — 클라우드 파기 예약', () => {
  it('동기화를 안 쓰는 상태면 로컬만 지우고 끝난다', async () => {
    const result = await deleteStudentPhotos({ repository }, { scope: 'all' });
    expect(result.cloudFailures).toEqual([]);
    expect(result.cloudPendingCount).toBe(0);
  });

  it('동기화가 켜져 있으면 실제 파일 삭제를 다음 동기화로 예약한다', async () => {
    const manifest = {
      version: 1,
      lastSyncedAt: '2026-08-19T00:00:00.000Z',
      deviceId: 'dev-1',
      deviceName: '내 기기',
      files: {},
    };
    const syncRepository = {
      getLocalManifest: () => Promise.resolve(manifest),
      saveLocalManifest: () => Promise.resolve(),
    };
    const result = await deleteStudentPhotos(
      { repository, syncRepository, cloud: {} },
      { scope: 'owner', ownerKind: 'homeroom', ownerKey: 'homeroom' },
    );

    expect(result.cloudFailures).toEqual([]);
    expect(result.cloudPendingCount).toBe(2);
  });
});

describe('deleteStudentPhotos — 삭제 전파 기준 보존', () => {
  function fakeSyncRepo(files: Record<string, unknown>) {
    const state = {
      manifest: {
        version: 1,
        lastSyncedAt: '2026-08-19T00:00:00.000Z',
        deviceId: 'dev-1',
        deviceName: '내 기기',
        files,
        deletions: {} as Record<string, { deletedAt: string; deletedBy: string }>,
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

  it('오프라인 삭제도 다음 동기화가 전파할 수 있도록 삭제 표식을 남긴다', async () => {
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
    expect(Object.keys(state.manifest.deletions).sort()).toEqual([
      'student-photos/s1.jpg',
      'student-photos/s2.jpg',
    ]);
    expect(state.manifest.deletions['student-photos/s1.jpg']?.deletedBy).toBe('dev-1');
  });

  it('장부 저장소가 불안정해도 로컬 파기 자체는 완료한다', async () => {
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
    expect(result.cloudFailures).toHaveLength(3);
  });

  it('동기화 작업이 진행 중이면 장부와 사진 삭제를 모두 기다린다', async () => {
    let releaseSync: () => void = () => undefined;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const activeSync = withDataOperationLock(async () => syncGate);
    await Promise.resolve();
    const saveLocalManifest = vi.fn(async () => undefined);
    const deletion = deleteStudentPhotos(
      {
        repository,
        syncRepository: {
          getLocalManifest: async () => ({
            version: 2,
            lastSyncedAt: '2026-08-24T00:00:00.000Z',
            deviceId: 'dev-1',
            deviceName: '내 기기',
            files: {},
          }),
          saveLocalManifest,
        },
      },
      { scope: 'all' },
    );

    await Promise.resolve();
    expect(repository.photos).toHaveLength(3);
    expect(saveLocalManifest).not.toHaveBeenCalled();

    releaseSync();
    await Promise.all([activeSync, deletion]);
    expect(repository.photos).toHaveLength(0);
    expect(saveLocalManifest).toHaveBeenCalledOnce();
  });
});
