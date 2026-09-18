/**
 * 학생 기록·출결 진입의 **창 경계를 넘는** 배선.
 *
 * ★왜 따로 두는가: 같은 카드가 대시보드(메인 창)와 바탕화면 위젯 창 양쪽에 놓인다.
 * 메인 창에서는 앱 안 이벤트로 바로 이동하면 되지만, 위젯 창에서는 페이지 전환 자체가 없어
 * `ssampin:navigate` 를 아무도 처리하지 않는다 — 실제로 위젯의 "출결 기록" 단추가
 * 눌러도 아무 일이 없었다. 위젯에서는 메인 창을 띄우는 IPC 로 보내야 한다.
 *
 * ★하위 탭 요청(`requestHomeroomTab` 등)은 그 창의 모듈 변수라 창을 건너가지 못한다.
 * 그래서 이동 문자열(`homeroom#attendance` 같은 fragment)에 의도를 담고, 도착한 창에서
 * `applyStudentRecordIntent` 가 푼다. 규칙은 `parseNavigationTarget` 한 곳에만 있다.
 */
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { requestHomeroomTab } from '../Homeroom/homeroomTabIntent';
import { requestClassManagementTab } from '../ClassManagement/classManagementTabIntent';
import type { StudentRecordIntent } from '@adapters/utils/navigationTarget';

/** 빠른 학생 기록 열기 — 수업반에서 시작하면 그 명단으로 좁힌다. */
export function quickRecordTarget(classId?: string | null): string {
  return classId ? `dashboard#quick-student-record:${classId}` : 'dashboard#quick-student-record';
}

export const HOMEROOM_ATTENDANCE_TARGET = 'homeroom#attendance';

export function classAttendanceTarget(classId: string): string {
  return `class-management#attendance:${classId}`;
}

/**
 * 이동 요청을 보낸다. 바탕화면 위젯 창이면 메인 창을 띄우는 IPC 로, 그 밖에는 앱 안 이벤트로.
 * 두 경로가 **같은 문자열**을 쓰므로 도착지 해석은 한 벌만 있으면 된다.
 */
export function requestStudentRecordNavigation(target: string): void {
  const api = window.electronAPI;
  if (useDesktopWidgetContextStore.getState().isDesktopWidget && api?.navigateToPage) {
    void api.navigateToPage(target);
    return;
  }
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: target }));
}

/**
 * 도착한 창에서 의도를 푼다. 페이지 전환은 호출하는 쪽이 이미 했다고 본다.
 *
 * ★출결은 여기서 저장하지 않는다. 기존 담임·수업 출결 화면으로 데려다 놓기만 하고
 * 저장 규칙은 그 화면이 그대로 갖는다.
 */
export function applyStudentRecordIntent(intent: StudentRecordIntent): void {
  if (intent.kind === 'quick-record') {
    useQuickAddStore
      .getState()
      .open('student-record', intent.classId === null ? null : { classId: intent.classId });
    return;
  }
  if (intent.kind === 'homeroom-attendance') {
    useStudentRecordsStore.getState().setViewMode('attendance');
    requestHomeroomTab('records');
    return;
  }
  useTeachingClassStore.getState().selectClass(intent.classId);
  requestClassManagementTab('record');
}
