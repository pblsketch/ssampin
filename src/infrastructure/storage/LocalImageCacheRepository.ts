/**
 * LocalImageCacheRepository — IImageCachePort 구현체.
 *
 * 슬라이드 이미지를 로컬 디스크에 영구 저장. 단명 contentUrl(~30분 TTL)을
 * 받자마자 다운로드해 file:// 경로로 변환하기 위한 인프라.
 *
 * 경로 정책 (Plan §3 + Design §5.4):
 *   {userData}/cache/slides/{presentationId}/{revisionId}/{pageId}.png
 *
 * revisionId가 변경되면 이전 폴더를 invalidate으로 정리 — 디스크 누적 방지.
 *
 * 메인 프로세스에서만 import (renderer는 IPC로 file:// 경로만 받음).
 */

import fs from 'fs';
import path from 'path';

import type { IImageCachePort } from '@domain/ports/IImageCachePort';
import { DiskFullError } from '@domain/ports/IImageCachePort';

/** 경로 컴포넌트 sanitization (URL-safe 영숫자/`_`/`-`만 허용) */
const SAFE_PATH_COMPONENT = /^[A-Za-z0-9_-]+$/;

function assertSafePathComponent(component: string, label: string): void {
  if (!SAFE_PATH_COMPONENT.test(component)) {
    throw new Error(
      `Invalid ${label} (must match ${SAFE_PATH_COMPONENT}): ${component}`,
    );
  }
}

/**
 * file:// URL 변환. Windows 경로(C:\path\to\file)도 안전하게 처리.
 */
function toFileUrl(absPath: string): string {
  // path.resolve로 절대화 후 file:// 변환
  const resolved = path.resolve(absPath);
  // Windows: C:\foo\bar → file:///C:/foo/bar
  // POSIX:   /foo/bar   → file:///foo/bar
  if (process.platform === 'win32') {
    return `file:///${resolved.replace(/\\/g, '/')}`;
  }
  return `file://${resolved}`;
}

export class LocalImageCacheRepository implements IImageCachePort {
  /** {userData}/cache/slides */
  private readonly slidesRoot: string;

  /**
   * @param userDataDir Electron `app.getPath('userData')` 결과
   *                    (테스트에서는 os.tmpdir() 하위 임시 폴더 주입 가능)
   */
  constructor(userDataDir: string) {
    this.slidesRoot = path.join(userDataDir, 'cache', 'slides');
  }

  private revisionDir(presentationId: string, revisionId: string): string {
    assertSafePathComponent(presentationId, 'presentationId');
    assertSafePathComponent(revisionId, 'revisionId');
    return path.join(this.slidesRoot, presentationId, revisionId);
  }

  private pagePath(
    presentationId: string,
    revisionId: string,
    pageId: string,
  ): string {
    assertSafePathComponent(pageId, 'pageId');
    return path.join(this.revisionDir(presentationId, revisionId), `${pageId}.png`);
  }

  async exists(presentationId: string, revisionId: string): Promise<boolean> {
    const dir = this.revisionDir(presentationId, revisionId);
    try {
      const stat = await fs.promises.stat(dir);
      if (!stat.isDirectory()) return false;
      // 빈 디렉토리는 캐시 미스로 취급
      const entries = await fs.promises.readdir(dir);
      return entries.some((e) => e.endsWith('.png'));
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  async list(
    presentationId: string,
    revisionId: string,
  ): Promise<readonly string[]> {
    const dir = this.revisionDir(presentationId, revisionId);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    const pngs = entries.filter((e) => e.endsWith('.png'));
    return pngs.map((e) => toFileUrl(path.join(dir, e)));
  }

  /**
   * `presentationId` 폴더 안에서 exceptRevisionId가 아닌 모든 revision 폴더 삭제.
   * exceptRevisionId 미지정 시 전체 삭제.
   *
   * 멱등 — 폴더가 없어도 throw하지 않음.
   */
  async invalidate(
    presentationId: string,
    exceptRevisionId?: string,
  ): Promise<void> {
    assertSafePathComponent(presentationId, 'presentationId');
    if (exceptRevisionId !== undefined) {
      assertSafePathComponent(exceptRevisionId, 'exceptRevisionId');
    }
    const presDir = path.join(this.slidesRoot, presentationId);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(presDir);
    } catch (err) {
      if (isEnoent(err)) return;
      throw err;
    }
    for (const entry of entries) {
      if (entry === exceptRevisionId) continue;
      const target = path.join(presDir, entry);
      try {
        await fs.promises.rm(target, { recursive: true, force: true });
      } catch {
        // 정리 실패는 swallow — 다음 invalidate 호출에서 재시도
      }
    }
  }

  async store(
    presentationId: string,
    revisionId: string,
    pageId: string,
    pngBytes: Uint8Array,
  ): Promise<string> {
    const dir = this.revisionDir(presentationId, revisionId);
    const target = this.pagePath(presentationId, revisionId, pageId);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(target, Buffer.from(pngBytes));
    } catch (err) {
      if (isEnoSpc(err)) throw new DiskFullError();
      throw err;
    }
    return toFileUrl(target);
  }
}

// ─────────────────────────────────────────────────────────────
// Error code helpers
// ─────────────────────────────────────────────────────────────

function isErrno(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

function isEnoent(err: unknown): boolean {
  return isErrno(err, 'ENOENT');
}

function isEnoSpc(err: unknown): boolean {
  return isErrno(err, 'ENOSPC');
}
