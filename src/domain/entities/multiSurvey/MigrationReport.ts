/**
 * v1 → v2 마이그레이션 결과 리포트 (Design §2.3).
 * Infrastructure 레이어의 multiSurveyMigration.ts가 생성하고,
 * adapters/hooks/useMigrationReport.ts가 소비한다.
 */
export interface MigrationReport {
  /** 마이그레이션 시작 시각 (ISO 8601) */
  readonly attemptedAt: string;
  readonly totalCount: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly failedItems: readonly FailedMigrationItem[];
  /** 백업 경로 — .ssampin/backup/v1/<timestamp>.json */
  readonly backupPath: string;
}

/** 변환에 실패한 개별 항목 */
export interface FailedMigrationItem {
  readonly sourceId: string;
  readonly reason: string;
  /** 옛 포맷 원본 보관 (손실 방지) */
  readonly preservedRaw: unknown;
}
