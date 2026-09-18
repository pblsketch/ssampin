/**
 * parseNavigationTarget — 창 간 이동 지정 문자열 해석 회귀 테스트.
 *
 * IPC(onNavigateToPage)와 앱 내 이벤트(ssampin:navigate) 두 경로가 이 규칙 하나를 공유한다.
 * 특히 모르는 fragment 를 그대로 PageId 로 넘기면 존재하지 않는 페이지가 되어 빈 화면이 된다.
 */
import { describe, it, expect } from 'vitest';
import { parseNavigationTarget } from './navigationTarget';

describe('parseNavigationTarget', () => {
  it('fragment 가 없으면 그대로 페이지로 본다', () => {
    expect(parseNavigationTarget('timetable')).toEqual({
      page: 'timetable',
      settingsTab: null,
      timetableIntent: null,
      studentRecordIntent: null,
    });
  });

  it("'settings#widget' 은 설정 페이지의 해당 탭으로 연다", () => {
    expect(parseNavigationTarget('settings#widget')).toEqual({
      page: 'settings',
      settingsTab: 'widget',
      timetableIntent: null,
      studentRecordIntent: null,
    });
  });

  it("'timetable#sync-review' 는 시간표 페이지 + 변동 검토 의도로 해석한다", () => {
    expect(parseNavigationTarget('timetable#sync-review')).toEqual({
      page: 'timetable',
      settingsTab: null,
      timetableIntent: 'sync-review',
      studentRecordIntent: null,
    });
  });

  it('모르는 fragment 는 base 만 살려 빈 화면이 되지 않게 한다', () => {
    expect(parseNavigationTarget('timetable#unknown')).toEqual({
      page: 'timetable',
      settingsTab: null,
      timetableIntent: null,
      studentRecordIntent: null,
    });
  });

  it('빈 fragment 도 base 만 살린다', () => {
    expect(parseNavigationTarget('settings#')).toEqual({
      page: 'settings',
      settingsTab: null,
      timetableIntent: null,
      studentRecordIntent: null,
    });
  });

  describe('학생 기록·출결 진입 (창을 건너오는 의도)', () => {
    it("'dashboard#quick-student-record' 는 빠른 학생 기록을 연다", () => {
      expect(parseNavigationTarget('dashboard#quick-student-record')).toEqual({
        page: 'dashboard',
        settingsTab: null,
        timetableIntent: null,
        studentRecordIntent: { kind: 'quick-record', classId: null },
      });
    });

    it('수업반 id 를 붙이면 그 명단으로 좁혀 연다', () => {
      expect(parseNavigationTarget('dashboard#quick-student-record:c-1')).toEqual({
        page: 'dashboard',
        settingsTab: null,
        timetableIntent: null,
        studentRecordIntent: { kind: 'quick-record', classId: 'c-1' },
      });
    });

    it("'homeroom#attendance' 는 담임 출결 화면 의도를 싣는다", () => {
      expect(parseNavigationTarget('homeroom#attendance').studentRecordIntent).toEqual({
        kind: 'homeroom-attendance',
      });
    });

    it("'class-management#attendance:<id>' 는 그 수업반 출결 의도를 싣는다", () => {
      expect(parseNavigationTarget('class-management#attendance:c-2').studentRecordIntent).toEqual({
        kind: 'class-attendance',
        classId: 'c-2',
      });
    });

    it('반 id 가 없으면 의도를 만들지 않는다 — 엉뚱한 반을 열지 않는다', () => {
      const t = parseNavigationTarget('class-management#attendance:');
      expect(t.page).toBe('class-management');
      expect(t.studentRecordIntent).toBeNull();
    });
  });
});
