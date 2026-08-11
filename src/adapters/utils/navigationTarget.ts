import type { PageId } from '@adapters/components/Layout/Sidebar';
import type { SettingsTabId } from '@adapters/components/Settings/SettingsPage';
import type { TimetableInitialIntent } from '@adapters/components/Timetable/TimetablePage';

export interface NavigationTarget {
  readonly page: PageId;
  /** 설정 페이지 진입 시 열 탭 */
  readonly settingsTab: SettingsTabId | null;
  /** 시간표 페이지 진입 의도 */
  readonly timetableIntent: TimetableInitialIntent | null;
}

/**
 * 'settings#widget' / 'timetable#sync-review' 처럼 fragment 가 붙은 페이지 지정을 해석한다.
 *
 * IPC 경로(onNavigateToPage)와 앱 내 이벤트 경로(ssampin:navigate)가 같은 규칙을 쓰므로
 * 규칙은 여기 한 곳에만 둔다 — 한쪽만 고쳐 둘이 갈라지는 것을 막기 위함.
 *
 * 모르는 fragment 는 base 만 살린다. 예전에는 'timetable#x' 같은 문자열이 그대로
 * PageId 로 들어가 존재하지 않는 페이지 → 빈 화면이 됐다.
 */
export function parseNavigationTarget(raw: string): NavigationTarget {
  const hashIdx = raw.indexOf('#');
  if (hashIdx < 0) {
    return { page: raw as PageId, settingsTab: null, timetableIntent: null };
  }

  const base = raw.slice(0, hashIdx);
  const fragment = raw.slice(hashIdx + 1);

  if (base === 'settings' && fragment.length > 0) {
    return { page: 'settings', settingsTab: fragment as SettingsTabId, timetableIntent: null };
  }
  if (base === 'timetable' && fragment === 'sync-review') {
    return { page: 'timetable', settingsTab: null, timetableIntent: 'sync-review' };
  }

  return { page: base as PageId, settingsTab: null, timetableIntent: null };
}
