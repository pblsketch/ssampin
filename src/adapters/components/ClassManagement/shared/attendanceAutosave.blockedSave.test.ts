/**
 * 출결 자동저장 시퀀서 — "차단된 저장"이 성공으로 굳지 않는지 검증한다.
 *
 * 배경(ADR-027): 출결 저장 경로는 읽기 오류 등으로 쓰기가 막히면 예외를 던지지 않고
 * 조용히 아무것도 하지 않았다. 시퀀서가 이를 성공으로 처리하면 아무것도 저장되지 않은 채
 * 그리드에 "저장됨 ✓" 이 뜬다. 이제 저장 함수는 `false` 로 차단을 알리고,
 * 시퀀서는 이를 저장 실패로 승격한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import {
  createAttendanceSaveSequencer,
  clearAttendanceSaveError,
  getLastAttendanceSaveErrorAt,
  getPendingAttendanceSaveCount,
} from './attendanceAutosave';

const record: AttendanceRecord = {
  classId: 'class-1',
  date: '2026-07-23',
  period: 1,
  students: [{ number: 1, status: 'present' }],
};

describe('attendanceAutosave — 차단된 저장 표면화', () => {
  beforeEach(() => {
    clearAttendanceSaveError();
  });

  it('저장 함수가 false 를 돌려주면 저장 실패로 올린다', async () => {
    const { enqueueSave } = createAttendanceSaveSequencer(async () => false);

    await expect(enqueueSave(record)).rejects.toThrow(/차단/);
    expect(getLastAttendanceSaveErrorAt()).toBeGreaterThan(0);
  });

  it('저장 함수가 true 를 돌려주면 성공으로 처리한다', async () => {
    const { enqueueSave } = createAttendanceSaveSequencer(async () => true);

    await expect(enqueueSave(record)).resolves.toBeUndefined();
    expect(getLastAttendanceSaveErrorAt()).toBe(0);
  });

  it('반환값이 없는(void) 기존 저장 함수는 그대로 성공으로 본다', async () => {
    const { enqueueSave } = createAttendanceSaveSequencer(async () => undefined);

    await expect(enqueueSave(record)).resolves.toBeUndefined();
    expect(getLastAttendanceSaveErrorAt()).toBe(0);
  });

  it('차단으로 실패해도 진행 중 카운터가 새지 않는다', async () => {
    const { enqueueSave } = createAttendanceSaveSequencer(async () => false);

    await expect(enqueueSave(record)).rejects.toThrow();
    expect(getPendingAttendanceSaveCount()).toBe(0);
  });
});
