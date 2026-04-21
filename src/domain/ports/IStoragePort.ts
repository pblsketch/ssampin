/**
 * 저장소 추상 인터페이스 (Port)
 * infrastructure 레이어에서 구현
 */
export interface IStoragePort {
  read<T>(filename: string): Promise<T | null>;
  write<T>(filename: string, data: T): Promise<void>;
  remove(filename: string): Promise<void>;

  /** 바이너리 파일 읽기. 미존재 시 null (예외 X). */
  readBinary(relPath: string): Promise<Uint8Array | null>;
  /** 바이너리 파일 쓰기. 중간 디렉토리 자동 생성, 덮어쓰기 허용. */
  writeBinary(relPath: string, bytes: Uint8Array): Promise<void>;
  /** 바이너리 파일 삭제. 미존재 시 no-op. */
  removeBinary(relPath: string): Promise<void>;
  /** 디렉토리 내 파일명 목록 (디렉토리 제외, 파일명만). */
  listBinary(dirRelPath: string): Promise<readonly string[]>;
}
