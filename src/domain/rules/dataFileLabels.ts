/**
 * 데이터 파일(동기화 키) → 선생님이 앱 화면에서 보는 이름. **이 표 하나**를 '동기화 충돌' 창과
 * 시작 스냅샷 복원 알림(ADR-148)이 함께 쓴다 — 같은 자료를 창마다 다르게 부르지 않게.
 *
 * 이름은 사이드바·탭에 실제로 보이는 말을 따른다(예: 학생 기록 화면은 "담임 메모장", 담임 업무 탭은
 * "출결"·"자리배치"·"명렬 관리"·"과제 수합"). 새 자료를 동기화에 더하면 여기에도 한 줄 더한다.
 */
export const DATA_FILE_LABELS: Readonly<Record<string, string>> = {
  settings: '설정',
  'class-schedule': '학급 시간표',
  'teacher-schedule': '교사 시간표',
  'timetable-overrides': '시간표 변경',
  students: '학생 명렬표',
  seating: '자리배치',
  events: '일정',
  memos: '메모',
  todos: '할 일',
  'student-records': '담임 메모장',
  bookmarks: '즐겨찾기',
  surveys: '설문/체크리스트',
  'seat-constraints': '좌석 배치 조건',
  'teaching-classes': '수업반',
  dday: 'D-Day',
  'curriculum-progress': '진도',
  attendance: '출결',
  consultations: '상담 예약',
  observations: '관찰 기록',
  assignments: '과제 수합',
  'record-drafts': '생기부 초안',
  'record-evidence': '근거 정리',
  // 노트 (note-cloud-sync PDCA). 동적 키(note-body--{pageId})는 표에 없다 — 부르는 쪽이 대신 이름을 정한다.
  'note-notebooks': '노트북 목록',
  'note-sections': '노트 섹션',
  'note-pages-meta': '노트 페이지 목록',
};

/** 표에 있는 이름. 없으면 null — 부르는 쪽이 대신 쓸 말을 정한다. */
export function dataFileLabel(file: string): string | null {
  return DATA_FILE_LABELS[file] ?? null;
}
