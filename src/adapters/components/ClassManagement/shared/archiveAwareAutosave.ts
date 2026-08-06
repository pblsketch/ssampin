import { createAttendanceSaveSequencer, type AttendanceSaveFn } from './attendanceAutosave';

/**
 * 보관(아카이브) 인지 출결 자동저장 시퀀서 팩토리 — 읽기 전용 3중 방어의 2겹.
 *
 * 보관된 반(또는 아직 로드되지 않아 판정할 수 없는 반)에서는 저장 시퀀서를
 * 아예 만들지 않고 무저장 no-op을 돌려준다. 조회(렌더)는 그대로 두되, 어떤
 * 경로로 enqueueSave가 호출되더라도 파일에 아무것도 쓰지 않는다
 * (school-year-archive plan §4 S1.3 AC-4 — 자동저장 시퀀서 미생성).
 *
 * - no-op 경로는 대기 카운트·저장 오류 상태도 건드리지 않는다
 *   (페이지 이탈 경고 "출결이 아직 저장되지 않았습니다" 오발동 방지).
 * - 보관 여부 판정은 호출자가 isTeachingClassArchived()로 수행해 boolean으로
 *   넘긴다(.archived 직접 비교 금지 규칙과 시퀀서 재생성 최소화를 위해).
 */
export function createArchiveAwareAttendanceSequencer(
  saveBlocked: boolean,
  saveAttendanceRecord: AttendanceSaveFn,
): { enqueueSave: AttendanceSaveFn } {
  if (saveBlocked) {
    return { enqueueSave: () => Promise.resolve() };
  }
  return createAttendanceSaveSequencer(saveAttendanceRecord);
}
