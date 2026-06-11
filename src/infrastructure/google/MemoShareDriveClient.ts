/**
 * 메모 교실 공유 — Google Drive 쓰기 클라이언트 (plan.md v2 B-4)
 *
 * `IMemoShareClient` 포트 구현. 기존 `GoogleDriveClient`를 합성해
 * 폴더 보장(`쌤핀 과제/교실 공유 메모`, 폴더 id 인스턴스 캐시) →
 * 이미지 순차 업로드 + 공개 권한 → fileId 치환 보드 JSON 업로드 + 공개 권한을 수행한다.
 *
 * 오류 매핑 (plan C-3):
 * - 401: GoogleDriveClient가 기존 OAuth 안내 메시지로 throw (그대로 전파)
 * - 403 (permissions.create): 학교 워크스페이스 링크 공유 차단 → 한국어 안내 +
 *   지금까지 생성한 파일 전부 영구 삭제 롤백 (고아 파일 방지)
 * - 404 (update): 사용자가 Drive에서 직접 삭제 → "공유 끊김" 안내 (code 404 보존)
 * - 404 (delete): 멱등 — GoogleDriveClient.deleteFile이 조용히 무시
 */
import type {
  CreateBoardResult,
  IMemoShareClient,
  MemoShareImageUpload,
  UpdateBoardResult,
} from '@domain/ports/IMemoShareClient';
import type { MemoShareBoardFile } from '@domain/entities/MemoShareItem';
import { splitDataUrl } from '@domain/rules/memoShareRules';
import { GoogleDriveClient } from './GoogleDriveClient';
import { generateUUID } from '../utils/uuid';

/** 공유 보드 전용 서브폴더명 (루트 '쌤핀 과제' 하위) */
const SHARE_FOLDER_NAME = '교실 공유 메모';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BOARD_MIME_TYPE = 'application/json';

/** 워크스페이스 정책으로 링크 공유가 차단됐을 때 사용자 안내 (plan C-3 오류 매핑) */
export const WORKSPACE_SHARING_BLOCKED_MESSAGE =
  '학교 계정은 링크 공유가 막혀 있을 수 있어요. 개인 구글 계정으로 로그인해 주세요.';

/** 보드 파일이 Drive에서 사라졌을 때(직접 삭제 등) 안내 — store가 "공유 끊김" 전환에 사용 */
export const BOARD_FILE_MISSING_MESSAGE =
  '공유 중인 보드 파일을 Drive에서 찾을 수 없습니다. 공유가 끊겼을 수 있어요. 다시 공유해 주세요.';

/** code 프로퍼티를 가진 에러 (GoogleDriveClient의 DriveApiError와 동일 형태) */
interface CodedError extends Error {
  code: number;
}

function withCode(message: string, code: number): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/** 에러에서 HTTP 상태 코드 추출 (없으면 undefined) */
function errorCode(error: unknown): number | undefined {
  if (error instanceof Error && 'code' in error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

/**
 * dataUrl → Blob 순수 변환 (atob 기반 — 기존 ExportRegisterToExcel 컨벤션).
 * 형식이 깨졌으면 null (방어적 — fetch(dataUrl) 미사용).
 */
function dataUrlToBlob(dataUrl: string, mime: string): Blob | null {
  const parts = splitDataUrl(dataUrl);
  if (!parts) return null;
  try {
    const binary = atob(parts.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null; // base64 손상 — 크래시 금지
  }
}

/** 이미지 파일명: img-{itemId}.{ext}, ext ∈ {png, jpeg, webp} */
function imageFileName(upload: MemoShareImageUpload): string {
  const ext = upload.mime.slice('image/'.length);
  return `img-${upload.itemId}.${ext}`;
}

/** 보드 JSON의 item.image.fileId를 업로드된 Drive fileId로 치환 */
function withImageFileIds(
  board: MemoShareBoardFile,
  imageFileIds: Record<string, string>,
): MemoShareBoardFile {
  return {
    ...board,
    items: board.items.map((item) => {
      const fileId = imageFileIds[item.id];
      if (!item.image || fileId === undefined) return item;
      return { ...item, image: { ...item.image, fileId } };
    }),
  };
}

export class MemoShareDriveClient implements IMemoShareClient {
  private readonly drive: GoogleDriveClient;
  /** '교실 공유 메모' 폴더 id 인스턴스 캐시 — 2회째 호출부터 폴더 조회 생략 */
  private shareFolderId: string | null = null;

  constructor(getAccessToken: () => Promise<string>) {
    this.drive = new GoogleDriveClient(getAccessToken);
  }

  async createBoard(
    board: MemoShareBoardFile,
    images: readonly MemoShareImageUpload[],
  ): Promise<CreateBoardResult> {
    const folderId = await this.ensureShareFolder();
    const createdFileIds: string[] = [];
    const imageFileIds: Record<string, string> = {};

    try {
      // 이미지 순차 업로드 + 각각 공개 권한
      for (const image of images) {
        imageFileIds[image.itemId] = await this.uploadImageWithPermission(
          folderId,
          image,
          createdFileIds,
        );
      }

      // fileId 치환된 보드 JSON 업로드 + 공개 권한
      const resolved = withImageFileIds(board, imageFileIds);
      const jsonBlob = new Blob([JSON.stringify(resolved)], { type: BOARD_MIME_TYPE });
      const jsonFile = await this.drive.uploadFile(
        folderId,
        `board-${generateUUID()}.json`,
        jsonBlob,
        BOARD_MIME_TYPE,
      );
      createdFileIds.push(jsonFile.id);
      await this.applyPublicPermission(jsonFile.id);

      return {
        fileId: jsonFile.id,
        imageFileIds,
        createdAt: jsonFile.createdTime !== '' ? jsonFile.createdTime : new Date().toISOString(),
      };
    } catch (error) {
      // 실패 시 지금까지 생성한 파일 전부 영구 삭제 — 고아 파일 방지 (plan F)
      await this.rollback(createdFileIds);
      throw error;
    }
  }

  async updateBoard(
    fileId: string,
    board: MemoShareBoardFile,
    imagesToUpload: readonly MemoShareImageUpload[],
    imageFileIdsToDelete: readonly string[],
  ): Promise<UpdateBoardResult> {
    const folderId = await this.ensureShareFolder();
    const createdFileIds: string[] = [];
    const imageFileIds: Record<string, string> = {};

    try {
      // 1) 신규/교체 이미지 업로드 + 공개 권한
      for (const image of imagesToUpload) {
        imageFileIds[image.itemId] = await this.uploadImageWithPermission(
          folderId,
          image,
          createdFileIds,
        );
      }

      // 2) 제거 대상 이미지 영구 삭제 (404 멱등)
      for (const staleId of imageFileIdsToDelete) {
        await this.drive.deleteFile(staleId);
      }

      // 3) 보드 JSON 전체 교체 (기존 공개 권한 유지 — 재부여 불필요, plan W6)
      const resolved = withImageFileIds(board, imageFileIds);
      const jsonBlob = new Blob([JSON.stringify(resolved)], { type: BOARD_MIME_TYPE });
      try {
        await this.drive.updateFile(fileId, jsonBlob, BOARD_MIME_TYPE);
      } catch (error) {
        if (errorCode(error) === 404) {
          // 사용자가 Drive에서 직접 삭제 — store가 "공유 끊김" 전환 (크래시 금지)
          throw withCode(BOARD_FILE_MISSING_MESSAGE, 404);
        }
        throw error;
      }

      return { imageFileIds, updatedAt: board.updatedAt };
    } catch (error) {
      await this.rollback(createdFileIds);
      throw error;
    }
  }

  async deleteBoard(fileId: string, imageFileIds: readonly string[]): Promise<void> {
    // 이미지 전부 → 보드 JSON 순서로 영구 삭제. 404는 deleteFile이 멱등 처리.
    for (const imageId of imageFileIds) {
      await this.drive.deleteFile(imageId);
    }
    await this.drive.deleteFile(fileId);
  }

  /**
   * 루트 '쌤핀 과제' → '교실 공유 메모' 서브폴더 보장.
   * 기존 listFiles로 존재 확인 후 없으면 생성, 폴더 id는 인스턴스 캐시.
   */
  private async ensureShareFolder(): Promise<string> {
    if (this.shareFolderId !== null) return this.shareFolderId;

    const root = await this.drive.getOrCreateRootFolder();
    const children = await this.drive.listFiles(root.id);
    const existing = children.find(
      (file) => file.name === SHARE_FOLDER_NAME && file.mimeType === FOLDER_MIME_TYPE,
    );
    const folderId = existing
      ? existing.id
      : (await this.drive.createSubFolder(SHARE_FOLDER_NAME, root.id)).id;

    this.shareFolderId = folderId;
    return folderId;
  }

  /**
   * 이미지 1건 업로드 + 공개 권한. 업로드 직후 fileId를 createdFileIds에
   * 기록해 두어 이후 단계 실패 시 롤백 대상에 포함되게 한다.
   * @returns 업로드된 이미지 Drive fileId
   */
  private async uploadImageWithPermission(
    folderId: string,
    upload: MemoShareImageUpload,
    createdFileIds: string[],
  ): Promise<string> {
    const blob = dataUrlToBlob(upload.dataUrl, upload.mime);
    if (!blob) {
      throw new Error('이미지 데이터 형식이 올바르지 않아 업로드할 수 없습니다.');
    }
    const file = await this.drive.uploadFile(folderId, imageFileName(upload), blob, upload.mime);
    createdFileIds.push(file.id);
    await this.applyPublicPermission(file.id);
    return file.id;
  }

  /**
   * 공개 권한 부여. 403이면 학교 워크스페이스 링크 공유 정책 차단으로 매핑
   * (Drive API 비활성 403은 GoogleDriveClient가 code 없는 Error로 먼저 분기하므로 그대로 전파).
   */
  private async applyPublicPermission(fileId: string): Promise<void> {
    try {
      await this.drive.createPublicPermission(fileId);
    } catch (error) {
      if (errorCode(error) === 403) {
        throw withCode(WORKSPACE_SHARING_BLOCKED_MESSAGE, 403);
      }
      throw error;
    }
  }

  /** 생성된 파일 전부 영구 삭제. 롤백 실패는 무시 — 원 에러를 우선 전파한다. */
  private async rollback(fileIds: readonly string[]): Promise<void> {
    for (const id of fileIds) {
      try {
        await this.drive.deleteFile(id);
      } catch {
        // 롤백 중 추가 실패는 삼킨다 — 호출자에게는 원인 에러가 던져진다
      }
    }
  }
}
