import type { Gender } from '../valueObjects/Gender';
import type { AcademicLevel } from '../valueObjects/AcademicLevel';

/**
 * StudentPiiOverlay — 학생 PII 별도 보관 aggregate
 *
 * `Student` 도메인 코어와 분리하여 PII 흐름을 타입 시스템 수준에서 격리한다.
 * `studentId`로 `Student.id`와 1:1 조인. 별도 저장소·별도 동의·별도 게이트.
 *
 * - `gender` 미지정 허용 → `undefined`
 * - `academicLevel` 미지정 허용 → `undefined`
 *
 * 본 타입은 다음 경로로만 사용된다:
 * - `IStudentPiiRepository` (read/write)
 * - `IStudentPiiReader` (read-only, 위젯 윈도우 등)
 *
 * 본 타입을 `Student`에 합성하거나 직접 export하는 새 경로 추가 금지.
 * (P5 완료: `LegacyStudentView` 전환 어댑터 삭제됨.)
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 1
 */
export interface StudentPiiOverlay {
  readonly studentId: string;
  readonly gender?: Gender;
  readonly academicLevel?: AcademicLevel;
}

/** 빈 overlay 생성 (마이그레이션 / 기본값) */
export function emptyOverlay(studentId: string): StudentPiiOverlay {
  return { studentId };
}

/** overlay에 PII 데이터가 하나라도 있는지 */
export function hasAnyPii(overlay: StudentPiiOverlay): boolean {
  return overlay.gender !== undefined || overlay.academicLevel !== undefined;
}
