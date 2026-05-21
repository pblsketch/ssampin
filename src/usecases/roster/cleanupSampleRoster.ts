/**
 * cleanupSampleRoster.ts
 *
 * 신규 설치 시 자동 시드되는 데모 35명 명렬을 "사용자가 손도 안 댄 채 그대로
 * 두고 있는지"를 판정하여, 자동 정리(`cleanup`) · 안내 배너(`banner`) ·
 * 동작 없음(`noop`) 중 하나의 액션을 결정하는 순수 함수.
 *
 * 본 모듈은 외부 부수효과 없이 결정만 한다. 실제 저장소 변경·토스트·플래그
 * 세팅은 어댑터 레이어(`useStudentStore.load()`)가 본 함수의 반환값을 받아
 * 수행한다.
 *
 * 자세한 설계: `docs/02-design/features/roster-sample-data-removal.design.md` §3.2
 *
 * @see SAMPLE_ROSTER_SIGNATURE — 비교 기준 시그니처
 * @see isSampleRoster — 가드 A·B·C
 * @see hasUserDataMarks — 가드 E
 */

import type { Student } from '@domain/entities/Student';
import type { Settings } from '@domain/entities/Settings';
import { isSampleRoster, hasUserDataMarks } from '@domain/rules/sampleRosterSignature';

/**
 * 외부 도메인(출결·자리·자리뽑기·상담 등)에서 학생 id를 참조한 횟수 집계.
 *
 * 한 건이라도 참조가 있다면 "사용자가 샘플 명단을 자기 데이터처럼 운영했다"는
 * 강한 신호이므로 자동 정리 대상에서 제외(가드 D).
 *
 * 각 필드는 0 이상의 정수여야 하며, 음수가 들어와도 합산 0보다 큰지로만 판정한다.
 */
export interface SampleRosterExternalRefs {
  /** 학생 기록(담임 업무 records)에서 학생을 참조한 항목 수 */
  readonly studentRecordCount: number;
  /** 자리 배치(seating)에서 학생을 참조한 항목 수 */
  readonly seatingRefCount: number;
  /** 자리 제약(seatConstraints)에서 학생을 참조한 항목 수 */
  readonly seatConstraintCount: number;
  /** 자리 뽑기(seatPicker)에서 학생을 참조한 항목 수 */
  readonly seatPickerRefCount: number;
  /** 담임 출결(homeroomAttendance)에서 학생을 참조한 항목 수 */
  readonly homeroomAttendanceCount: number;
  /** 상담(consultation)에서 학생을 참조한 항목 수 */
  readonly consultationRefCount: number;
}

/**
 * 자동 정리 결정 결과.
 *
 * - `cleanup`: 가드 A·B·C·D·E·F·G 모두 통과 → students=[] + 정리 플래그 + 토스트
 * - `banner`:  가드 A·B·C 통과했지만 D 또는 E 실패 → 명단 유지 + 상단 안내 배너
 * - `noop`:    그 외 모든 경우 → 본인 명단으로 확정, 아무 동작 없음
 */
export type CleanupAction = 'cleanup' | 'banner' | 'noop';

/**
 * 가드 6중 AND로 자동 정리 액션을 결정한다. 순수 함수.
 *
 * 가드 평가 순서(빠른 종료 → 안전):
 *   1. G — 멱등성: `settings.didCleanSampleRoster === true`이면 즉시 `noop`.
 *      이미 한 번 정리한 기기에서 사용자가 우연히 같은 35명을 다시 만들어도
 *      두 번 정리하지 않는다.
 *   2. A·B·C — 시그니처 매칭: `isSampleRoster(students) === false`이면 `noop`.
 *      길이/id/이름/번호 중 하나라도 다르면 본인 명단이므로 보존.
 *   3. F — 사용자 의도 흔적: `settings.everEditedRoster === true`이면 `noop`.
 *      RosterManagementTab에서 한 번이라도 수정한 적 있으면 본인 데이터 취급.
 *   4. D — 외부 참조: refs 합산 > 0이면 `banner`.
 *      샘플 명단을 자기 학생처럼 출결·자리·상담에 쓴 흔적이 있음. 자동 삭제 불가.
 *   5. E — 학생 필드 흔적: `hasUserDataMarks(students) === true`이면 `banner`.
 *      연락처/생년월일/상태 메모 중 하나라도 입력 → 본인 학생으로 운영 중.
 *   6. 위 모두 통과 → `cleanup`.
 *
 * @param students 검사할 명렬 (읽기 전용)
 * @param externalRefs 외부 도메인에서 학생 id를 참조한 건수
 * @param settings 현재 설정 — `didCleanSampleRoster`, `everEditedRoster` 두 플래그 참조
 * @returns 자동 정리 액션
 */
export function decideCleanupAction(
  students: readonly Student[],
  externalRefs: SampleRosterExternalRefs,
  settings: Settings,
): CleanupAction {
  // 가드 G — 멱등성: 이미 정리한 기기는 절대 재실행하지 않는다.
  if (settings.didCleanSampleRoster === true) {
    return 'noop';
  }

  // 가드 A·B·C — 시그니처 매칭: 길이/id/이름/번호가 정확히 일치해야만 진행.
  if (!isSampleRoster(students)) {
    return 'noop';
  }

  // 가드 F — 사용자 의도 흔적: 한 번이라도 명렬을 만진 적 있으면 보존.
  if (settings.everEditedRoster === true) {
    return 'noop';
  }

  // 가드 D — 외부 참조: 출결/자리/자리뽑기/상담 중 한 건이라도 있으면 배너.
  const externalRefTotal =
    externalRefs.studentRecordCount +
    externalRefs.seatingRefCount +
    externalRefs.seatConstraintCount +
    externalRefs.seatPickerRefCount +
    externalRefs.homeroomAttendanceCount +
    externalRefs.consultationRefCount;
  if (externalRefTotal > 0) {
    return 'banner';
  }

  // 가드 E — 학생 필드 흔적: 연락처/생년월일/상태 메모가 입력되어 있으면 배너.
  if (hasUserDataMarks(students)) {
    return 'banner';
  }

  // 가드 A~G 모두 통과 — 신규 설치 후 손도 안 댄 샘플로 확정. 자동 정리 안전.
  return 'cleanup';
}
