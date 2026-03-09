/** Google Drive 폴더 정보 (포트용) */
export interface DriveFolderInfo {
  readonly id: string;
  readonly name: string;
}

/** Google Drive 포트 — UseCase에서 Drive 작업 시 사용 */
export interface IGoogleDrivePort {
  /** "쌤핀 과제" 루트 폴더 조회 또는 생성 */
  getOrCreateRootFolder(): Promise<DriveFolderInfo>;
  /** 서브폴더 생성 */
  createSubFolder(name: string, parentId: string): Promise<DriveFolderInfo>;
}
