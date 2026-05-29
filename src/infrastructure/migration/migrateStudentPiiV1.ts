import type { Student } from '@domain/entities/Student';
import type { IStudentPiiRepository } from '@domain/repositories/IStudentPiiRepository';
import type { IAuditLogger } from '@domain/ports/IAuditLogger';
import { emptyOverlay, type StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * MigrationResult — 마이그레이션 1회 실행 결과
 *
 * - `migrated`  : 신규 overlay 생성 (createdCount > 0).
 * - `noop`      : 모든 학생이 이미 overlay 보유. 기록 변경 없음.
 * - `corrupted` : 저장소 read/write 실패. Option α 복원 CTA 분기 (Decision 4).
 */
export interface MigrationResult {
  readonly outcome: 'migrated' | 'noop' | 'corrupted';
  readonly createdCount: number;
  readonly error?: string;
}

/**
 * migrateStudentPiiV1 — Decision 4 + Decision 6 (Migration as a boot step)
 *
 * **부팅 시 1회 실행**, idempotent.
 *
 * 도메인 흐름:
 * 1. `piiRepo.getAll()` — 기존 overlay 집합 로드.
 * 2. 각 학생에 대해 overlay 부재 시 빈 overlay 생성 큐에 추가.
 * 3. 큐 비어있으면 `noop` 반환 (audit log 미발생).
 * 4. `piiRepo.saveAll(existing + newOverlays)` — atomic 시도. 실패 시 `corrupted` 반환.
 * 5. 성공 시 `migrated` 반환 + `migrate` sticky audit log 1회.
 *
 * **Atomic 보장**: `IStudentPiiRepository.saveAll` 구현체(FileStudentPiiRepository)가 책임.
 * 본 함수는 부분 실패 → next-boot 재시도 idempotency를 비즈니스 레이어에서 보장.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 4 + Decision 6
 */
export async function migrateStudentPiiV1(
  students: readonly Student[],
  piiRepo: IStudentPiiRepository,
  audit: IAuditLogger,
): Promise<MigrationResult> {
  let existing: readonly StudentPiiOverlay[];
  try {
    existing = await piiRepo.getAll();
  } catch (err) {
    return {
      outcome: 'corrupted',
      createdCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const existingIds = new Set(existing.map((o) => o.studentId));
  const additions: StudentPiiOverlay[] = [];
  for (const s of students) {
    if (!existingIds.has(s.id)) additions.push(emptyOverlay(s.id));
  }

  if (additions.length === 0) {
    return { outcome: 'noop', createdCount: 0 };
  }

  const next = [...existing, ...additions];
  try {
    await piiRepo.saveAll(next);
  } catch (err) {
    return {
      outcome: 'corrupted',
      createdCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await Promise.resolve(
    audit.logPiiAccess({
      action: 'migrate',
      studentIdHash: '',
      capability: 'system',
      timestamp: Date.now(),
      meta: { from: 'none', to: 'v1', createdCount: additions.length },
    }),
  );

  return { outcome: 'migrated', createdCount: additions.length };
}
