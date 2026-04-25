import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { PinSettings } from './PinSettings';
import type { NeisScheduleSettings } from './NeisSchedule';
import type { PresetThemeId, ThemeColors } from './DashboardTheme';
import type { SubjectColorMap } from '../valueObjects/SubjectColor';
import type { TodoSettings } from './TodoSettings';

export interface DashboardThemeSettings {
  readonly presetId: PresetThemeId | 'custom';
  readonly customColors?: ThemeColors;
}

export type SchoolLevel = 'elementary' | 'middle' | 'high' | 'custom';

export type FontFamily =
  | 'noto-sans'
  | 'pretendard'
  | 'ibm-plex'
  | 'nanum-gothic'
  | 'nanum-square'
  | 'gowun-dodum'
  | 'suit'
  | 'wanted-sans'
  | 'paperlogy'
  | 'kakao-big'
  | 'spoqa-han-sans'
  | 'custom';

/** 사용자 커스텀 폰트 설정 */
export interface CustomFontSettings {
  /** 폰트 표시 이름 (예: "나의 손글씨") */
  readonly name: string;
  /** 폰트 파일의 data URL (base64) */
  readonly dataUrl: string;
  /** 원본 파일명 */
  readonly fileName: string;
  /** MIME 타입 */
  readonly mimeType: string;
  /** CSS font-family 이름 */
  readonly cssFamilyName: string;
}

export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg';

export interface WidgetStyleSettings {
  /** 카드 테두리 라운드 (0~24px, 기본 12) */
  readonly borderRadius: number;
  /** 카드 배경 오버라이드 (null → 테마 기본) */
  readonly cardColor: string | null;
  /** 대시보드 배경 오버라이드 (null → 테마 기본) */
  readonly bgColor: string | null;
  /** 강조 색상 오버라이드 (null → 테마 기본) */
  readonly accentColor: string | null;
  /** 텍스트 색상 오버라이드 (null → 테마 기본) */
  readonly textColor: string | null;
  /** 카드 간 gap (4~32px, 기본 16) */
  readonly cardGap: number;
  /** 카드 테두리 표시 여부 */
  readonly showBorder: boolean;
  /** 카드 테두리 두께 (0~4px, 기본 1). showBorder가 true일 때 적용 */
  readonly borderWidth: number;
  /** 카드 테두리 색상 오버라이드 (null → 테마 기본 --sp-border) */
  readonly borderColor: string | null;
  /** 그림자 레벨 */
  readonly shadow: ShadowLevel;
  /** 배경 이미지 (프리셋 ID 또는 로컬 file:// 경로, null → 없음) */
  readonly backgroundImage: string | null;
  /** 배경 이미지 불투명도 (0.05~1, 기본 0.15) */
  readonly backgroundImageOpacity: number;
  /** 폰트 */
  readonly fontFamily: FontFamily;
  /** 그리드 행 높이 (40~100px, 기본 80) */
  readonly gridRowHeight: number;
}

export type AlarmSoundId = 'beep' | 'school-bell' | 'alarm-clock' | 'gentle-chime' | 'buzzer' | 'custom';

export type PreWarningSoundId = 'gentle-chime' | 'soft-bell' | 'tick-tock';

export interface PreWarningSettings {
  readonly enabled: boolean;
  readonly secondsBefore: number;
  readonly sound: PreWarningSoundId;
}

export interface WorkSymbolItem {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  readonly description: string;
  readonly bgGradient: string;
}

export interface WorkSymbolsSettings {
  readonly symbols: readonly WorkSymbolItem[];
}

export interface AlarmSoundSettings {
  readonly selectedSound: AlarmSoundId;
  readonly customAudioName: string | null;
  readonly volume: number; // 0.0 ~ 1.0
  readonly boost: number;  // 1 | 2 | 3 | 4 — 볼륨 증폭 배수
  readonly preWarning: PreWarningSettings;
}

export type WidgetLayoutMode = 'full' | 'split-h' | 'split-v' | 'quad';

// 위젯 표시 모드
// - 'normal': 일반 모드 — 다른 창에 가려질 수 있음, Win+D에 사라지지 않음
// - 'topmost': 항상 위에 — 항상 다른 창 위에 표시, Win+D에 사라지지 않음
export type WidgetDesktopMode = 'normal' | 'topmost';

export interface WidgetVisibleSections {
  readonly dateTime: boolean;
  readonly weather: boolean;
  readonly message: boolean;
  readonly teacherTimetable: boolean;
  readonly classTimetable: boolean;
  readonly events: boolean;
  readonly periodBar: boolean;
  readonly todayClass: boolean;
  readonly seating: boolean;
  readonly studentRecords: boolean;
  readonly meal: boolean;
  readonly memo: boolean;
  readonly todo: boolean;
}

export interface WidgetSettings {
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly cardOpacity: number;
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean;        // keep for backward compat
  readonly closeAction?: 'widget' | 'tray' | 'ask';  // ADD THIS LINE
  readonly visibleSections: WidgetVisibleSections;
  readonly layoutMode: WidgetLayoutMode;
  readonly desktopMode: WidgetDesktopMode;
  /** 위젯 헤더에 날씨 정보 표시 여부 (기본 true) */
  readonly showWeather?: boolean;
  /**
   * 메모리 절약 모드 (기본 false).
   * true일 때, 위젯 모드로 전환 시 메인 창을 숨기지 않고 완전히 destroy 하여
   * 렌더러 프로세스를 1개로 줄인다. 메인 복귀 시 재생성하며 첫 로드가 약간 느려질 수 있다.
   */
  readonly memorySaverMode?: boolean;
}

export interface SystemSettings {
  readonly autoLaunch: boolean;
  readonly notificationSound: boolean;
  readonly doNotDisturbStart: string; // "HH:mm"
  readonly doNotDisturbEnd: string;   // "HH:mm"
}

export interface NeisAutoSyncSettings {
  readonly enabled: boolean;
  readonly grade: string;
  readonly className: string;
  readonly lastSyncDate: string;
  readonly lastSyncWeek: string;
  readonly syncTarget: 'class' | 'both';
}

export interface NeisSettings {
  readonly schoolCode: string;      // SD_SCHUL_CODE
  readonly atptCode: string;        // ATPT_OFCDC_SC_CODE
  readonly schoolName: string;      // 선택된 학교명
  readonly autoSync?: NeisAutoSyncSettings;
}

export interface WeatherLocation {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;            // 표시용 지역명 (예: "서울 강남구")
}

export interface WeatherSettings {
  readonly location: WeatherLocation | null;
  readonly refreshIntervalMin: number;  // 갱신 주기 (분)
}

export interface FeedbackConfig {
  readonly formUrl: string;  // Google Forms URL (비어있으면 클립보드 폴백)
  readonly email: string;
}

export interface SyncSettings {
  readonly enabled: boolean;
  readonly autoSyncOnStart: boolean;
  readonly autoSyncOnSave: boolean;
  readonly autoSyncIntervalMin: number; // 0=비활성
  readonly conflictPolicy: 'latest' | 'ask';
  readonly lastSyncedAt: string | null;
  readonly deviceId: string;
}

/** 글로벌 퀵애드 단축키 ID */
export type QuickAddShortcutId =
  | 'quickAdd.todo'
  | 'quickAdd.event'
  | 'quickAdd.memo'
  | 'quickAdd.note'
  | 'quickAdd.bookmark';

export interface ShortcutBinding {
  /** 정규화 조합 문자열, 예: "mod+alt+t" */
  readonly combo: string;
  /** 사용자가 개별 단축키 비활성화한 경우 false */
  readonly enabled: boolean;
}

export interface ShortcutSettings {
  /** 커맨드 ID → 키 조합 매핑 */
  readonly bindings: Record<string, ShortcutBinding>;
  /** OS 전역 단축키(Electron globalShortcut) 활성화 여부. 기본 false */
  readonly globalEnabled: boolean;
}

export interface MealSchoolSettings {
  readonly schoolCode: string;      // 급식 조회용 SD_SCHUL_CODE (비어있으면 neis.schoolCode 사용)
  readonly atptCode: string;        // 급식 조회용 ATPT_OFCDC_SC_CODE
  readonly schoolName: string;      // 표시용 학교명
}

export interface Settings {
  readonly schoolName: string;
  readonly grade?: string;
  readonly className: string;
  readonly teacherName: string;
  readonly subject: string;
  readonly schoolLevel: SchoolLevel;
  /** 직접 설정 시 수업 시간(분). schoolLevel이 'custom'일 때 사용 */
  readonly customPeriodDuration?: number;
  readonly maxPeriods: number;
  readonly periodTimes: readonly PeriodTime[];
  readonly seatingRows: number;
  readonly seatingCols: number;
  readonly widget: WidgetSettings;
  readonly system: SystemSettings;
  readonly theme: 'light' | 'dark' | 'system';
  readonly fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  readonly fontFamily?: FontFamily;
  readonly neis: NeisSettings;
  readonly pin: PinSettings;
  readonly alarmSound: AlarmSoundSettings;
  readonly workSymbols: WorkSymbolsSettings;
  readonly weather: WeatherSettings;
  readonly analytics?: {
    readonly enabled: boolean;
  };
  readonly menuOrder?: readonly string[];
  readonly hiddenMenus?: readonly string[];
  readonly feedback?: FeedbackConfig;
  readonly neisSchedule?: NeisScheduleSettings;
  readonly dashboardTheme?: DashboardThemeSettings;
  /** 위젯 스타일 커스터마이징 */
  readonly widgetStyle?: WidgetStyleSettings;
  readonly subjectColors?: SubjectColorMap;
  /** 시간표 셀 색상 기준: 'subject'(과목별) | 'classroom'(학반별) */
  readonly timetableColorBy?: 'subject' | 'classroom';
  /** 학반별 색상 매핑 (classroom → SubjectColorId) */
  readonly classroomColors?: SubjectColorMap;
  /** 좌석배치 기본 시점: 'student' | 'teacher' */
  readonly seatingDefaultView?: 'student' | 'teacher';
  /** 좌석배치 학생 이름 글자 크기 (기본 'sm') */
  readonly seatingNameSize?: 'sm' | 'md' | 'lg' | 'xl';
  /** 시간표 기본 탭: 'class'(학급) | 'teacher'(교사). 미설정 시 schoolLevel로 스마트 디폴트 */
  readonly timetableDefaultView?: 'class' | 'teacher';
  /** Google Drive 동기화 설정 */
  readonly sync?: SyncSettings;
  /** 행사 알림 팝업 활성화 여부 (기본: true) */
  readonly eventAlertEnabled?: boolean;
  /** AI 도우미 챗봇 표시 여부 (기본: true) */
  readonly showChatbot?: boolean;
  /** 온보딩에서 선택한 교사 역할 (복수) */
  readonly teacherRoles?: readonly ('homeroom' | 'subject' | 'admin')[];
  /** 자주 쓰는 쌤도구 ID 목록 (대시보드/위젯에 표시) */
  readonly favoriteTools?: readonly string[];
  /** 쌤도구 페이지 사용자 정렬 순서 (도구 ID 배열). 미설정 시 기본 순서 */
  readonly toolsOrder?: readonly string[];
  /** 쌤도구 페이지에서 숨길 도구 ID 목록. 빈 배열/미설정 = 모두 표시 */
  readonly hiddenTools?: readonly string[];
  /** 즐겨찾기 위젯에서 숨길 북마크 그룹 ID 목록 */
  readonly bookmarkWidgetHiddenGroups?: readonly string[];
  /** 즐겨찾기 위젯에서 숨길 개별 북마크 ID 목록 */
  readonly bookmarkWidgetHiddenBookmarks?: readonly string[];
  /** 즐겨찾기 위젯의 "잊고 있던 사이트" 섹션 숨김 여부 (기본 false) */
  readonly bookmarkWidgetHideForgotten?: boolean;
  /** 급식 조회용 별도 학교 설정 (통합학교 대응, 미설정 시 neis 학교 사용) */
  readonly mealSchool?: MealSchoolSettings;
  /** 할 일 타임라인: 시간표 수업 표시 */
  readonly todoShowTimetable?: boolean;
  /** 할 일 타임라인: 일정 표시 */
  readonly todoShowEvents?: boolean;
  /** 대시보드 글씨 크기 배율 (기본 1.0, 범위 0.8~1.5) */
  readonly dashboardFontScale?: number;
  /** 점심시간 시작 (HH:mm). 미설정 시 학교급 기본값 사용 */
  readonly lunchStart?: string;
  /** 점심시간 종료 (HH:mm). 미설정 시 학교급 기본값 사용 */
  readonly lunchEnd?: string;
  /** 학생 생일을 일정에 자동 등록 (기본 false) */
  readonly syncBirthdaysToSchedule?: boolean;
  /** 대시보드 일정 위젯 표시 기간 (일 단위, 기본 14) */
  readonly eventWidgetRangeDays?: number;
  /** 대시보드 일정 위젯에서 구글 캘린더 배지 표시 여부 (기본: true) */
  readonly eventWidgetShowGoogleBadge?: boolean;
  /** 대시보드 일정 위젯에서 카테고리 라벨 표시 여부 (기본: true) */
  readonly eventWidgetShowCategoryLabel?: boolean;
  /** 주말 수업 요일 — 시간표에 토/일 컬럼 추가 (예: ['토'] 또는 ['토','일']) */
  readonly enableWeekendDays?: readonly ('토' | '일')[];
  /** 사용자 커스텀 폰트 */
  readonly customFont?: CustomFontSettings;
  /** 할 일 모드 설정 (프로 모드) */
  readonly todoSettings?: TodoSettings;
  /** 요일 시작 요일: 'monday'(월~일) | 'sunday'(일~토). 기본 'sunday' */
  readonly weekdayStart?: 'monday' | 'sunday';
  /** 사이드바 접힘 상태 (기본: false = 펼침) */
  readonly sidebarCollapsed?: boolean;
  /** 글로벌 퀵애드 단축키 설정 */
  readonly shortcuts?: ShortcutSettings;
}
