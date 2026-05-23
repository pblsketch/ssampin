import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const pageSource = () => read('src/adapters/components/ClassManagement/ClassManagementPage.tsx');
const inputSource = () => read('src/adapters/components/ClassManagement/ClassRecordInputView.tsx');
const gridSource = () => read('src/adapters/components/ClassManagement/ClassRecordStudentGrid.tsx');
const seatingSource = () => read('src/adapters/components/ClassManagement/ClassSeatingTab.tsx');
const autosaveSource = () =>
  read('src/adapters/components/ClassManagement/shared/attendanceAutosave.ts');

describe('class record phase 5 UX cleanup safeguards', () => {
  it('does not block class switching or page leave for Drive sync state', () => {
    const source = pageSource();
    expect(source).not.toContain(
      '동기화 중입니다. 이대로 이동하면 다른 기기에서 이 변경이 보이지 않을 수 있습니다',
    );
    expect(source).not.toContain(
      "driveStatus === 'syncing' || driveStatus === 'error' || lastSyncedAt < lastMutationAt",
    );
    expect(source).not.toContain("event.returnValue = '동기화 중입니다'");
    expect(source).not.toContain('syncToCloud()');
    expect(source).toContain('hasUnsafeLocalAttendanceSave');
  });

  it('tracks local attendance save pending/error separately from Drive sync', () => {
    const source = autosaveSource();
    expect(source).toContain('getPendingAttendanceSaveCount');
    expect(source).toContain('hasPendingAttendanceSave');
    expect(source).toContain('getLastAttendanceSaveErrorAt');
    expect(source).toContain('pendingLocalSaveCount');
    expect(source).toContain('finally');
  });

  it('removes the class-management attendance book tab', () => {
    const source = pageSource();
    expect(source).not.toContain("'attendance'");
    expect(source).not.toContain("label: '출석부'");
    expect(source).not.toContain('import { AttendanceTab }');
    expect(source).not.toContain('<AttendanceTab');
  });

  it('keeps seating management as seat editing/viewing only', () => {
    const source = seatingSource();
    expect(source).not.toContain('출석/기록');
    expect(source).not.toContain('isAttendanceMode');
    expect(source).not.toContain('handleSaveAttendance');
    expect(source).not.toContain('handleAttendanceClick');
    expect(source).toContain('이 좌석으로 수업 기록하기');
    expect(source).toContain('onOpenRecordSeatView');
  });

  it('simplifies class record attendance for one selected period', () => {
    const source = inputSource();
    expect(source).not.toContain('전체 출석으로 채우기');
    expect(source).toContain('체크하지 않은 학생은 출석으로 저장됩니다');
    expect(source).toContain('명렬 보기');
    expect(source).toContain('좌석 보기');
    expect(source).toContain('ATTENDANCE_REASONS');
    expect(source).toContain('reason');
    expect(source).toContain('memo');
    expect(source).toContain("status: 'present'");
  });

  it('uses responsive seat sizing in class record seat view', () => {
    const source = gridSource();
    expect(source).toContain('gridTemplateColumns');
    expect(source).toContain('aspect-[1.15/1]');
    expect(source).not.toContain('w-16 h-14');
  });
});
