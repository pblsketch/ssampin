/**
 * Google Drive 동기화 어댑터
 * IDriveSyncPort 구현체 — "쌤핀 동기화" 폴더에 데이터를 업로드/다운로드
 *
 * 과제수합 전용인 GoogleDriveClient와는 별개 클래스.
 * 내부적으로 동일한 Drive REST API v3를 사용하되, 동기화 전용 로직으로 구성.
 */

import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';
import type { DriveFolderInfo } from '@domain/ports/IGoogleDrivePort';
import type { IDriveSyncPort, DriveSyncFileListItem } from '@domain/ports/IDriveSyncPort';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SYNC_FOLDER_NAME = '쌤핀 동기화';
const MANIFEST_FILENAME = 'manifest.json';

/** Files.list API 응답 */
interface FilesListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType?: string;
    modifiedTime?: string;
  }>;
}

/** Files.create / Files.update API 응답 */
interface FileResponse {
  id: string;
  name: string;
  modifiedTime?: string;
}

export class DriveSyncAdapter implements IDriveSyncPort {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  /** JSON 응답용 API 요청 헬퍼 */
  private async request<T>(path: string, options?: RequestInit, isRetry = false): Promise<T> {
    const accessToken = await this.getAccessToken();
    const res = await fetch(`${DRIVE_API_URL}${path}`, {
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
      if (res.status === 403 && (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))) {
        throw new Error('SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.');
      }
      // 재시도 후에도 401: 학교 Workspace 정책 차단 가능성 안내
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync API error: ${res.status} ${err}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** 텍스트 콘텐츠 다운로드 (alt=media) */
  private async downloadText(fileId: string, isRetry = false): Promise<string> {
    const accessToken = await this.getAccessToken();
    const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401 && !isRetry) {
        return this.downloadText(fileId, true);
      }
      const err = await res.text();
      if (res.status === 403 && (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))) {
        throw new Error('SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.');
      }
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync 다운로드 오류: ${res.status} ${err}`);
    }
    return res.text();
  }

  /** 멀티파트 업로드 (생성 or 업데이트) */
  private async uploadText(
    metadata: Record<string, unknown>,
    content: string,
    method: 'POST' | 'PATCH' = 'POST',
    fileId?: string,
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

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      if (res.status === 401 && !isRetry) {
        return this.uploadText(metadata, content, method, fileId, true);
      }
      const err = await res.text();
      if (res.status === 403 && (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || err.includes('insufficientPermissions'))) {
        throw new Error('SCOPE_INSUFFICIENT: Google Drive 접근 권한이 부족합니다. 다시 로그인해주세요.');
      }
      if (res.status === 401) {
        throw new Error(GOOGLE_AUTH_BLOCKED_MESSAGE);
      }
      throw new Error(`Drive Sync 업로드 오류: ${res.status} ${err}`);
    }
    return res.json() as Promise<FileResponse>;
  }

  /** 폴더 내에서 파일명으로 검색 */
  private async findFileByName(
    folderId: string,
    filename: string,
  ): Promise<{ id: string; modifiedTime: string } | null> {
    const query = `'${folderId}' in parents and name='${filename}' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime)',
      spaces: 'drive',
    });
    const data = await this.request<FilesListResponse>(`/files?${params.toString()}`);
    const file = data.files?.[0];
    return file ? { id: file.id, modifiedTime: file.modifiedTime ?? '' } : null;
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
    return { id: folder.id, name: folder.name };
  }

  async uploadSyncFile(
    folderId: string,
    filename: string,
    content: string,
  ): Promise<{ fileId: string; modifiedTime: string }> {
    // 기존 파일 있으면 업데이트, 없으면 생성
    const existing = await this.findFileByName(folderId, filename);
    if (existing) {
      const result = await this.uploadText({}, content, 'PATCH', existing.id);
      return {
        fileId: result.id,
        modifiedTime: result.modifiedTime ?? new Date().toISOString(),
      };
    }
    const result = await this.uploadText(
      { name: filename, parents: [folderId] },
      content,
    );
    return {
      fileId: result.id,
      modifiedTime: result.modifiedTime ?? new Date().toISOString(),
    };
  }

  async downloadSyncFile(fileId: string): Promise<string> {
    return this.downloadText(fileId);
  }

  async getSyncManifest(folderId: string): Promise<DriveSyncManifest | null> {
    const file = await this.findFileByName(folderId, MANIFEST_FILENAME);
    if (!file) return null;
    const content = await this.downloadText(file.id);
    try {
      return JSON.parse(content) as DriveSyncManifest;
    } catch {
      return null;
    }
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
    const result = await this.uploadText(
      { name: MANIFEST_FILENAME, parents: [folderId] },
      content,
    );
    return result.id;
  }

  async listSyncFiles(folderId: string): Promise<DriveSyncFileListItem[]> {
    const query = `'${folderId}' in parents and trashed=false and name!='${MANIFEST_FILENAME}'`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'name',
    });
    const data = await this.request<FilesListResponse>(`/files?${params.toString()}`);
    return (data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime ?? '',
    }));
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
}
