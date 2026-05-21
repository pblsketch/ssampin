/**
 * collectExternalRefs.ts
 *
 * roster-sample-data-removal Phase 2 — 외부 도메인 참조 수집 (가드 D 입력).
 *
 * `decideCleanupAction`이 필요로 하는 `SampleRosterExternalRefs`를 6개 도메인 store에서
 * 한 번에 모은다. 각 store는 다음 두 시그니처 중 하나를 노출한다:
 *
 *   - id 기반:        `hasStudentReferences(studentIds: readonly string[]): number`
 *     → StudentRecords / Seating / SeatConstraints / SeatPickerConfig
 *
 *   - 이름 보수 기반: `hasStudentReferencesByName(names: readonly string[]): number`
 *     → TeachingClass(담임 출결 컨테이너) / Consultation
 *     (이 두 도메인은 학생 number/이름 기반 외부 키라 id 매칭이 불가능하므로
 *      false-positive를 줄이기 위해 보수적 이름 매칭 사용. 디자인 §3.3 참조.)
 *
 * 본 함수는 의도적으로 어댑터 레이어의 store들을 dynamic import 한다 — usecases 레이어가
 * 어댑터를 정적으로 참조하면 Clean Architecture 의존 방향 위반이지만, **단일 마이그레이션
 * 트리거 지점**에서만 호출되므로 dynamic import로 순환 의존을 피하면서 사용 빈도를 최소화한다.
 *
 * 자세한 설계: `docs/02-design/features/roster-sample-data-removal.design.md` §3.3, §3.5
 */

import type { Student } from '@domain/entities/Student';
import type { SampleRosterExternalRefs } from '@usecases/roster/cleanupSampleRoster';

/**
 * 학생 명렬을 입력 받아 외부 6개 도메인에서의 참조 건수를 집계해 반환한다.
 *
 * 호출자(`useStudentStore.load()`)는 결과를 그대로 `decideCleanupAction`에 전달한다.
 *
 * @param students 검사할 명렬 (보통 SAMPLE 35명)
 * @returns 6개 도메인 각각의 참조 건수
 */
export async function collectSampleRosterExternalRefs(
  students: readonly Student[],
): Promise<SampleRosterExternalRefs> {
  const ids = students.map((s) => s.id);
  const names = students.map((s) => s.name);

  // Dynamic import — usecases → adapters 정적 참조 회피 + 순환 의존 차단.
  // 각 store는 모듈 단일 인스턴스이므로 import 비용은 첫 호출 1회뿐.
  const [
    { useStudentRecordsStore },
    { useSeatingStore },
    { useSeatConstraintsStore },
    { useSeatPickerConfigStore },
    { useTeachingClassStore },
    { useConsultationStore },
  ] = await Promise.all([
    import('@adapters/stores/useStudentRecordsStore'),
    import('@adapters/stores/useSeatingStore'),
    import('@adapters/stores/useSeatConstraintsStore'),
    import('@adapters/stores/useSeatPickerConfigStore'),
    import('@adapters/stores/useTeachingClassStore'),
    import('@adapters/stores/useConsultationStore'),
  ]);

  return {
    studentRecordCount: useStudentRecordsStore.getState().hasStudentReferences(ids),
    seatingRefCount: useSeatingStore.getState().hasStudentReferences(ids),
    seatConstraintCount: useSeatConstraintsStore.getState().hasStudentReferences(ids),
    seatPickerRefCount: useSeatPickerConfigStore.getState().hasStudentReferences(ids),
    homeroomAttendanceCount: useTeachingClassStore.getState().hasStudentReferencesByName(names),
    consultationRefCount: useConsultationStore.getState().hasStudentReferencesByName(names),
  };
}
