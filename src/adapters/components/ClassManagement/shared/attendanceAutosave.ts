import type { AttendanceRecord } from '@domain/entities/Attendance';

/** 저장 함수. `false` 를 돌려주면 쓰기가 차단돼 아무것도 저장되지 않았다는 뜻이다(ADR-027). */
export type AttendanceSaveFn = (record: AttendanceRecord) => Promise<boolean | void>;

let lastAttendanceMutationAt = 0;
let pendingLocalSaveCount = 0;
let lastAttendanceSaveErrorAt = 0;

export function markAttendanceMutation(now = Date.now()): number {
  lastAttendanceMutationAt = Math.max(lastAttendanceMutationAt, now);
  return lastAttendanceMutationAt;
}

export function getLastAttendanceMutationAt(): number {
  return lastAttendanceMutationAt;
}

export function getPendingAttendanceSaveCount(): number {
  return pendingLocalSaveCount;
}

export function hasPendingAttendanceSave(): boolean {
  return pendingLocalSaveCount > 0;
}

export function getLastAttendanceSaveErrorAt(): number {
  return lastAttendanceSaveErrorAt;
}

export function clearAttendanceSaveError(): void {
  lastAttendanceSaveErrorAt = 0;
}

export function createAttendanceSaveSequencer(saveAttendanceRecord: AttendanceSaveFn): {
  enqueueSave: AttendanceSaveFn;
} {
  let queue: Promise<unknown> = Promise.resolve();

  const runSave = async (record: AttendanceRecord): Promise<void> => {
    pendingLocalSaveCount += 1;
    try {
      // 명시적 false = 쓰기 차단(조용한 no-op). 성공으로 처리하면 아무것도 저장되지 않았는데
      // 그리드에 "저장됨 ✓" 이 뜬다. 예외로 올려 저장 실패 표시를 타게 한다(ADR-027).
      const saved = await saveAttendanceRecord(record);
      if (saved === false) throw new Error('출결 저장이 차단되어 기록하지 못했습니다.');
      clearAttendanceSaveError();
    } catch (error) {
      lastAttendanceSaveErrorAt = Date.now();
      throw error;
    } finally {
      pendingLocalSaveCount = Math.max(0, pendingLocalSaveCount - 1);
    }
  };

  const enqueueSave = (record: AttendanceRecord): Promise<void> => {
    const next = queue.then(
      () => runSave(record),
      () => runSave(record),
    );
    queue = next.catch(() => undefined);
    return next;
  };

  return { enqueueSave };
}
