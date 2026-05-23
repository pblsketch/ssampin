import type { AttendanceRecord } from '@domain/entities/Attendance';

export type AttendanceSaveFn = (record: AttendanceRecord) => Promise<void>;

let lastAttendanceMutationAt = 0;

export function markAttendanceMutation(now = Date.now()): number {
  lastAttendanceMutationAt = Math.max(lastAttendanceMutationAt, now);
  return lastAttendanceMutationAt;
}

export function getLastAttendanceMutationAt(): number {
  return lastAttendanceMutationAt;
}

export function createAttendanceSaveSequencer(saveAttendanceRecord: AttendanceSaveFn): {
  enqueueSave: AttendanceSaveFn;
} {
  let queue: Promise<unknown> = Promise.resolve();

  const enqueueSave = (record: AttendanceRecord): Promise<void> => {
    const next = queue.then(
      () => saveAttendanceRecord(record),
      () => saveAttendanceRecord(record),
    );
    queue = next.catch(() => undefined);
    return next;
  };

  return { enqueueSave };
}
