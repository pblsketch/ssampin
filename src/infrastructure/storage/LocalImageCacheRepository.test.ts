import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalImageCacheRepository } from './LocalImageCacheRepository';
import { DiskFullError } from '@domain/ports/IImageCachePort';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PRESENTATION = 'pres-abc123';
const REVISION_A = 'rev-A';
const REVISION_B = 'rev-B';

describe('LocalImageCacheRepository', () => {
  let userDataDir: string;
  let repo: LocalImageCacheRepository;

  beforeEach(async () => {
    userDataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'ssampin-cache-test-'),
    );
    repo = new LocalImageCacheRepository(userDataDir);
  });

  afterEach(async () => {
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────
  describe('store + exists + list', () => {
    it('PNG 저장 후 file:// 경로 반환', async () => {
      const url = await repo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER);
      expect(url.startsWith('file://')).toBe(true);
      expect(url.endsWith('p1.png')).toBe(true);

      // 실제 디스크에 파일 존재 확인
      const expected = path.join(
        userDataDir,
        'cache',
        'slides',
        PRESENTATION,
        REVISION_A,
        'p1.png',
      );
      const stat = await fs.promises.stat(expected);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBe(PNG_HEADER.length);
    });

    it('exists: 파일 1개라도 있으면 true', async () => {
      expect(await repo.exists(PRESENTATION, REVISION_A)).toBe(false);
      await repo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER);
      expect(await repo.exists(PRESENTATION, REVISION_A)).toBe(true);
    });

    it('exists: 빈 디렉토리는 false (캐시 미스 취급)', async () => {
      const emptyDir = path.join(
        userDataDir,
        'cache',
        'slides',
        PRESENTATION,
        REVISION_A,
      );
      await fs.promises.mkdir(emptyDir, { recursive: true });
      expect(await repo.exists(PRESENTATION, REVISION_A)).toBe(false);
    });

    it('list: png 파일만 반환', async () => {
      await repo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER);
      await repo.store(PRESENTATION, REVISION_A, 'p2', PNG_HEADER);
      const urls = await repo.list(PRESENTATION, REVISION_A);
      expect(urls).toHaveLength(2);
      expect(urls.every((u) => u.startsWith('file://'))).toBe(true);
      expect(urls.some((u) => u.endsWith('p1.png'))).toBe(true);
      expect(urls.some((u) => u.endsWith('p2.png'))).toBe(true);
    });

    it('list: 캐시 미스는 빈 배열', async () => {
      const urls = await repo.list(PRESENTATION, REVISION_A);
      expect(urls).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('invalidate (revisionId 변경 시 정리)', () => {
    it('exceptRevisionId 외 모든 revision 삭제', async () => {
      await repo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER);
      await repo.store(PRESENTATION, REVISION_B, 'p1', PNG_HEADER);
      await repo.invalidate(PRESENTATION, REVISION_B);

      expect(await repo.exists(PRESENTATION, REVISION_A)).toBe(false);
      expect(await repo.exists(PRESENTATION, REVISION_B)).toBe(true);
    });

    it('exceptRevisionId 미지정 시 전체 삭제', async () => {
      await repo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER);
      await repo.store(PRESENTATION, REVISION_B, 'p1', PNG_HEADER);
      await repo.invalidate(PRESENTATION);

      expect(await repo.exists(PRESENTATION, REVISION_A)).toBe(false);
      expect(await repo.exists(PRESENTATION, REVISION_B)).toBe(false);
    });

    it('존재하지 않는 presentation은 throw 안 함 (멱등)', async () => {
      await expect(
        repo.invalidate('pres-nope', 'rev-anything'),
      ).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('path safety (defense in depth)', () => {
    it('presentationId에 슬래시 포함 시 reject', async () => {
      await expect(
        repo.store('pres/../etc', REVISION_A, 'p1', PNG_HEADER),
      ).rejects.toThrow(/Invalid presentationId/);
    });

    it('revisionId에 ".." 포함 시 reject', async () => {
      await expect(
        repo.store(PRESENTATION, '..', 'p1', PNG_HEADER),
      ).rejects.toThrow(/Invalid revisionId/);
    });

    it('pageId에 백슬래시 포함 시 reject', async () => {
      await expect(
        repo.store(PRESENTATION, REVISION_A, 'p1\\evil', PNG_HEADER),
      ).rejects.toThrow(/Invalid pageId/);
    });

    it('exists는 경로 안전 위반에도 throw (사일런트 false 회피)', async () => {
      await expect(repo.exists('pres/..', REVISION_A)).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('disk-full mapping', () => {
    it('ENOSPC 에러는 DiskFullError로 변환', async () => {
      // userDataDir을 read-only가 아닌 ENOSPC 시뮬레이션 — fake fs는 무리.
      // 대신 LocalImageCacheRepository가 ENOSPC를 받았을 때 어떻게 throw하는지
      // 직접 internal 검증: store가 mkdir/writeFile 중 하나에서 ENOSPC를 만나면
      // DiskFullError로 변환되어야 한다.
      const fakeRepo = new LocalImageCacheRepository(userDataDir);
      // monkey-patch: writeFile이 ENOSPC throw하도록
      const original = fs.promises.writeFile;
      const enospc = Object.assign(new Error('no space'), { code: 'ENOSPC' });
      fs.promises.writeFile = ((): Promise<void> =>
        Promise.reject(enospc)) as typeof fs.promises.writeFile;
      try {
        await expect(
          fakeRepo.store(PRESENTATION, REVISION_A, 'p1', PNG_HEADER),
        ).rejects.toBeInstanceOf(DiskFullError);
      } finally {
        fs.promises.writeFile = original;
      }
    });
  });
});
