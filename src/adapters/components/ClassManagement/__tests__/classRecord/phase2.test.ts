import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import {
  createAttendanceSaveSequencer,
  getLastAttendanceMutationAt,
  getLastAttendanceSaveErrorAt,
  getPendingAttendanceSaveCount,
  hasPendingAttendanceSave,
  markAttendanceMutation,
} from '../../shared/attendanceAutosave';

const classManagementDir = path.resolve(__dirname, '../..');

function readClassManagementSource(relativePath: string): string {
  return fs.readFileSync(path.join(classManagementDir, relativePath), 'utf8');
}

function makeRecord(id: number): AttendanceRecord {
  return {
    classId: 'class-1',
    date: '2026-05-23',
    period: 1,
    students: [{ number: id, grade: 1, classNum: 1, status: 'present' }],
  };
}

describe('class record phase 2 autosave safeguards', () => {
  it('serializes attendance saves in call order and continues after a failure', async () => {
    const saved: number[] = [];
    const save = vi.fn(async (record: AttendanceRecord) => {
      const number = record.students[0]?.number ?? 0;
      await Promise.resolve();
      saved.push(number);
      if (number === 2) throw new Error('transient write failure');
    });

    const { enqueueSave } = createAttendanceSaveSequencer(save);
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((n) => enqueueSave(makeRecord(n))),
    );

    expect(save).toHaveBeenCalledTimes(5);
    expect(saved).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(hasPendingAttendanceSave()).toBe(false);
    expect(getPendingAttendanceSaveCount()).toBe(0);
    expect(getLastAttendanceSaveErrorAt()).toBe(0);
  });

  it('exposes module-scope mutation time so route guards survive component unmounts', () => {
    const before = getLastAttendanceMutationAt();
    const marked = markAttendanceMutation();

    expect(marked).toBeGreaterThanOrEqual(before);
    expect(getLastAttendanceMutationAt()).toBe(marked);
  });

  it('keeps ClassRecordInputView behind the inline autosave feature flag and sequencer', () => {
    const source = readClassManagementSource('ClassRecordInputView.tsx');

    expect(source).toContain('FEATURE_FLAGS.inlineAutosave');
    expect(source).toContain('enqueueSave(record)');
    expect(source).toContain('출석 저장');
    expect(source).toContain('저장됨(로컬)');
    expect(source).toContain('동기화됨');
    expect(source).toContain('오프라인 변경');
  });

  it('guards class routing and beforeunload only while local attendance save is unsafe', () => {
    const source = readClassManagementSource('ClassManagementPage.tsx');

    expect(source).toContain('hasUnsafeLocalAttendanceSave');
    expect(source).toContain('hasPendingAttendanceSave()');
    expect(source).toContain('getLastAttendanceSaveErrorAt() > 0');
    expect(source).toContain('beforeunload');
    expect(source).toContain('출결이 아직 이 기기에 저장되지 않았습니다');
    expect(source).not.toContain('lastSyncedAt < lastMutationAt');
    expect(source).not.toContain('syncToCloud()');
    expect(source).not.toContain('동기화 중입니다');
  });
});
