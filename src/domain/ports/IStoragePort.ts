/**
 * 저장소 추상 인터페이스 (Port)
 * infrastructure 레이어에서 구현
 */
export interface IStoragePort {
  read<T>(filename: string): Promise<T | null>;
  write<T>(filename: string, data: T): Promise<void>;
}
