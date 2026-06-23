import type { StudentRecordsData } from '../entities/StudentRecord';

export interface IStudentRecordsRepository {
  getRecords(): Promise<StudentRecordsData | null>;
  saveRecords(data: StudentRecordsData): Promise<void>;
  /**
   * Q2 마이그레이션 1회 안전 백업(이미 백업이 있으면 no-op). 비파괴·additive 마이그레이션의 방어망.
   * 선택 구현 — 미구현 repo(테스트 fake 등)는 호출자가 `?.`로 건너뛴다.
   */
  saveBackupOnce?(data: StudentRecordsData): Promise<void>;
}
