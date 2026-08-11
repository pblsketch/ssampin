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
    });
  });

  it("'settings#widget' 은 설정 페이지의 해당 탭으로 연다", () => {
    expect(parseNavigationTarget('settings#widget')).toEqual({
      page: 'settings',
      settingsTab: 'widget',
      timetableIntent: null,
    });
  });

  it("'timetable#sync-review' 는 시간표 페이지 + 변동 검토 의도로 해석한다", () => {
    expect(parseNavigationTarget('timetable#sync-review')).toEqual({
      page: 'timetable',
      settingsTab: null,
      timetableIntent: 'sync-review',
    });
  });

  it('모르는 fragment 는 base 만 살려 빈 화면이 되지 않게 한다', () => {
    expect(parseNavigationTarget('timetable#unknown')).toEqual({
      page: 'timetable',
      settingsTab: null,
      timetableIntent: null,
    });
  });

  it('빈 fragment 도 base 만 살린다', () => {
    expect(parseNavigationTarget('settings#')).toEqual({
      page: 'settings',
      settingsTab: null,
      timetableIntent: null,
    });
  });
});
