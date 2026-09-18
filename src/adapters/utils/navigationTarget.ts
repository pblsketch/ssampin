import type { PageId } from '@adapters/components/Layout/Sidebar';
import type { SettingsTabId } from '@adapters/components/Settings/SettingsPage';
import type { TimetableInitialIntent } from '@adapters/components/Timetable/TimetablePage';

/**
 * 학생 기록 진입 의도 — **다른 창에서 넘어올 때** 쓴다.
 *
 * ★왜 문자열에 실어 보내는가: `requestHomeroomTab`·`selectClass` 같은 하위 탭 요청은 그 창의
 * 모듈 변수라서 창을 건너가지 못한다. 바탕화면 위젯에서 누른 "출결 기록"이 메인 창에서는
 * 아무 일도 일어나지 않던 이유가 이것이다. 그래서 이동 문자열 하나에 의도까지 담는다.
 */
export type StudentRecordIntent =
  | { readonly kind: 'quick-record'; readonly classId: string | null }
  | { readonly kind: 'homeroom-attendance' }
  | { readonly kind: 'class-attendance'; readonly classId: string };

export interface NavigationTarget {
  readonly page: PageId;
  /** 설정 페이지 진입 시 열 탭 */
  readonly settingsTab: SettingsTabId | null;
  /** 시간표 페이지 진입 의도 */
  readonly timetableIntent: TimetableInitialIntent | null;
  /** 학생 기록·출결 진입 의도 */
  readonly studentRecordIntent: StudentRecordIntent | null;
}

const EMPTY = {
  settingsTab: null,
  timetableIntent: null,
  studentRecordIntent: null,
} as const;

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
    return { page: raw as PageId, ...EMPTY };
  }

  const base = raw.slice(0, hashIdx);
  const fragment = raw.slice(hashIdx + 1);

  if (base === 'settings' && fragment.length > 0) {
    return { page: 'settings', ...EMPTY, settingsTab: fragment as SettingsTabId };
  }
  if (base === 'timetable' && fragment === 'sync-review') {
    return { page: 'timetable', ...EMPTY, timetableIntent: 'sync-review' };
  }

  // 'dashboard#quick-student-record' / '...:<수업반 id>' — 빠른 학생 기록 창 열기.
  if (base === 'dashboard' && fragment.startsWith('quick-student-record')) {
    const classId = fragment.slice('quick-student-record'.length);
    return {
      page: 'dashboard',
      ...EMPTY,
      studentRecordIntent: {
        kind: 'quick-record',
        classId: classId.startsWith(':') && classId.length > 1 ? classId.slice(1) : null,
      },
    };
  }
  if (base === 'homeroom' && fragment === 'attendance') {
    return { page: 'homeroom', ...EMPTY, studentRecordIntent: { kind: 'homeroom-attendance' } };
  }
  // 'class-management#attendance:<수업반 id>' — 반 id 가 없으면 의도를 만들지 않는다
  // (엉뚱한 반의 출결 화면을 여는 것보다 수업 관리 첫 화면이 낫다).
  if (base === 'class-management' && fragment.startsWith('attendance:')) {
    const classId = fragment.slice('attendance:'.length);
    if (classId.length > 0) {
      return {
        page: 'class-management',
        ...EMPTY,
        studentRecordIntent: { kind: 'class-attendance', classId },
      };
    }
  }

  return { page: base as PageId, ...EMPTY };
}
