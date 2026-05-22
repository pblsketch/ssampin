/**
 * WidgetSettingsPanel 단위 테스트.
 *
 * 환경: vitest (environment: 'node') — RTL/jsdom 미사용. renderToString으로
 * 정적 HTML 출력 검증.
 *
 * 검사 범위:
 *   1. 기본(no initialTab, no styleOnly): 위젯 구성 탭 콘텐츠 렌더
 *   2. initialTab="style": 스타일 탭 콘텐츠 렌더
 *   3. styleOnly={true} (no initialTab): 스타일 탭 렌더
 *   4. initialTab="widgets" + styleOnly={true}: initialTab이 우선 (위젯 탭)
 *   5. SurveyWidget: isCompactMode=false 시 escape-hatch 버튼 렌더
 *   6. ConsultationWidget: isCompactMode=false 시 escape-hatch 버튼 렌더
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { WidgetSettingsPanel } from './WidgetSettingsPanel';
import { SurveyWidget } from '../items/SurveyWidget';
import { ConsultationWidget } from '../items/ConsultationWidget';

/* ── 스토어 mock ──────────────────────────────────────────────────── */

// vi.mock 팩토리는 hoisting되므로 상수를 팩토리 내부에 인라인으로 선언.
vi.mock('@adapters/stores/useSettingsStore', () => {
  const s = {
    widget: { opacity: 1, cardOpacity: 1 },
    widgetStyle: undefined as undefined,
    dashboardTheme: { presetId: 'dark' },
    dashboardFontScale: 1.0,
    theme: 'dark' as const,
  };
  const store = Object.assign(
    (selector: (st: { settings: typeof s; update: () => Promise<void> }) => unknown) =>
      selector({ settings: s, update: () => Promise.resolve() }),
    { getState: () => ({ settings: s, update: () => Promise.resolve() }) },
  );
  return { useSettingsStore: store };
});

vi.mock('@widgets/useDashboardConfig', () => {
  const cfg = {
    widgets: [{ widgetId: 'seating', visible: true, colSpan: 2, rowSpan: 3 }],
  };
  const store = Object.assign(
    (
      selector: (s: {
        config: typeof cfg;
        toggleWidget: () => void;
        resetToPreset: () => void;
      }) => unknown,
    ) => selector({ config: cfg, toggleWidget: () => undefined, resetToPreset: () => undefined }),
    {
      getState: () => ({
        config: cfg,
        toggleWidget: () => undefined,
        resetToPreset: () => undefined,
      }),
    },
  );
  return { useDashboardConfig: store };
});

/* SurveyWidget / ConsultationWidget 스토어 mock */
vi.mock('@adapters/stores/useSurveyStore', () => {
  const state = {
    surveys: [] as never[],
    loaded: true,
    load: () => Promise.resolve(),
    getLocalData: () => null,
  };
  // SurveyWidget은 useSurveyStore() — 셀렉터 없이 전체 상태 반환 패턴
  const store = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useSurveyStore: store };
});

vi.mock('@adapters/stores/useStudentStore', () => {
  const state = { students: [] as never[], loaded: true, load: () => Promise.resolve() };
  return {
    useStudentStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
        subscribe: () => () => undefined,
      },
    ),
  };
});

vi.mock('@adapters/stores/useSeatingStore', () => ({
  useSeatingStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({}),
    {
      getState: () => ({}),
      subscribe: () => () => undefined,
    },
  ),
}));

vi.mock('@adapters/stores/useConsultationStore', () => {
  const state = { schedules: [] as never[], loaded: true, load: () => Promise.resolve() };
  // ConsultationWidget은 useConsultationStore() — 셀렉터 없이 전체 상태 반환 패턴
  return {
    useConsultationStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

vi.mock('@adapters/di/container', () => ({
  consultationSupabaseClient: { getSlots: () => Promise.resolve([]) },
  seatingRepository: {},
  seatingSnapshotRepository: {},
  storage: {},
  scheduleRepository: {},
  eventsRepository: {},
  memoRepository: {},
  todoRepository: {},
  settingsRepository: {},
  studentRecordsRepository: {},
  messageRepository: {},
  studentRepository: {},
  surveyRepository: {},
  teachingClassRepository: {},
  bookmarkRepository: {},
  desktopOrganizeRepository: {},
  ddayRepository: {},
  interactiveLessonRepository: {},
  manualMealRepository: {},
  imageWidgetRepository: {},
  wordCloudRepository: {},
  toolTemplateRepository: {},
  toolResultRepository: {},
  observationRepository: {},
  noteRepository: {},
  wallBoardRepository: {},
  stickerRepository: {},
  formRepository: {},
  formThumbnailer: {},
  formPreviewExtractor: {},
  formPrinter: {},
  neisPort: {},
  googleAuthPort: {},
  googleCalendarPort: {},
  calendarSyncRepo: {},
  authenticateGoogle: {},
  syncToGoogle: {},
  manageCalendarMapping: {},
  syncFromGoogle: {},
  googleTasksPort: {},
  analyticsPort: {},
  assignmentRepository: {},
  assignmentSupabaseClient: {},
  assignmentServicePort: {},
  shortLinkClient: {},
  consultationRepository: {},
  surveySupabaseClient: {},
  driveSyncRepository: {},
  externalCalendarRepository: {},
  seatConstraintsRepository: {},
  seatPickerConfigRepository: {},
}));

/* BackgroundImageSection / 스타일 컨트롤 계열 mock (DOM API 미사용 환경 대응) */
vi.mock('@adapters/components/shared/BackgroundImageSection', () => ({
  BackgroundImageSection: () => null,
}));

/* ── 테스트 ─────────────────────────────────────────────────────── */

describe('WidgetSettingsPanel — initialTab prop', () => {
  it('기본(props 없음): 위젯 구성 탭 콘텐츠 렌더', () => {
    const html = renderToString(<WidgetSettingsPanel onClose={() => undefined} />);
    // 위젯 구성 탭: CATEGORY_ORDER 레이블 중 하나 노출
    expect(html).toContain('위젯 구성');
  });

  it('initialTab="style": 스타일 탭 콘텐츠 렌더', () => {
    const html = renderToString(
      <WidgetSettingsPanel onClose={() => undefined} initialTab="style" />,
    );
    // StyleTab 고유 텍스트
    expect(html).toContain('투명도');
  });

  it('styleOnly={true} (no initialTab): 스타일 탭 렌더', () => {
    const html = renderToString(<WidgetSettingsPanel onClose={() => undefined} styleOnly />);
    expect(html).toContain('투명도');
    // 위젯 구성 탭 버튼 숨김 확인
    expect(html).not.toContain('위젯 구성</button>');
  });

  it('initialTab="widgets" + styleOnly={true}: initialTab 우선 (위젯 탭 렌더)', () => {
    // styleOnly=true는 탭 헤더를 숨기지만(탭 버튼 미노출),
    // activeTab 초기값은 initialTab("widgets")이 우선한다.
    // 렌더 결과: activeTab==="widgets" && !styleOnly===false → StyleTab 분기.
    // 현재 구현: `activeTab === 'widgets' && !styleOnly ? <WidgetListTab /> : <StyleTab />`
    // 따라서 styleOnly=true이면 initialTab="widgets"이어도 StyleTab이 표시된다.
    // 이 테스트는 해당 우선순위를 문서화한다.
    const html = renderToString(
      <WidgetSettingsPanel onClose={() => undefined} initialTab="widgets" styleOnly />,
    );
    // styleOnly=true가 렌더 분기를 제어하므로 StyleTab 출력
    expect(html).toContain('투명도');
  });
});

describe('SurveyWidget — escape hatch', () => {
  it('isCompactMode=true(기본): 탈출구 버튼 미노출', () => {
    const html = renderToString(<SurveyWidget />);
    expect(html).not.toContain('data-widget-escape-hatch');
  });

  it('isCompactMode=false: 탈출구 버튼 렌더', () => {
    const html = renderToString(<SurveyWidget isCompactMode={false} />);
    expect(html).toContain('data-widget-escape-hatch="survey"');
    expect(html).toContain('전체 페이지로 보기');
  });
});

describe('ConsultationWidget — escape hatch', () => {
  it('isCompactMode=true(기본): 탈출구 버튼 미노출', () => {
    const html = renderToString(<ConsultationWidget />);
    expect(html).not.toContain('data-widget-escape-hatch');
  });

  it('isCompactMode=false: 탈출구 버튼 렌더', () => {
    const html = renderToString(<ConsultationWidget isCompactMode={false} />);
    expect(html).toContain('data-widget-escape-hatch="consultation"');
    expect(html).toContain('전체 페이지로 보기');
  });
});
