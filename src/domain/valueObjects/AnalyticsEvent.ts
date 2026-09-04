/** 추적 가능한 이벤트 이름 */
export type AnalyticsEventName =
  | 'app_open'
  | 'app_close'
  | 'page_view'
  | 'widget_open'
  | 'widget_close'
  | 'timetable_edit'
  | 'seating_shuffle'
  | 'seating_drag'
  | 'event_create'
  | 'event_move_drag'
  | 'memo_create'
  | 'todo_toggle'
  | 'tool_use'
  | 'export'
  | 'share_import'
  | 'chatbot_open'
  | 'chatbot_message'
  | 'update_installed'
  | 'onboarding_complete'
  | 'school_set'
  | 'class_set'
  | 'error'
  | 'feature_discovery'
  | 'session_start'
  | 'assignment_create'
  | 'assignment_share'
  | 'assignment_view'
  | 'consultation_create'
  | 'consultation_update'
  | 'bookmark_add'
  | 'bookmark_click'
  | 'feedback_submit'
  | 'settings_change'
  | 'timetable_neis_sync'
  | 'widget_layout_change'
  | 'onboarding_roles_selected'
  | 'onboarding_widget_preset'
  | 'chatbot_feedback'
  | 'chatbot_escalate'
  | 'share_modal_open'
  | 'share_click'
  | 'share_prompt_shown'
  | 'share_prompt_action'
  | 'release_notes_notion_link_clicked'
  | 'widget_mode_indicator_click'
  | 'widget_mode_changed'
  | 'widget_mode_fallback_shown'
  | 'widget_mode_coach_tour_shown'
  | 'widget_mode_coach_tour_completed'
  | 'widget_mode_coach_tour_skipped'
  | 'icon_mode_enter'
  | 'icon_mode_expand'
  | 'icon_popover_open'
  | 'icon_popover_quick_add'
  | 'icon_popover_todo_toggle'
  // ── 쌤핀 AI (2026-09-01 추가) ──
  // 그 전까지 쌤핀 AI 는 앱 통계에 **한 건도 남지 않았다.** 사용량을 세려면 서버의
  // 남용 방지 테이블을 뒤져야 했는데, 그건 통계용이 아니라 언제 지워도 되는 자료다.
  | 'assist_open'
  | 'assist_message'
  | 'assist_degraded'
  // ── 동기화 (2026-09-01 추가) ──
  // 지난 두 릴리즈가 모두 동기화 교착 수정이었는데, 재발을 숫자로 볼 방법이 없었다.
  | 'sync_run'
  // ── 옆핀 (2026-09-01 추가) ──
  | 'sidepin_open'
  | 'sidepin_action'
  // ── 온라인 교무실 (2026-09-01 추가) ──
  | 'staffroom_post_create'
  // ── 모바일 웹 (2026-09-01 추가) ──
  // ★이름을 `mobile_` 로 시작하게 둔 이유: 데스크톱 지표(활성 사용자·재방문)와 섞이면
  //   지금까지 쌓은 추세선이 끊긴다. 롤업에서 이 접두사를 걸러 데스크톱 숫자를 지킨다.
  | 'mobile_app_open'
  | 'mobile_page_view'
  | 'mobile_action'
  // ── 생기부 흐름 (2026-09-04 추가) ──
  // 관찰 입력·근거 창고·초안 화면에는 계측이 **한 건도 없었다.** "꾸준히 누적되고 있는가"에
  // 아무도 숫자로 답할 수 없었고, 그러면 고도화 순서를 정할 근거도 없다. 값이 아니라 이름만 담는다.
  | 'record_observation_save'
  | 'record_evidence_open'
  | 'record_evidence_import'
  | 'record_draft_save';

/** tool_use 이벤트의 tool 프로퍼티에 사용 가능한 도구명 */
export type ToolName =
  | 'timer'
  | 'random_picker'
  | 'roulette'
  | 'scoreboard'
  | 'traffic_light'
  | 'dice'
  | 'coin'
  | 'qr'
  | 'activity_symbol'
  | 'vote'
  | 'survey'
  | 'wordcloud'
  | 'seat_picker'
  | 'assignment'
  | 'class_seating'
  | 'grouping'
  | 'multi-survey'
  | 'valueline-discussion'
  | 'trafficlight-discussion'
  | 'realtime-wall'
  | 'score-allocator'
  // ── 2026-09-01 추가: 화면은 있는데 "도구 사용"으로 세지 않던 것들 ──
  // 이 8개가 빠져 있어서 관리자 화면의 도구 순위가 실제 순위가 아니었다.
  | 'chalkboard'
  | 'sticker'
  | 'collab-board'
  | 'classroom-agreement'
  | 'signature-roster'
  | 'markdown-convert'
  | 'school-announcements'
  | 'forms'
  // ── 2026-09-01 추가: 바깥 사이트·프로그램으로 나가는 도구 ──
  // 화면 이동이 없어 방문 기록조차 안 남았다. 눌린 순간을 세지 않으면 영영 0 이다.
  | 'supsori'
  | 'pblsketch'
  | 'dorms'
  | 'dorms-arcade'
  | 'oneclick-portal'
  | 'edudraft'
  | 'pdf-lab';

/** 이벤트별 properties 타입 매핑 */
export interface AnalyticsEventProperties {
  app_open: { launchMode: 'normal' | 'widget' };
  app_close: { sessionDuration: number };
  page_view: { page: string };
  widget_open: { trigger: 'close_button' | 'tray' };
  widget_close: Record<string, never>;
  timetable_edit: { action: 'add' | 'edit' | 'delete' };
  seating_shuffle: { studentCount: number };
  seating_drag: Record<string, never>;
  event_create: { category: string };
  event_move_drag: { category: string };
  memo_create: Record<string, never>;
  todo_toggle: { completed: boolean };
  tool_use: { tool: ToolName };
  export: { format: 'excel' | 'hwpx' | 'pdf' | 'ssampin' };
  share_import: Record<string, never>;
  chatbot_open: Record<string, never>;
  chatbot_message: Record<string, never>;
  update_installed: { from: string; to: string };
  onboarding_complete: { step: number };
  school_set: { school: string; level: string; region: string };
  class_set: { grade: number; classNum: number; studentCount: number };
  error: { message: string; component: string; stack?: string };
  feature_discovery: { feature: string; source: 'menu' | 'shortcut' | 'tooltip' | 'search' };
  session_start: { isReturning: boolean; launchCount: number };
  assignment_create: { title: string };
  assignment_share: { method: 'qr' | 'link' | 'copy' };
  assignment_view: { assignmentId: string };
  consultation_create: { type: string };
  consultation_update: { action: 'edit' | 'delete' | 'status_change' };
  bookmark_add: { url: string };
  bookmark_click: { url: string; type?: string };
  feedback_submit: Record<string, never>;
  /**
   * 설정 저장.
   *
   * ★`keys` 는 **실제로 값이 달라진 항목 이름들**이다(2026-09-01 추가).
   * 그 전에는 `key` 가 항상 'save' 라서 "어느 탭을 저장했다"만 남고 **무엇을 켰는지는
   * 알 수 없었다.** 그래서 실험실 기능(쌤핀 AI·교무실)을 몇 명이 켰는지 못 셌다.
   * 값이 아니라 **항목 이름만** 담는다 — 학교명·반 이름 같은 내용은 넣지 않는다.
   */
  settings_change: { section: string; key: string; keys?: string[] };
  timetable_neis_sync: { success: boolean };
  widget_layout_change: { from: string; to: string };
  onboarding_roles_selected: { roles: string[]; hiddenMenuCount: number; visibleMenuCount: number };
  onboarding_widget_preset: { presetKey: string; roles: string[] };
  chatbot_feedback: {
    result: 'resolved' | 'unresolved' | 'no_response' | 'implicit_positive';
    topic?: string;
    elapsed_ms?: number;
    sessionId?: string;
  };
  chatbot_escalate: { questionText: string; sessionId?: string };
  share_modal_open: { trigger: 'manual' | 'prompt' };
  share_click: { method: 'kakao' | 'clipboard' | 'qr' };
  share_prompt_shown: Record<string, never>;
  share_prompt_action: { action: 'share' | 'later' | 'never' };
  release_notes_notion_link_clicked: { version: string; title: string };
  /** 위젯 헤더의 모드 인디케이터 칩 클릭 (팝오버 열기) */
  widget_mode_indicator_click: { currentMode: string; fallback: boolean };
  /** 사용자가 모드를 변경 — via는 변경 진입 경로 */
  widget_mode_changed: {
    from: string;
    to: string;
    via: 'coach-tour' | 'header-chip' | 'context-menu' | 'settings';
  };
  /** native-desktop fallback 알림 표시 */
  widget_mode_fallback_shown: { reason: string; fallbackMode: string };
  /** 모드 코치 투어 노출 */
  widget_mode_coach_tour_shown: { firstRun: boolean };
  widget_mode_coach_tour_completed: {
    trySelected: 'normal' | 'topmost' | 'native-desktop' | 'none';
  };
  widget_mode_coach_tour_skipped: { slideIndex: number };
  /** 아이콘 모드 진입 — 창 전환 완료 시 (v2.2.7) */
  icon_mode_enter: Record<string, never>;
  /** 아이콘 모드에서 다른 창으로 확장 — via는 진입 경로 */
  icon_mode_expand: {
    to: 'main' | 'widget' | 'restore';
    via: 'double-click' | 'context-menu' | 'popover';
  };
  /** 핀 클릭으로 오늘 요약 팝오버 열림 */
  icon_popover_open: Record<string, never>;
  /** 팝오버에서 할 일 빠른 추가 */
  icon_popover_quick_add: Record<string, never>;
  /** 팝오버에서 할 일 완료 토글 */
  icon_popover_todo_toggle: Record<string, never>;

  // ── 쌤핀 AI ──
  /** 쌤핀 AI 대화창을 열었다 */
  assist_open: Record<string, never>;
  /**
   * 질문을 보냈다.
   *
   * ★질문 내용은 **절대 담지 않는다.** 학생 이름이 들어 있을 수 있고, 쌤핀 AI 의 설계
   * 자체가 "이름은 화면에 남고 숫자만 밖으로"이다. 여기서 그 원칙을 깨면 안 된다.
   */
  assist_message: {
    /** 이 질문에 로컬 조회 카드가 붙었는지 — 붙지 않으면 AI 가 맨몸으로 답한다 */
    hasCards: boolean;
    /** 이 대화에서 몇 번째 질문인지 (1부터) */
    turnIndex: number;
  };
  /**
   * 답이 축소되어 돌아왔다 — 예산 소진·혼잡·서버 미설정·상류 오류, 또는 앱이 막은 경우.
   * 이게 없으면 "AI 를 켜 놨는데 안 되더라"를 신고로만 알게 된다.
   */
  assist_degraded: {
    reason:
      | 'budget'
      | 'busy'
      | 'unavailable'
      | 'upstream'
      | 'offline'
      | 'timeout'
      | 'unreachable'
      /** 앱이 보내기 전에 막았다 — 개인정보가 섞인 질문 */
      | 'blocked'
      /** "내 AI"(선생님 구독 CLI)로 못 답해서 쌤핀 AI 가 대신 답했다 */
      | 'own-ai-fallback';
  };

  // ── 동기화 ──
  /**
   * 동기화 1회의 결과.
   *
   * ★실패 사유는 **분류된 이름**만 담는다. 원문 오류 메시지에는 파일명·계정이 섞여 들어온다.
   */
  sync_run: {
    direction: 'upload' | 'download' | 'settings' | 'rebuild';
    outcome: 'success' | 'conflict' | 'error';
    /** outcome === 'error' 일 때만. 'scope' | 'network' | 'timeout' | 'quota' | 'unknown' */
    reason?: string;
    /** 걸린 시간(초). 교착을 숫자로 보려면 성공·실패 둘 다 필요하다 */
    durationSec: number;
    /** 이번 회차에 오간 파일 수 */
    fileCount?: number;
  };

  // ── 옆핀 ──
  /** 옆핀 창이 떴다 */
  sidepin_open: Record<string, never>;
  /**
   * 옆핀 안에서 한 동작.
   *
   * 지금은 두 가지만 센다 — 옆핀이 "펴 보기만 하는 것"인지 "실제로 쓰는 것"인지를
   * 가르는 최소한의 구분이다. 개인정보 보호(PIN 잠금·즉시 숨김)는 아직 작업 중이라
   * 그쪽 동작은 기능이 끝난 뒤에 붙인다.
   */
  sidepin_action: { action: 'memo_write' | 'widget_open' };

  /**
   * 온라인 교무실에 글을 올렸다.
   *
   * ★"교무실을 열었다"는 따로 세지 않는다 — `page_view`(page: 'staffroom') 가 이미 센다.
   *   같은 것을 두 이름으로 세면 나중에 어느 쪽이 맞는지 다투게 된다.
   */
  staffroom_post_create: { hasAttachment: boolean };

  // ── 모바일 웹 ──
  mobile_app_open: { isReturning: boolean };
  mobile_page_view: { page: string };
  mobile_action: { action: string };

  // ── 생기부 흐름 ──
  /**
   * 관찰 낱장을 저장했다(교과 관찰·담임 누가기록 공통).
   * ★본문·학생·태그 값은 담지 않는다. 슬롯은 **개수만** — "슬롯이 실제로 붙는가"가 알고 싶은 것이다.
   */
  record_observation_save: {
    context: 'teaching' | 'homeroom';
    slotCount: number;
    /** 탐구 흐름에 붙여 저장했는가 */
    hasThread: boolean;
  };
  /** 근거 창고를 열었다(초안 화면의 '근거 자료' 서브페이지). */
  record_evidence_open: { context: 'teaching' | 'homeroom' };
  /** 근거를 창고에 넣었다 — 직접 입력이든 끌어오기든. 출처 종류와 건수만. */
  record_evidence_import: { sourceType: string; count: number };
  /**
   * 초안을 저장했다. 누가 썼는지(교사 직접 / 브릿지 / 쌤핀 AI)와 경고 유무만.
   * ★본문은 절대 담지 않는다 — 법정기록 서술이다.
   */
  record_draft_save: { area: string; origin: 'teacher' | 'bridge' | 'assist'; hasFlags: boolean };
}
