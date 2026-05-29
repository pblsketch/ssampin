import type { Student } from '@domain/entities/Student';
import type { IStudentPiiRepository } from '@domain/repositories/IStudentPiiRepository';
import type { IAuditLogger } from '@domain/ports/IAuditLogger';
import { migrateStudentPiiV1, type MigrationResult } from '@infrastructure/migration/migrateStudentPiiV1';

/**
 * 부팅 시 마이그레이션 흐름 결과.
 *
 * - `ready`     : 정상 완료 (migrated / noop). 앱 라우팅 시작 가능.
 * - `blocked`   : Option α 복원 CTA 표시 후 사용자 결정 대기. 메인 라우트 마운트 차단.
 */
export interface BootMigrationOutcome {
  readonly status: 'ready' | 'blocked';
  readonly cta?: BootRestoreCta;
  /** 마이그레이션 상세 결과 (디버깅/관측용). */
  readonly migration: MigrationResult;
}

/**
 * Option α 복원 CTA (Decision 4).
 *
 * UI 컴포넌트가 본 객체를 받아 3-way 모달 표시:
 * - 백업 파일에서 복원
 * - 초기화 후 새로 시작 (모든 PII 폐기)
 * - 지원팀에 문의
 */
export interface BootRestoreCta {
  readonly title: string;
  readonly message: string;
  readonly errorDetail?: string;
  readonly actions: readonly BootRestoreAction[];
}

export type BootRestoreActionKind = 'restore-backup' | 'reset' | 'contact-support';

export interface BootRestoreAction {
  readonly kind: BootRestoreActionKind;
  readonly label: string;
}

const DEFAULT_RESTORE_ACTIONS: readonly BootRestoreAction[] = [
  { kind: 'restore-backup', label: '백업 파일에서 복원' },
  { kind: 'reset', label: '초기화 후 새로 시작' },
  { kind: 'contact-support', label: '지원팀에 문의' },
];

/**
 * 앱 부팅 시 학생 PII 마이그레이션 실행 + Option α CTA 분기.
 *
 * **흐름**:
 * 1. `migrateStudentPiiV1` 실행
 * 2. outcome === 'migrated' | 'noop' → `ready`
 * 3. outcome === 'corrupted' → `blocked` + CTA 객체 반환
 *
 * 호출자(App 부팅 컴포넌트)는 `ready` 시 메인 라우트 마운트, `blocked` 시 모달만 표시.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 4
 */
export async function runStudentPiiMigration(
  students: readonly Student[],
  piiRepo: IStudentPiiRepository,
  audit: IAuditLogger,
): Promise<BootMigrationOutcome> {
  const migration = await migrateStudentPiiV1(students, piiRepo, audit);

  if (migration.outcome === 'corrupted') {
    return {
      status: 'blocked',
      migration,
      cta: {
        title: '학생 정보 마이그레이션 실패',
        message:
          '학생 민감 정보(성별·학업성취도) 저장소를 읽을 수 없습니다.\n아래에서 복원 또는 초기화를 선택해주세요.',
        errorDetail: migration.error,
        actions: DEFAULT_RESTORE_ACTIONS,
      },
    };
  }

  return { status: 'ready', migration };
}
