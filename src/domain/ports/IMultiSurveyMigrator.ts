import type { MigrationReport } from '../entities/multiSurvey/MigrationReport';

/**
 * v1 → v2 마이그레이션 포트 (Design §2.4).
 * Infrastructure 레이어(electron/ipc/multiSurveyMigration.ts)가 구현한다.
 */
export interface IMultiSurveyMigrator {
  /** v1 데이터 배열을 받아 v2로 변환하고 MigrationReport를 반환 */
  migrate(v1Data: readonly unknown[]): Promise<MigrationReport>;
  /** backupPath에 보관된 v1 원본으로 롤백 */
  rollback(backupPath: string): Promise<void>;
  /** 마지막 마이그레이션 리포트 조회. 없으면 null */
  getReport(): MigrationReport | null;
}
