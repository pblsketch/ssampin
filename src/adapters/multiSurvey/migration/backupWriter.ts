/**
 * v1 백업 writer (Design §4.3, worker-2 영역).
 *
 * .ssampin/backup/v1/<YYYY-MM-DD_HH-mm-ss>/ 구조로 v1 원본을 보관.
 * rootDir는 테스트 시 tmpdir로 override 가능.
 * DN-10: 30일 자동 보존 후 정리.
 */

import { mkdir, writeFile, readdir, rm, stat, utimes as fsUtimes } from 'node:fs/promises';
import { join, resolve, normalize, relative } from 'node:path';
import os from 'node:os';

const DEFAULT_ROOT = join(os.homedir(), '.ssampin', 'backup', 'v1');
const DEFAULT_MAX_AGE_DAYS = 30;

// ──────────────────────────────────────────────
// Path traversal guard
// ──────────────────────────────────────────────

/**
 * Ensures that `targetPath` does not escape `rootDir` via ".." segments.
 * @throws Error on path traversal attempt
 */
function assertNoTraversal(rootDir: string, targetPath: string): void {
  const normalizedRoot = normalize(resolve(rootDir));
  const normalizedTarget = normalize(resolve(targetPath));
  const rel = relative(normalizedRoot, normalizedTarget);
  if (rel.startsWith('..') || normalize(rel) !== rel.replace(/\\/g, '/').replace(/^\.\..*/, '')) {
    // Check using startsWith after resolving
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      throw new Error(`Path traversal attempt detected: "${targetPath}" escapes root "${rootDir}"`);
    }
  }
}

// ──────────────────────────────────────────────
// Timestamp dir name: YYYY-MM-DD_HH-mm-ss (UTC)
// ──────────────────────────────────────────────

function buildTimestampDirName(now: Date = new Date()): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const y = now.getUTCFullYear();
  const mo = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const h = pad(now.getUTCHours());
  const mi = pad(now.getUTCMinutes());
  const s = pad(now.getUTCSeconds());
  return `${y}-${mo}-${d}_${h}-${mi}-${s}`;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface WriteBackupResult {
  readonly backupPath: string;
  readonly metadataPath: string;
}

/**
 * v1 데이터를 타임스탬프 디렉터리에 백업한다.
 *
 * @param v1Data   v1 MultiSurvey 배열
 * @param appVersion  앱 버전 문자열 (metadata.json에 기록)
 * @param rootDir  루트 디렉터리 (기본: ~/.ssampin/backup/v1)
 * @returns 생성된 sessions.json 경로와 metadata.json 경로
 */
export async function writeBackup(
  v1Data: unknown[],
  appVersion: string,
  rootDir: string = DEFAULT_ROOT,
): Promise<WriteBackupResult> {
  const resolvedRoot = resolve(rootDir);
  const tsDir = join(resolvedRoot, buildTimestampDirName());
  const failedDir = join(tsDir, 'failed');

  assertNoTraversal(resolvedRoot, tsDir);

  await mkdir(failedDir, { recursive: true });

  const sessionsPath = join(tsDir, 'sessions.json');
  const metadataPath = join(tsDir, 'metadata.json');

  assertNoTraversal(resolvedRoot, sessionsPath);
  assertNoTraversal(resolvedRoot, metadataPath);

  await writeFile(sessionsPath, JSON.stringify(v1Data, null, 2), 'utf-8');
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        writtenAt: new Date().toISOString(),
        appVersion,
        count: v1Data.length,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { backupPath: sessionsPath, metadataPath };
}

/**
 * maxAgeDays일보다 오래된 타임스탬프 백업 디렉터리를 삭제한다 (DN-10: 30일).
 *
 * @param rootDir    루트 디렉터리 (기본: ~/.ssampin/backup/v1)
 * @param maxAgeDays 보존 기간 (기본: 30)
 */
export async function cleanupOldBackups(
  rootDir: string = DEFAULT_ROOT,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const resolvedRoot = resolve(rootDir);
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  let entries: string[];
  try {
    entries = await readdir(resolvedRoot);
  } catch {
    // Root does not exist yet — nothing to clean up
    return { deletedCount: 0, deletedPaths: [] };
  }

  const deletedPaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(resolvedRoot, entry);
    assertNoTraversal(resolvedRoot, entryPath);

    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(entryPath);
    } catch {
      continue;
    }

    if (!info.isDirectory()) continue;

    if (info.mtimeMs < cutoffMs) {
      await rm(entryPath, { recursive: true, force: true });
      deletedPaths.push(entryPath);
    }
  }

  return { deletedCount: deletedPaths.length, deletedPaths };
}

// Exported for testing only — allows overriding mtime in tests via fs.utimes
export { fsUtimes as _fsUtimes };
