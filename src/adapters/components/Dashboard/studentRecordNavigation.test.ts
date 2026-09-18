/**
 * 학생 기록·출결 진입이 **창을 건너갈 때** 살아 있는지.
 *
 * ★막으려는 결함(2026-09-15 실기기에서 실제로 잡힘): 바탕화면 위젯 창에는 페이지 전환도
 * 빠른 추가 모달도 없다. 그 창에서 `ssampin:navigate` 를 쏘면 **아무도 받지 않아 단추가 죽는다.**
 * 게이트 4종은 전부 초록이었다 — 이 검사가 없으면 다시 죽는다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { parseNavigationTarget } from '@adapters/utils/navigationTarget';
import {
  HOMEROOM_ATTENDANCE_TARGET,
  applyStudentRecordIntent,
  classAttendanceTarget,
  quickRecordTarget,
  requestStudentRecordNavigation,
} from './studentRecordNavigation';

const navigateToPage = vi.fn().mockResolvedValue(undefined);
let dispatched: string[] = [];

beforeEach(() => {
  navigateToPage.mockClear();
  dispatched = [];
  useDesktopWidgetContextStore.setState({ isDesktopWidget: false });
  vi.stubGlobal('window', {
    electronAPI: { navigateToPage },
    dispatchEvent: (e: CustomEvent<string>) => {
      dispatched.push(e.detail);
      return true;
    },
    CustomEvent,
  });
  vi.stubGlobal('CustomEvent', CustomEvent);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useDesktopWidgetContextStore.setState({ isDesktopWidget: false });
});

describe('창을 건너가는 이동 요청', () => {
  it('메인 창에서는 앱 안 이벤트로 보낸다', () => {
    requestStudentRecordNavigation(HOMEROOM_ATTENDANCE_TARGET);
    expect(dispatched).toEqual(['homeroom#attendance']);
    expect(navigateToPage).not.toHaveBeenCalled();
  });

  it('바탕화면 위젯 창에서는 메인 창을 띄우는 IPC 로 보낸다 — 죽은 단추 금지', () => {
    useDesktopWidgetContextStore.setState({ isDesktopWidget: true });
    requestStudentRecordNavigation(classAttendanceTarget('c-7'));
    expect(navigateToPage).toHaveBeenCalledWith('class-management#attendance:c-7');
    expect(dispatched).toEqual([]);
  });

  it('두 경로가 같은 문자열을 쓰므로 도착지 해석이 한 벌이다', () => {
    for (const target of [
      quickRecordTarget(null),
      quickRecordTarget('c-1'),
      HOMEROOM_ATTENDANCE_TARGET,
      classAttendanceTarget('c-2'),
    ]) {
      expect(parseNavigationTarget(target).studentRecordIntent).not.toBeNull();
    }
  });
});

describe('도착한 창에서 의도 풀기', () => {
  it('빠른 기록은 학생 목록을 열고, 수업반에서 왔으면 그 명단으로 좁힌다', () => {
    applyStudentRecordIntent({ kind: 'quick-record', classId: 'c-3' });
    const s = useQuickAddStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.kind).toBe('student-record');
    expect(s.studentRecordFocus).toEqual({ classId: 'c-3' });
  });

  it('수업반 없이 열면 통합 검색으로 연다', () => {
    applyStudentRecordIntent({ kind: 'quick-record', classId: null });
    expect(useQuickAddStore.getState().studentRecordFocus).toBeNull();
  });

  it('담임 출결은 기록 화면을 출결 보기로 돌려놓는다', () => {
    useStudentRecordsStore.setState({ viewMode: 'input' });
    applyStudentRecordIntent({ kind: 'homeroom-attendance' });
    expect(useStudentRecordsStore.getState().viewMode).toBe('attendance');
  });

  it('수업 출결은 그 수업반을 고른 상태로 만든다 — 다른 반을 열지 않는다', () => {
    useTeachingClassStore.setState({ selectedClassId: null });
    applyStudentRecordIntent({ kind: 'class-attendance', classId: 'c-9' });
    expect(useTeachingClassStore.getState().selectedClassId).toBe('c-9');
  });
});
