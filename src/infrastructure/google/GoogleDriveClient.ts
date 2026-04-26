/**
 * Google Drive REST API v3 클라이언트
 *
 * 과제수합 도구에서 교사 드라이브에 파일을 저장/관리.
 * drive.file scope: 앱이 생성한 파일/폴더만 접근 가능.
 */
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = '쌤핀 과제';

/** Drive 폴더 정보 */
export interface DriveFolder {
  id: string;
  name: string;
}

/** Drive 파일 정보 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  webViewLink?: string;
}

/** Drive API 에러 */
interface DriveApiError extends Error {
  code: number;
}

/** Files.list API 응답 */
interface FilesListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
    webViewLink?: string;
  }>;
}

/** Files.create / Files.update API 응답 */
interface FileResponse {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

export class GoogleDriveClient {
  private readonly getAccessToken: () => Promise<string>;

  constructor(getAccessToken: () => Promise<string>) {
    this.getAccessToken = getAccessToken;
  }

  /**
   * API 요청 헬퍼 (JSON 응답용)
   */
  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
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
      const err = await res.text();
      // Drive API 미활성화 감지
      if (res.status === 403 && (err.includes('accessNotConfigured') || err.includes('Drive API has not been used') || err.includes('it is disabled'))) {
        throw new Error('Google Drive API가 활성화되지 않았습니다. Google Cloud Console에서 Drive API를 사용 설정해주세요.');
      }
      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Drive API error: ${res.status} ${err}`;
      const error = new Error(message) as DriveApiError;
      error.code = res.status;
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /**
   * 멀티파트 업로드 헬퍼
   * metadata(JSON) + file(Blob)을 multipart/related로 전송
   */
  private async uploadRequest(
    path: string,
    metadata: Record<string, unknown>,
    fileBlob: Blob,
    mimeType: string,
    method: 'POST' | 'PATCH' = 'POST',
  ): Promise<FileResponse> {
    const accessToken = await this.getAccessToken();

    const boundary = '-------ssampin_boundary';
    const metadataStr = JSON.stringify(metadata);

    // multipart/related body 구성
    const parts: Array<Blob | string> = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      fileBlob,
      `\r\n--${boundary}--`,
    ];

    const body = new Blob(parts);

    const url = method === 'POST'
      ? `${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink`
      : `${DRIVE_UPLOAD_URL}/files/${path}?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      // Drive API 미활성화 감지
      if (res.status === 403 && (err.includes('accessNotConfigured') || err.includes('Drive API has not been used') || err.includes('it is disabled'))) {
        throw new Error('Google Drive API가 활성화되지 않았습니다. Google Cloud Console에서 Drive API를 사용 설정해주세요.');
      }
      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Drive upload error: ${res.status} ${err}`;
      const error = new Error(message) as DriveApiError;
      error.code = res.status;
      throw error;
    }

    return res.json() as Promise<FileResponse>;
  }

  /**
   * FileResponse를 DriveFile로 변환
   */
  private toFile(data: FileResponse): DriveFile {
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: parseInt(data.size ?? '0', 10),
      createdTime: data.createdTime ?? '',
      webViewLink: data.webViewLink,
    };
  }

  /**
   * "쌤핀 과제" 루트 폴더 조회 또는 생성
   * 1) name="쌤핀 과제", mimeType=folder로 검색
   * 2) 없으면 생성
   * 3) 있으면 기존 폴더 ID 반환
   */
  async getOrCreateRootFolder(): Promise<DriveFolder> {
    // 기존 루트 폴더 검색
    const query = `name='${ROOT_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name)',
      spaces: 'drive',
    });

    const data = await this.request<FilesListResponse>(
      `/files?${params.toString()}`,
    );

    const existing = data.files?.[0];
    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    // 없으면 새로 생성
    const folder = await this.request<FileResponse>('/files', {
      method: 'POST',
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });

    return { id: folder.id, name: folder.name };
  }

  /**
   * 서브폴더 생성 (과제별)
   * @param name 폴더명 (예: "독서감상문_20260309")
   * @param parentId 상위 폴더 ID ("쌤핀 과제" 루트 폴더)
   */
  async createSubFolder(name: string, parentId: string): Promise<DriveFolder> {
    const folder = await this.request<FileResponse>('/files', {
      method: 'POST',
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      }),
    });

    return { id: folder.id, name: folder.name };
  }

  /**
   * 파일 업로드 (단순 멀티파트, 10MB 이하)
   * @param folderId 대상 폴더 ID
   * @param fileName 저장할 파일명 (예: "01_김민수_감상문.pdf")
   * @param fileBlob 파일 데이터
   * @param mimeType MIME 타입
   */
  async uploadFile(
    folderId: string,
    fileName: string,
    fileBlob: Blob,
    mimeType: string,
  ): Promise<DriveFile> {
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const data = await this.uploadRequest('', metadata, fileBlob, mimeType);
    return this.toFile(data);
  }

  /**
   * 파일 덮어쓰기 (재제출)
   * Google Drive 자체 버전 관리 활용
   * @param fileId 기존 파일 ID
   * @param fileBlob 새 파일 데이터
   * @param mimeType MIME 타입
   */
  async updateFile(
    fileId: string,
    fileBlob: Blob,
    mimeType: string,
  ): Promise<DriveFile> {
    const data = await this.uploadRequest(fileId, {}, fileBlob, mimeType, 'PATCH');
    return this.toFile(data);
  }

  /**
   * 폴더 내 파일 목록 조회
   * @param folderId 폴더 ID
   */
  async listFiles(folderId: string): Promise<DriveFile[]> {
    const query = `'${folderId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,size,createdTime,webViewLink)',
      orderBy: 'name',
    });

    const data = await this.request<FilesListResponse>(
      `/files?${params.toString()}`,
    );

    return (data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: parseInt(f.size ?? '0', 10),
      createdTime: f.createdTime ?? '',
      webViewLink: f.webViewLink,
    }));
  }

  /**
   * 파일 삭제 (휴지통으로 이동)
   * @param fileId 파일 ID
   */
  async trashFile(fileId: string): Promise<void> {
    await this.request(`/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    });
  }
}
