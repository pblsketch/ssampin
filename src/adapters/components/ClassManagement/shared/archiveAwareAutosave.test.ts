/**
 * 보관된 반 읽기 전용 3중 방어 — 2겹: 출결 자동저장 시퀀서 미생성 (P1 S1.3 AC-4·AC-5).
 *
 * 계획: docs/01-plan/features/school-year-archive.plan.md §4 S1.3
 * 잠그는 결함: 보관된 반의 출결 탭을 열람만 해도 자동저장이 돌아
 * 보관된 학기 출결이 오늘 날짜로 갱신되는 사고(사전 부검 시나리오 A-3).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createArchiveAwareAttendanceSequencer } from './archiveAwareAutosave';
import { getPendingAttendanceSaveCount, getLastAttendanceSaveErrorAt } from './attendanceAutosave';
import type { AttendanceRecord } from '@domain/entities/Attendance';

const record: AttendanceRecord = {
  classId: 'tc-1',
  date: '2026-08-06',
  period: 1,
  students: [{ number: 1, status: 'present' }],
};

describe('createArchiveAwareAttendanceSequencer — 보관된 반 무저장', () => {
  it('saveBlocked=true면 enqueueSave를 아무리 호출해도 저장 함수가 0회 호출된다', async () => {
    const save = vi.fn(async () => true);
    const { enqueueSave } = createArchiveAwareAttendanceSequencer(true, save);

    await enqueueSave(record);
    await enqueueSave(record);
    await enqueueSave(record);

    expect(save).toHaveBeenCalledTimes(0);
  });

  it('saveBlocked=true 경로는 대기 카운트·저장 오류 상태를 건드리지 않는다 (이탈 경고 오발동 방지)', async () => {
    const pendingBefore = getPendingAttendanceSaveCount();
    const errorBefore = getLastAttendanceSaveErrorAt();
    const { enqueueSave } = createArchiveAwareAttendanceSequencer(true, async () => true);

    await enqueueSave(record);

    expect(getPendingAttendanceSaveCount()).toBe(pendingBefore);
    expect(getLastAttendanceSaveErrorAt()).toBe(errorBefore);
  });

  it('saveBlocked=false면 기존 시퀀서 그대로 — 저장 함수가 순서대로 호출된다', async () => {
    const save = vi.fn(async () => true);
    const { enqueueSave } = createArchiveAwareAttendanceSequencer(false, save);

    await enqueueSave(record);
    await enqueueSave(record);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith(record);
  });
});

describe('ClassRecordInputView 배선 계약 (소스 grep — 우회 생성 금지)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../ClassRecordInputView.tsx', import.meta.url)),
    'utf-8',
  );

  it('시퀀서는 보관 인지 팩토리(createArchiveAwareAttendanceSequencer)로만 만든다', () => {
    expect(source).toContain('createArchiveAwareAttendanceSequencer(');
    // 원시 시퀀서를 직접 만들면 보관된 반에서 자동저장이 되살아난다.
    expect(source).not.toContain('createAttendanceSaveSequencer(');
  });

  it('보관 판정은 isTeachingClassArchived를 경유한다 (.archived 직접 비교 금지)', () => {
    expect(source).toContain('isTeachingClassArchived(');
    expect(source).not.toMatch(/\.archived\s*===/);
  });
});
