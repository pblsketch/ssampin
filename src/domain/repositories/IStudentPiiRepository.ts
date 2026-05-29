import type { StudentPiiOverlay } from '../entities/StudentPiiOverlay';

/**
 * IStudentPiiRepository — 학생 PII overlay 영속 포트
 *
 * 구현체:
 * - `src/infrastructure/persistence/FileStudentPiiRepository.ts` (영구 저장, P3)
 * - `src/infrastructure/persistence/SessionOnlyStudentPiiRepository.ts` (세션 한정, P3)
 *
 * 동의 모드 (`영구 저장` / `이번 세션만`)에 따라 DI 팩토리가 구현 swap.
 *
 * 관련 ADR: Decision 1, Decision 10
 */
export interface IStudentPiiRepository {
  /** 전체 overlay 조회 */
  getAll(): Promise<readonly StudentPiiOverlay[]>;

  /** 단일 학생 overlay (없으면 null) */
  get(studentId: string): Promise<StudentPiiOverlay | null>;

  /** 단일 overlay 저장/갱신 (upsert) */
  save(overlay: StudentPiiOverlay): Promise<void>;

  /** 학생 PII 전부 삭제 */
  delete(studentId: string): Promise<void>;

  /** 전체 일괄 저장 (마이그레이션·일괄 입력) */
  saveAll(overlays: readonly StudentPiiOverlay[]): Promise<void>;

  /** 세션 종료 시 리소스 정리 (SessionOnly용; 영구 저장 구현은 no-op). */
  dispose(): Promise<void>;
}
