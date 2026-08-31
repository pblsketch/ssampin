/**
 * Google Drive 동기화 어댑터
 * IDriveSyncPort 구현체 — "쌤핀 동기화" 폴더의 v2 전용 네임스페이스에 업로드/다운로드
 *
 * 과제수합 전용인 GoogleDriveClient와는 별개 클래스.
 * 내부적으로 동일한 Drive REST API v3를 사용하되, 동기화 전용 로직으로 구성.
 */

import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';
import type { DriveFolderInfo } from '@domain/ports/IGoogleDrivePort';
import type { IDriveSyncPort, DriveSyncFileListItem } from '@domain/ports/IDriveSyncPort';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';
import { MAX_DRIVE_RETRIES, isRetryableDriveStatus, computeDriveRetryDelayMs } from './driveRetry';
import {
  fetchWithTimeout,
  readBodyWithTimeout,
  transferTimeoutForBytes,
  GOOGLE_META_TIMEOUT_MS,
  GOOGLE_TRANSFER_TIMEOUT_MS,
} from './fetchWithTimeout';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SYNC_FOLDER_NAME = '쌤핀 동기화';
const MANIFEST_FILENAME = 'v2--manifest.json';
const LEGACY_MANIFEST_FILENAME = 'manifest.json';
const SYNC_FILE_PREFIX = 'v2--';
/** Drive files.list 한 페이지 최대 개수(API 상한 1000, 미지정 시 기본 100). */
const DRIVE_LIST_PAGE_SIZE = 1000;

/** Files.list API 응답 */
interface FilesListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType?: string;
    modifiedTime?: string;
  }>;
  nextPageToken?: string;
}

/** Files.create / Files.update API 응답 */
interface FileResponse {
  id: string;
  name: string;
  modifiedTime?: string;
}

class DriveSyncPreconditionFailedError extends Error {}

export class DriveSyncAdapter implements IDriveSyncPort {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  /** 구버전 앱이 같은 폴더 ID를 잡고 있어도 v2 파일을 수정할 수 없게 물리 이름을 분리한다. */
  private toPhysicalSyncFilename(filename: string): string {
    return `${SYNC_FILE_PREFIX}${filename}`;
  }

  private async checksumText(content: string): Promise<string> {
    const bytes = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private parseManifest(content: string): DriveSyncManifest | null {
    try {
      const parsed = JSON.parse(content) as Partial<DriveSyncManifest>;
      if (
        typeof parsed.version !== 'number' ||
        typeof parsed.lastSyncedAt !== 'string' ||
        typeof parsed.deviceId !== 'string' ||
        typeof parsed.deviceName !== 'string' ||
        !parsed.files ||
        typeof parsed.files !== 'object'
      ) {
        return null;
      }
      if (parsed.version > 2) {
        throw new Error('더 최신 버전의 쌤핀이 만든 동기화 데이터입니다. 앱을 업데이트해 주세요.');
      }
      return parsed as DriveSyncManifest;
    } catch (error) {
      if (error instanceof Error && error.message.includes('더 최신 버전')) throw error;
      return null;
    }
  }

  private legacyDriveFilename(
    logicalKey: string,
    info: DriveSyncManifest['files'][string],
  ): string {
    return info.driveFilename ?? `${logicalKey.replace(/\//g, '__')}.json`;
  }

  /**
   * v1 장부와 파일을 읽기 전용 원본으로 두고 v2 이름으로 복사한다.
   * 구버전이 같은 폴더 ID를 계속 사용해도 v2-- 파일과 장부 이름을 알지 못해 덮어쓸 수 없다.
   */
  private async migrateLegacyManifest(folderId: string): Promise<DriveSyncManifest | null> {
    const legacyMatches = await this.findFilesByName(folderId, LEGACY_MANIFEST_FILENAME);
    if (legacyMatches.length === 0) return null;
    if (legacyMatches.length !== 1) {
      throw new Error(
        'Google Drive의 이전 쌤핀 동기화 장부가 중복되어 안전하게 이전할 수 없습니다.',
      );
    }
    const legacyFile = legacyMatches[0]!;
    const originalContent = await this.downloadText(legacyFile.id);
    const legacyManifest = this.parseManifest(originalContent);
    if (!legacyManifest) {
      throw new Error('Google Drive의 이전 쌤핀 동기화 장부를 읽을 수 없습니다.');
    }

    const migratedFiles: Record<string, DriveSyncManifest['files'][string]> = {};
    for (const [logicalKey, info] of Object.entries(legacyManifest.files)) {
      const legacyFilename = this.legacyDriveFilename(logicalKey, info);
      const sourceMatches = await this.findFilesByName(folderId, legacyFilename);
      if (sourceMatches.length !== 1) {
        throw new Error(`Google Drive의 이전 ${logicalKey} 파일을 하나로 확인할 수 없습니다.`);
      }
      const sourceContent = await this.downloadText(sourceMatches[0]!.id);
      const sourceBytes = new TextEncoder().encode(sourceContent);
      if (
        (await this.checksumText(sourceContent)) !== info.checksum ||
        sourceBytes.length !== info.size
      ) {
        throw new Error(
          `Google Drive의 이전 ${logicalKey} 파일이 동기화 장부와 일치하지 않습니다.`,
        );
      }
      // ⚠️ 이전 대상 v2 파일은 **있으면 그대로 채택하고 절대 덮어쓰지 않는다.**
      //    두 기기가 동시에 이전하면 서로의 결과를 PATCH 로 지워 장부와 실제 내용이 어긋난다.
      //    이미 다른 기기가 만들어 둔 파일이면 그 본문을 기준으로 장부를 적는다.
      const adopted = await this.adoptOrCreateMigratedFile(
        folderId,
        this.toPhysicalSyncFilename(legacyFilename),
        sourceContent,
        logicalKey,
      );
      migratedFiles[logicalKey] = {
        ...info,
        lastModified: adopted.modifiedTime,
        checksum: adopted.checksum,
        size: adopted.size,
      };
    }

    const latestLegacyContent = await this.downloadText(legacyFile.id);
    if (latestLegacyContent !== originalContent) {
      throw new Error('이전 버전 기기가 동기화 중입니다. 잠시 후 다시 동기화해 주세요.');
    }
    const migrated: DriveSyncManifest = {
      ...legacyManifest,
      version: 2,
      files: migratedFiles,
    };
    const created = await this.uploadText(
      { name: MANIFEST_FILENAME, parents: [folderId] },
      JSON.stringify(migrated, null, 2),
    );
    const manifests = await this.findFilesByName(folderId, MANIFEST_FILENAME);
    const canonicalManifest = this.canonicalFile(manifests);
    if (!canonicalManifest) {
      throw new Error('Google Drive의 v2 동기화 장부를 만들지 못했습니다. 다시 동기화해 주세요.');
    }
    if (canonicalManifest.id !== created.id) {
      // 동시에 만들어졌다면 **양쪽이 같은 승자**(id 순 첫 번째)를 고르고 자기 것만 정리한다.
      // 각자 상대 것을 지우면 장부가 통째로 사라진다.
      await this.request(`/files/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
      return this.parseManifest(await this.downloadText(canonicalManifest.id));
    }
    return migrated;
  }

  /** 동시에 만들어진 같은 이름의 파일 중 모든 기기가 똑같이 고르는 승자 */
  private canonicalFile<T extends { id: string }>(files: readonly T[]): T | undefined {
    return [...files].sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  /**
   * 이전 대상 v2 파일을 채택하거나 없을 때만 만든다.
   * 이미 있으면 그 본문을 그대로 인정하고, 장부에는 **실제 파일의 체크섬**을 적는다
   * (장부와 실제 내용이 어긋나지 않게 하는 것이 이전보다 우선한다).
   */
  private async adoptOrCreateMigratedFile(
    folderId: string,
    physicalFilename: string,
    sourceContent: string,
    logicalKey: string,
  ): Promise<{ modifiedTime: string; checksum: string; size: number }> {
    const describe = async (file: { id: string; modifiedTime: string }) => {
      const content = await this.downloadText(file.id);
      return {
        modifiedTime: file.modifiedTime,
        checksum: await this.checksumText(content),
        size: new TextEncoder().encode(content).length,
      };
    };

    const existing = this.canonicalFile(await this.findFilesByName(folderId, physicalFilename));
    if (existing) return describe(existing);

    const created = await this.uploadText(
      { name: physicalFilename, parents: [folderId] },
      sourceContent,
    );
    const confirmed = this.canonicalFile(await this.findFilesByName(folderId, physicalFilename));
    if (!confirmed) {
      throw new Error(
        `Google Drive의 v2 ${logicalKey} 파일을 만들지 못했습니다. 다시 동기화해 주세요.`,
      );
    }
    if (confirmed.id !== created.id) {
      await this.request(`/files/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
      return describe(confirmed);
    }
    return {
      modifiedTime: created.modifiedTime ?? confirmed.modifiedTime,
      checksum: await this.checksumText(sourceContent),
      size: new TextEncoder().encode(sourceContent).length,
    };
  }

  /**
   * 일시 오류(429/5xx) 자동 재시도 fetch.
   * Retry-After 헤더를 존중하고, 없으면 지수 백오프. 그 외 상태는 즉시 반환해
   * 기존 401/403 처리 흐름을 그대로 태운다.
   *
   * 제한시간(timeoutMs)은 시도마다 새로 잡힌다. 초과분은 GoogleFetchTimeoutError로
   * 곧장 던져 이 루프를 빠져나간다 — 응답 자체가 없었던 요청이라 같은 자리에서
   * 다시 늘어질 뿐이고, 여기서 붙잡고 있으면 동기화가 영영 끝나지 않는다.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number = GOOGLE_META_TIMEOUT_MS,
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok || !isRetryableDriveStatus(res.status) || attempt >= MAX_DRIVE_RETRIES) {
        return res;
      }
      const delay = computeDriveRetryDelayMs(attempt, res.headers.get('Retry-After'));
      console.warn(
        `[DriveSyncAdapter] ${res.status} 일시 오류 → ${delay}ms 후 재시도 (${attempt + 1}/${MAX_DRIVE_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }

  /** JSON 응답용 API 요청 헬퍼 */
  private async request<T>(path: string, options?: RequestInit, isRetry = false): Promise<T> {
    const accessToken = await this.getAccessToken();
    const res = await this.fetchWithRetry(`${DRIVE_API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    if (!res.ok) {
      // 401 Unauthorized: 토큰 갱신 후 1회 재시도
      if (res.status === 401 && !isRetry) {
        return this.request<T>(path, options, true);
      }
      const err = await res.text();
      if (
        res.status === 403 &&
        (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))
      ) {
        throw new Error(
          'SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.',
        );
      }
      // 재시도 후에도 401: 학교 Workspace 정책 차단 가능성 안내
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync API error: ${res.status} ${err}`);
    }
    if (res.status === 204) return undefined as T;
    return readBodyWithTimeout(
      () => res.json() as Promise<T>,
      `${DRIVE_API_URL}${path}`,
      GOOGLE_META_TIMEOUT_MS,
    );
  }

  /** 텍스트 콘텐츠 다운로드 (alt=media) */
  private async downloadText(fileId: string, isRetry = false): Promise<string> {
    const accessToken = await this.getAccessToken();
    const res = await this.fetchWithRetry(
      `${DRIVE_API_URL}/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      GOOGLE_TRANSFER_TIMEOUT_MS,
    );
    if (!res.ok) {
      if (res.status === 401 && !isRetry) {
        return this.downloadText(fileId, true);
      }
      const err = await res.text();
      if (
        res.status === 403 &&
        (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))
      ) {
        throw new Error(
          'SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.',
        );
      }
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync 다운로드 오류: ${res.status} ${err}`);
    }
    return readBodyWithTimeout(
      () => res.text(),
      `${DRIVE_API_URL}/files/${fileId}`,
      GOOGLE_TRANSFER_TIMEOUT_MS,
    );
  }

  /** 멀티파트 업로드 (생성 or 업데이트) */
  private async uploadText(
    metadata: Record<string, unknown>,
    content: string,
    method: 'POST' | 'PATCH' = 'POST',
    fileId?: string,
    ifMatch?: string,
    isRetry = false,
  ): Promise<FileResponse> {
    const accessToken = await this.getAccessToken();
    const boundary = '-------ssampin_sync_boundary';
    const metadataStr = JSON.stringify(metadata);
    const blob = new Blob([content], { type: 'application/json' });

    const parts: Array<Blob | string> = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ];

    const body = new Blob(parts);
    const url =
      method === 'POST'
        ? `${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,modifiedTime`
        : `${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`;

    const res = await this.fetchWithRetry(
      url,
      {
        method,
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          ...(ifMatch ? { 'If-Match': ifMatch } : {}),
        },
        body,
      },
      transferTimeoutForBytes(body.size),
    );

    if (!res.ok) {
      if (res.status === 412) throw new DriveSyncPreconditionFailedError();
      if (res.status === 401 && !isRetry) {
        return this.uploadText(metadata, content, method, fileId, ifMatch, true);
      }
      const err = await res.text();
      if (
        res.status === 403 &&
        (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))
      ) {
        throw new Error(
          'SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.',
        );
      }
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync 업로드 오류: ${res.status} ${err}`);
    }
    return readBodyWithTimeout(
      () => res.json() as Promise<FileResponse>,
      url,
      GOOGLE_META_TIMEOUT_MS,
    );
  }

  /** 폴더 내에서 같은 이름의 모든 파일 검색 (경쟁 생성/중복 감지용). */
  private async findFilesByName(
    folderId: string,
    filename: string,
  ): Promise<Array<{ id: string; modifiedTime: string }>> {
    const query = `'${folderId}' in parents and name='${filename}' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime)',
      spaces: 'drive',
    });
    const data = await this.request<FilesListResponse>(`/files?${params.toString()}`);
    return (data.files ?? []).map((file) => ({
      id: file.id,
      modifiedTime: file.modifiedTime ?? '',
    }));
  }

  /** 폴더 내에서 파일명으로 검색 */
  private async findFileByName(
    folderId: string,
    filename: string,
  ): Promise<{ id: string; modifiedTime: string } | null> {
    const files = await this.findFilesByName(folderId, filename);
    return files[0] ?? null;
  }

  /**
   * 조건부 PATCH에 쓸 파일의 현재 상태(수정 시각 + 있으면 ETag).
   *
   * ⚠️ **ETag 부재를 실패로 취급하지 말 것**(ADR-041). Google API 응답의
   * `Access-Control-Expose-Headers`에는 `etag`가 없어서(실측 2026-08-11 — 200/401 모두
   * `content-encoding,date,server,content-length,vary`뿐) 브라우저·Electron 렌더러에서는
   * `headers.get('ETag')`가 **항상 null**이다. 예전 코드는 여기서 null을 반환했고, 그 결과
   * `uploadSyncFileIfUnchanged`/`updateSyncManifestIfUnchanged`가 **100% 실패**해
   * "클라우드 … 파일이 동기화 중 변경되었습니다"가 영구 반복됐다(v2.3.1~v2.3.5 신고).
   *
   * 그래서 판정 기준은 **응답 본문으로 읽을 수 있는 modifiedTime**이고, ETag는 읽히는
   * 환경(메인 프로세스 등)에서만 If-Match로 덤으로 얹는다. 남는 취약점: 마지막 확인과
   * PATCH 사이의 짧은 경합 창은 If-Match 없이는 닫을 수 없다(v2.3.1 이전엔 확인 자체가
   * 없었으므로 그때보다는 엄격하다).
   */
  private async getFilePrecondition(
    fileId: string,
    isRetry = false,
  ): Promise<{ etag: string | null; modifiedTime: string } | null> {
    const accessToken = await this.getAccessToken();
    const res = await this.fetchWithRetry(
      `${DRIVE_API_URL}/files/${fileId}?fields=id,modifiedTime`,
      { headers: { Authorization: 'Bearer ' + accessToken } },
    );
    if (res.status === 401 && !isRetry) return this.getFilePrecondition(fileId, true);
    if (!res.ok) return null;
    const data = (await readBodyWithTimeout(
      () => res.json(),
      `${DRIVE_API_URL}/files/${fileId}`,
      GOOGLE_META_TIMEOUT_MS,
    )) as FileResponse;
    return { etag: res.headers.get('ETag'), modifiedTime: data.modifiedTime ?? '' };
  }

  // ── IDriveSyncPort 구현 ──

  async getOrCreateSyncFolder(): Promise<DriveFolderInfo> {
    const query = `name='${SYNC_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name)',
      spaces: 'drive',
    });
    const data = await this.request<FilesListResponse>(`/files?${params.toString()}`);
    if ((data.files?.length ?? 0) > 1) {
      throw new Error('Google Drive에 쌤핀 동기화 폴더가 중복되어 안전하게 열 수 없습니다.');
    }
    const existing = data.files?.[0];
    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    // 없으면 생성
    const folder = await this.request<FileResponse>('/files', {
      method: 'POST',
      body: JSON.stringify({
        name: SYNC_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });
    const confirmed = await this.request<FilesListResponse>(`/files?${params.toString()}`);
    const confirmedFiles = confirmed.files ?? [];
    if (confirmedFiles.length !== 1) {
      const canonical = [...confirmedFiles].sort((a, b) => a.id.localeCompare(b.id))[0];
      if (canonical?.id !== folder.id) {
        await this.request(`/files/${folder.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ trashed: true }),
        });
      }
      throw new Error('Google Drive 동기화 폴더가 동시에 생성되었습니다. 다시 동기화해 주세요.');
    }
    const authoritative = confirmedFiles[0]!;
    if (authoritative.id !== folder.id) {
      await this.request(`/files/${folder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
    }
    return { id: authoritative.id, name: authoritative.name };
  }

  async uploadSyncFile(
    folderId: string,
    filename: string,
    content: string,
  ): Promise<{ fileId: string; modifiedTime: string }> {
    const physicalFilename = this.toPhysicalSyncFilename(filename);
    // 기존 파일 있으면 업데이트, 없으면 생성
    const existing = await this.findFileByName(folderId, physicalFilename);
    if (existing) {
      const result = await this.uploadText({}, content, 'PATCH', existing.id);
      return {
        fileId: result.id,
        modifiedTime: result.modifiedTime ?? new Date().toISOString(),
      };
    }
    const result = await this.uploadText({ name: physicalFilename, parents: [folderId] }, content);
    return {
      fileId: result.id,
      modifiedTime: result.modifiedTime ?? new Date().toISOString(),
    };
  }

  async createSyncFileIfMissing(
    folderId: string,
    filename: string,
    content: string,
  ): Promise<{ fileId: string; modifiedTime: string } | null> {
    const physicalFilename = this.toPhysicalSyncFilename(filename);
    if ((await this.findFilesByName(folderId, physicalFilename)).length > 0) return null;

    const created = await this.uploadText({ name: physicalFilename, parents: [folderId] }, content);
    const matches = await this.findFilesByName(folderId, physicalFilename);
    if (matches.length !== 1 || matches[0]?.id !== created.id) {
      await this.request(`/files/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
      return null;
    }
    return {
      fileId: created.id,
      modifiedTime: created.modifiedTime ?? matches[0].modifiedTime,
    };
  }

  async uploadSyncFileIfUnchanged(
    folderId: string,
    filename: string,
    content: string,
    expectedModifiedTime: string,
  ): Promise<{ fileId: string; modifiedTime: string } | null> {
    const matches = await this.findFilesByName(folderId, this.toPhysicalSyncFilename(filename));
    if (matches.length !== 1) return null;
    const existing = matches[0]!;
    if (existing.modifiedTime !== expectedModifiedTime) return null;

    const precondition = await this.getFilePrecondition(existing.id);
    if (!precondition || precondition.modifiedTime !== expectedModifiedTime) return null;

    try {
      // If-Match는 ETag를 실제로 읽을 수 있을 때만 얹는다(위 주석 참조).
      const result = await this.uploadText(
        {},
        content,
        'PATCH',
        existing.id,
        precondition.etag ?? undefined,
      );
      return {
        fileId: result.id,
        modifiedTime: result.modifiedTime ?? new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DriveSyncPreconditionFailedError) return null;
      throw error;
    }
  }

  async downloadSyncFile(fileId: string): Promise<string> {
    return this.downloadText(fileId);
  }

  async getSyncManifest(folderId: string): Promise<DriveSyncManifest | null> {
    const matches = await this.findFilesByName(folderId, MANIFEST_FILENAME);
    if (matches.length === 0) return this.migrateLegacyManifest(folderId);
    if (matches.length !== 1) {
      throw new Error('Google Drive의 v2 쌤핀 동기화 장부가 중복되어 안전하게 열 수 없습니다.');
    }
    const file = matches[0]!;
    const content = await this.downloadText(file.id);
    return this.parseManifest(content);
  }

  async updateSyncManifest(
    folderId: string,
    manifest: DriveSyncManifest,
    existingFileId?: string,
  ): Promise<string> {
    const content = JSON.stringify(manifest, null, 2);

    if (existingFileId) {
      const result = await this.uploadText({}, content, 'PATCH', existingFileId);
      return result.id;
    }

    // 기존 manifest 파일 검색
    const existing = await this.findFileByName(folderId, MANIFEST_FILENAME);
    if (existing) {
      const result = await this.uploadText({}, content, 'PATCH', existing.id);
      return result.id;
    }

    // 새로 생성
    const result = await this.uploadText({ name: MANIFEST_FILENAME, parents: [folderId] }, content);
    return result.id;
  }

  async updateSyncManifestIfUnchanged(
    folderId: string,
    expected: DriveSyncManifest,
    next: DriveSyncManifest,
  ): Promise<boolean> {
    const matches = await this.findFilesByName(folderId, MANIFEST_FILENAME);
    if (matches.length !== 1) return false;
    const existing = matches[0]!;
    const precondition = await this.getFilePrecondition(existing.id);
    if (!precondition) return false;

    // ETag 획득 뒤 현재 본문을 읽는다. 그 사이 변경되면 expected 비교 또는 If-Match가 차단한다.
    const currentContent = await this.downloadText(existing.id);
    let current: DriveSyncManifest;
    try {
      current = JSON.parse(currentContent) as DriveSyncManifest;
    } catch {
      return false;
    }
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;

    try {
      await this.uploadText(
        {},
        JSON.stringify(next, null, 2),
        'PATCH',
        existing.id,
        precondition.etag ?? undefined,
      );
      return true;
    } catch (error) {
      if (error instanceof DriveSyncPreconditionFailedError) return false;
      throw error;
    }
  }

  /**
   * 동기화 폴더 안의 v2 파일 전체 목록.
   *
   * ⚠️ **끝까지 페이지를 넘겨야 한다.** Drive files.list 는 pageSize 를 주지 않으면
   * **100개까지만** 돌려준다. 예전 구현은 pageSize·pageToken 이 없어서 폴더 파일이 100개를
   * 넘는 순간 목록이 **조용히 잘렸고**, 잘린 뒤로는 실제로 존재하는 파일을 "없다"고 판정했다.
   *   - 업로드: driveFile 을 못 찾아 createSyncFileIfMissing 을 타고 → 이미 있으니 null →
   *     "클라우드 … 파일이 동기화 중 생성되었습니다"가 **매번 반복되는 영구 교착**
   *   - 다운로드: 이름순 뒤쪽 파일을 아예 내려받지 못함(조용한 자료 누락)
   * v2.4.7 신고가 정확히 이것이었다 — 학생 사진(`student-photos__*`)이 100개 경계를
   * 밀어내서, 이름순으로 그 바로 뒤에 오는 `teacher-schedule` 부터 터졌다.
   */
  async listSyncFiles(folderId: string): Promise<DriveSyncFileListItem[]> {
    const query = `'${folderId}' in parents and trashed=false`;
    const collected: DriveSyncFileListItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,modifiedTime)',
        orderBy: 'name',
        pageSize: String(DRIVE_LIST_PAGE_SIZE),
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.request<FilesListResponse>(`/files?${params.toString()}`);
      for (const file of data.files ?? []) {
        if (!file.name.startsWith(SYNC_FILE_PREFIX) || file.name === MANIFEST_FILENAME) continue;
        collected.push({
          id: file.id,
          name: file.name.slice(SYNC_FILE_PREFIX.length),
          modifiedTime: file.modifiedTime ?? '',
        });
      }
      // 같은 토큰이 다시 오면 무한 루프다 — 방어적으로 끊는다.
      const next = data.nextPageToken;
      pageToken = next && next !== pageToken ? next : undefined;
    } while (pageToken);
    return collected;
  }

  async deleteSyncFolder(folderId: string): Promise<void> {
    // 폴더 내 모든 파일을 먼저 휴지통으로 이동
    const data = await this.request<FilesListResponse>(
      `/files?q='${folderId}' in parents and trashed=false&fields=files(id)`,
    );
    for (const file of data.files ?? []) {
      await this.request(`/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
    }
    // 폴더 자체 삭제
    await this.request(`/files/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    });
  }

  /**
   * 동기화 폴더 안의 파일 하나를 **즉시 소멸**시킨다 (휴지통 아님).
   *
   * 학생 얼굴 사진 파기용이다. 휴지통으로 보내면 30일간 남아 있어
   * "지웠습니다"라는 안내가 사실이 아니게 된다.
   * 파일이 이미 없으면 조용히 넘어간다(멱등) — 파기는 여러 번 시도돼도 안전해야 한다.
   */
  async deleteSyncFile(folderId: string, filename: string): Promise<void> {
    const escaped = this.toPhysicalSyncFilename(filename).replace(/'/g, "\\'");
    const data = await this.request<FilesListResponse>(
      `/files?q='${folderId}' in parents and name='${encodeURIComponent(escaped)}' and trashed=false&fields=files(id)`,
    );
    for (const file of data.files ?? []) {
      try {
        await this.request(`/files/${file.id}`, { method: 'DELETE' });
      } catch (err) {
        // 404(이미 지워짐)는 성공으로 본다 — 나머지 파일 파기를 막지 않는다
        console.warn(`[DriveSyncAdapter] ${filename} 삭제 실패:`, err);
        throw err;
      }
    }
  }

  async deleteSyncFileIfUnchanged(
    folderId: string,
    filename: string,
    expectedModifiedTime: string,
  ): Promise<boolean> {
    const matches = await this.findFilesByName(folderId, this.toPhysicalSyncFilename(filename));
    if (matches.length === 0) return true;
    if (matches.length !== 1 || matches[0]?.modifiedTime !== expectedModifiedTime) return false;

    const existing = matches[0];
    const precondition = await this.getFilePrecondition(existing.id);
    if (!precondition || precondition.modifiedTime !== expectedModifiedTime) return false;
    // 브라우저/Electron renderer에서는 Google이 ETag를 노출하지 않는다. 덮어쓸 수 있는
    // 일반 파일은 이 상태에서 DELETE하면 GET→DELETE 사이 최신 revision을 지울 수 있다.
    // 학생 사진 v2 파일은 프로토콜상 immutable 세대명이므로 같은 이름을 갱신하지 않는다.
    if (!precondition.etag && !filename.startsWith('student-photos__')) return false;
    try {
      await this.request(`/files/${existing.id}`, {
        method: 'DELETE',
        headers: precondition.etag ? { 'If-Match': precondition.etag } : undefined,
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Drive Sync API error: 412')) {
        return false;
      }
      throw error;
    }
  }
}
