/**
 * archiveSyncGateway — 아카이브 Drive 동기화(S4.1)의 렌더러 측 훅 구현.
 *
 * SyncToCloud/SyncFromCloud에 주입되는 아카이브 훅 4종을 window.electronAPI.archive
 * (체크섬 검증이 내장된 IPC — create의 스테이징 규율과 동일 계열)로 구현한다.
 *
 *  - 데스크톱(electronAPI.archive 존재)에서만 활성 — 브라우저 모드·모바일은
 *    hasArchiveSync()가 false라 훅이 주입되지 않고 기존 동기화가 그대로 동작한다.
 *  - 읽기는 archive:read(항목별 SHA-256 대조), 쓰기는 archive:import(스테이징 +
 *    매니페스트 체크섬 전건 검증 + rename)만 사용한다 — 아카이브 디렉토리를 렌더러가
 *    직접 만지는 경로는 없다.
 */

import {
  ARCHIVE_MANIFEST_FILENAME,
  buildArchiveSyncKey,
  parseArchiveSyncKey,
  validateArchiveManifest,
} from '@domain/rules/archiveRules';
import { base64ToUint8 } from '@usecases/sync/binaryBase64';

type ArchiveApi = NonNullable<NonNullable<typeof window.electronAPI>['archive']>;

function archiveApi(): ArchiveApi | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.archive ?? null;
}

/** 아카이브 동기화 가능 여부 — 데스크톱(archive IPC 존재)에서만 true. */
export function hasArchiveSync(): boolean {
  return archiveApi() !== null;
}

/**
 * 업로드 열거 훅 — 로컬 보관함의 파일 키(`archives/{term}/{relPath}`) 전체.
 * 매니페스트가 유효한 학기만 열거한다(손상 학기는 업로드하지 않는다 — 완결만 공유).
 */
export async function listArchiveSyncFiles(): Promise<string[]> {
  const api = archiveApi();
  if (!api) return [];
  const listed = await api.list();
  if (!listed.ok) return [];
  const keys: string[] = [];
  for (const summary of listed.archives) {
    if (!summary.manifestOk) continue;
    try {
      // F10a — 동기화 키는 **archiveId**(회차 디렉토리) 기준. 회차마다 별개 키라
      // "리모트에 있으면 업로드 스킵·로컬에 있으면 다운로드 스킵" 불변 계약이 그대로 성립한다.
      const read = await api.read(summary.archiveId, ARCHIVE_MANIFEST_FILENAME);
      if (!read.ok) continue;
      const validated = validateArchiveManifest(JSON.parse(read.content));
      if (!validated.ok) continue;
      const manifestKey = buildArchiveSyncKey(summary.archiveId, ARCHIVE_MANIFEST_FILENAME);
      if (manifestKey !== null) keys.push(manifestKey);
      for (const entry of validated.manifest.entries) {
        const key = buildArchiveSyncKey(summary.archiveId, entry.path);
        if (key !== null) keys.push(key);
      }
    } catch (err) {
      console.warn(
        `[archiveSyncGateway] ${summary.archiveId} 열거 실패(해당 보관함만 건너뜀):`,
        err,
      );
    }
  }
  return keys;
}

/**
 * 업로드 읽기 훅 — archive:read(체크섬 대조)로 파일 바이트를 돌려준다.
 * 부재·검증 실패는 null(해당 파일만 스킵 — 손상 파일을 Drive에 올리지 않는다).
 */
export async function readArchiveSyncFileBytes(key: string): Promise<Uint8Array | null> {
  const api = archiveApi();
  if (!api) return null;
  const parsed = parseArchiveSyncKey(key);
  if (!parsed) return null;
  const read = await api.read(parsed.term, parsed.relPath);
  if (!read.ok) {
    console.warn(`[archiveSyncGateway] ${key} 읽기 실패: ${read.error}`);
    return null;
  }
  if (read.encoding === 'base64') return base64ToUint8(read.content);
  return new TextEncoder().encode(read.content);
}

/**
 * 다운로드 스킵 판정 훅 — 로컬에 존재하는 학기 목록(손상 여부 무관 — 존재하면
 * 덮어쓰기 후보에서 제외한다. 아카이브는 불변이다).
 */
export async function listLocalArchiveTerms(): Promise<string[]> {
  const api = archiveApi();
  if (!api) return [];
  const listed = await api.list();
  if (!listed.ok) return [];
  // 로컬 보유 판정도 archiveId 기준(회차본을 서로 다른 아카이브로 취급).
  return listed.archives.map((a) => a.archiveId);
}

/** 다운로드 배치 훅 — archive:import IPC(스테이징·검증·rename)에 위임. */
export async function importArchiveTermFiles(
  term: string,
  files: Record<string, { format: 'utf8' | 'base64'; content: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const api = archiveApi();
  if (!api) return { ok: false, error: '데스크톱 앱에서만 보관함을 받을 수 있어요.' };
  const result = await api.import(term, files);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
