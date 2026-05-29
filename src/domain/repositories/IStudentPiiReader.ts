import type { StudentPiiOverlay } from '../entities/StudentPiiOverlay';

/**
 * IStudentPiiReader — 학생 PII overlay 읽기 전용 포트
 *
 * `IStudentPiiRepository`의 read-only 슈퍼셋. 위젯 윈도우 또는 PII unlock 없이도
 * 안전하게 사용할 수 있는 경로 (실제 구현은 unlock 미통과 시 빈 결과 반환 가능).
 *
 * 사용처:
 * - `ToolGrouping`에서 학생 derive (P7)
 * - 위젯 윈도우 컴포넌트에서 안전한 access (Decision 9, 항상 빈 결과 반환)
 *
 * 관련 ADR: Decision 1, Decision 9
 */
export interface IStudentPiiReader {
  /** 전체 overlay (unlock 안 됐으면 빈 배열) */
  getAll(): Promise<readonly StudentPiiOverlay[]>;

  /** 단일 학생 overlay (unlock 안 됐거나 데이터 없으면 null) */
  get(studentId: string): Promise<StudentPiiOverlay | null>;

  /**
   * 현재 overlay snapshot의 버전 카운터.
   * 메모이제이션 키 일부로 사용된다 (Decision 7, A-2).
   * 저장소 mutation 시 monotonic 증가.
   */
  version(): number;
}
