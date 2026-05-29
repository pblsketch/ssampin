import type { Student } from '@domain/entities/Student';
import type { NoPii } from '@shared/types/Brand';

/**
 * StudentNoPiiDto — wire 경계용 PII-free Student DTO.
 *
 * `Student` 도메인 코어 자체는 이미 `gender`/`academicLevel` 미보유 (P1 격리).
 * 하지만 Student 내부에는 phone/parentPhone/birthDate 등 추가 PII-인접 필드가 있다.
 * 본 DTO는 **id + name + studentNumber + status + isVacant**만 보유.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 6 + Addendum 1
 */
export interface StudentNoPiiDto {
  readonly id: string;
  readonly name: string;
  readonly studentNumber?: number;
  readonly isVacant?: boolean;
  readonly status?: Student['status'];
}

/**
 * createNoPiiDto — **유일한 합법 `Student & NoPii` mint 경로** (Decision 6 + Critic C#3).
 *
 * 명시 destructure로 PII-인접 필드(phone, parentPhone*, birthDate, statusNote 등)를 제거하고
 * Brand 마커를 부착한다. ESLint 룰 `no-pii-brand-assertion`이 `as NoPii` 캐스팅을 차단하므로,
 * 본 함수가 `Student & NoPii`를 만들 수 있는 유일한 path가 된다.
 *
 * 사용처:
 * - Excel/HWPX exporter (default: PII 제외)
 * - .ssampin 외부 import/export 본문
 * - supabase/google sync DTO
 *
 * @returns `Student & NoPii` (런타임상 StudentNoPiiDto)
 */
export function createNoPiiDto(s: Student): StudentNoPiiDto & NoPii {
  // 명시 destructure: 추가 PII 인접 필드(`phone`, `parentPhone*`, `birthDate`, `statusNote`,
  // `statusChangedAt`, `parentPhoneLabel`, `parentPhone2*`)를 의도적으로 누락.
  const stripped: StudentNoPiiDto = {
    id: s.id,
    name: s.name,
    studentNumber: s.studentNumber,
    isVacant: s.isVacant,
    status: s.status,
  };
  // Brand 마커는 phantom — 런타임 부착 없이 타입 시스템 수준에서만 표시.
  return stripped as StudentNoPiiDto & NoPii;
}

/**
 * createNoPiiDtos — 다수 학생 일괄 처리 헬퍼.
 */
export function createNoPiiDtos(
  students: readonly Student[],
): readonly (StudentNoPiiDto & NoPii)[] {
  return students.map(createNoPiiDto);
}
