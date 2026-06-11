import type { MemoShareBoardFile } from '../entities/MemoShareItem';

/**
 * 메모 교실 공유 — Google Drive 쓰기 포트 (plan.md v2 C-1, 의존 역전).
 *
 * usecase는 이 인터페이스만 알고 Drive를 직접 알지 않는다.
 * 구현은 `src/infrastructure/google/MemoShareDriveClient.ts`
 * (기존 GoogleDriveClient 합성 + 폴더 관리 + 공개 권한 부여)가 담당한다.
 */

/** 업로드할 이미지 1건 — domain은 Blob 대신 dataUrl 운반(외부 타입 무의존) */
export interface MemoShareImageUpload {
  itemId: string; // 로컬 Memo.id — 파일명 img-{itemId}.{ext}
  dataUrl: string; // data:image/...;base64,...
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface CreateBoardResult {
  fileId: string; // 보드 JSON Drive fileId → shareUrl 구성
  imageFileIds: Record<string, string>; // itemId → 업로드된 이미지 fileId
  createdAt: string; // ISO 8601
}

export interface UpdateBoardResult {
  imageFileIds: Record<string, string>; // 신규/교체 업로드된 itemId → fileId
  updatedAt: string;
}

export interface IMemoShareClient {
  /** 폴더 보장 → 이미지 업로드+공개권한 → fileId 치환된 JSON 업로드+공개권한 */
  createBoard(
    board: MemoShareBoardFile, // image.fileId는 빈 값 — 구현체가 치환
    images: readonly MemoShareImageUpload[],
  ): Promise<CreateBoardResult>;

  /** 이미지 증분(추가 업로드/제거 삭제) → JSON 전체 교체 업로드 */
  updateBoard(
    fileId: string,
    board: MemoShareBoardFile, // 최종 상태 전체 (부분 ops 아님)
    imagesToUpload: readonly MemoShareImageUpload[],
    imageFileIdsToDelete: readonly string[],
  ): Promise<UpdateBoardResult>;

  /** 이미지 전부 + JSON 영구 삭제 (휴지통 미경유) */
  deleteBoard(fileId: string, imageFileIds: readonly string[]): Promise<void>;
}
