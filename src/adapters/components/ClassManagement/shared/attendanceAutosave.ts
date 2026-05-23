import type { AttendanceRecord } from '@domain/entities/Attendance';

export type AttendanceSaveFn = (record: AttendanceRecord) => Promise<void>;

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
      await saveAttendanceRecord(record);
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
