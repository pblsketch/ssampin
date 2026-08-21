import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { PinSettings } from './PinSettings';
import type { NeisScheduleSettings } from './NeisSchedule';
import type { PresetThemeId, ThemeColors } from './DashboardTheme';
import type { SubjectColorMap } from '../valueObjects/SubjectColor';
import type { TodoSettings } from './TodoSettings';
import type { MiniApp } from './MiniApp';
import type { ReminderSettings } from './RecordReminder';

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
  /**
   * 위젯 창 외곽 테두리 숨김 (false → 표시, true → 숨김)
   * NOTE: 추후 `showBorder`(카드 테두리)와 명명 통일 대상 — show-flavor로 일괄 리팩터링 예정
   */
  readonly hideWindowBorder: boolean;
}

export type AlarmSoundId =
  | 'beep'
  | 'school-bell'
  | 'alarm-clock'
  | 'gentle-chime'
  | 'buzzer'
  | 'custom';

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
  readonly boost: number; // 1 | 2 | 3 | 4 — 볼륨 증폭 배수
  readonly preWarning: PreWarningSettings;
}

export type WidgetLayoutMode = 'full' | 'split-h' | 'split-v' | 'quad' | 'sidebar-right';

// 위젯 표시 모드
// - 'normal': 일반 모드 — 다른 창에 가려질 수 있음, Win+D에 사라지지 않음
// - 'topmost': 항상 위에 — 항상 다른 창 위에 표시, Win+D에 사라지지 않음
// - 'native-desktop': 바탕화면 아이콘 아래 (Windows 전용, v2.1.0~)
//   위젯을 Explorer WorkerW에 attach하여 바탕화면 아이콘이 위에서 보이도록 한다.
//   비Windows OS 또는 native module 로드 실패 시 'normal'로 fallback한다.
export type WidgetDesktopMode = 'normal' | 'topmost' | 'native-desktop';

/**
 * 임의의 입력값을 안전하게 WidgetDesktopMode로 정규화한다.
 *
 * 기존 코드 곳곳에 흩어진 `value === 'topmost' ? 'topmost' : 'normal'` 패턴이
 * v2.1.0 도입되는 `'native-desktop'` 값을 silent하게 'normal'로 버리는
 * 잠재 버그를 가지므로, 모든 정규화 지점은 이 헬퍼를 통과해야 한다.
 *
 * @param value     설정 저장값/IPC payload 등 임의 입력
 * @param platformIsWin32  현재 플랫폼이 Win32인지 여부.
 *   false(=비Windows)이면 'native-desktop'은 'normal'로 강제 다운그레이드된다.
 *   호출자가 플랫폼 분기를 직접 모르는 경우(렌더러 등) 생략 가능.
 *
 * legacy 'floating' alias → 'topmost' 매핑은 호출자 측에서 처리한다
 * (이 헬퍼는 정식 타입 값만 인정).
 */
export function normalizeDesktopMode(value: unknown, platformIsWin32?: boolean): WidgetDesktopMode {
  if (value === 'topmost') {
    return 'topmost';
  }
  if (value === 'native-desktop') {
    // 명시적으로 platformIsWin32가 false인 경우만 다운그레이드한다.
    // undefined(미지정)는 호출자가 플랫폼 분기를 신경쓰지 않는 컨텍스트(예: 렌더러)이므로
    // 값을 보존한다. 실제 적용은 main process가 거부할 수 있다.
    if (platformIsWin32 === false) {
      return 'normal';
    }
    return 'native-desktop';
  }
  return 'normal';
}

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

/**
 * 앱을 켤 때의 모습 (`WidgetSettings['startupMode']`).
 *
 * `WindowMode` 와 값이 같지만 **같은 타입은 아니다** — 전환(`WindowMode`)은 앱이
 * 살아 있는 동안의 상태고, 이쪽은 설정 파일에 적혀 저장되는 사용자의 선택이다.
 * 값을 늘리면 `electron/main.ts` 의 `STARTUP_MODES` 도 함께 늘려야 한다
 * (미러 테스트가 강제한다).
 */
export type WindowStartupMode = 'main' | 'widget' | 'sidePin' | 'icon';

export const WINDOW_STARTUP_MODES = ['main', 'widget', 'sidePin', 'icon'] as const;

/**
 * 저장된 설정에서 시작 모습을 정한다. 설정 파일을 읽는 곳이 화면(스토어)과
 * electron 두 군데라, 판단이 갈리지 않도록 규칙을 여기 한 벌만 둔다.
 *
 * 허용 목록을 손으로 나열하지 않고 `WINDOW_STARTUP_MODES` 에서 뽑는다 — 나열하면
 * 값을 늘릴 때 여기를 빠뜨려 **고른 값이 조용히 기본값으로 되돌아간다**(실제로
 * `closeAction` 의 'sidePin' 에서 그 일이 있었다).
 *
 * 승계 규칙 — `startupMode` 가 없던 시절에는 `transparent` 가 "시작 시 위젯 모드"
 * 토글이었다(이름과 하는 일이 어긋난 채로 굳은 값이다). 그래서 새 항목이 없으면
 * 그 값을 그대로 읽어 예전 사용자의 선택을 지킨다.
 */
export function resolveStartupMode(widget: unknown): WindowStartupMode {
  const w = widget as { startupMode?: unknown; transparent?: unknown } | null | undefined;
  const explicit = WINDOW_STARTUP_MODES.find((mode) => mode === w?.startupMode);
  if (explicit !== undefined) return explicit;
  return w?.transparent === true ? 'widget' : 'main';
}

export interface WidgetSettings {
  readonly width: number;
  readonly height: number;
  /**
   * @deprecated 이름과 달리 창 투명도가 아니라 **"시작 시 위젯 모드"** 토글이었다.
   * 지금은 `startupMode` 가 정본이고, 이 값은 예전 버전으로 되돌아갔을 때를 위해
   * 함께 맞춰 써 둘 뿐이다(`startupMode === 'widget'` 과 같은 뜻).
   */
  readonly transparent: boolean;
  readonly opacity: number;
  readonly cardOpacity: number;
  /**
   * 흐림 세기 (px, 기본 0 = 흐리지 않음).
   *
   * `opacity`·`cardOpacity` 와 한 벌로 쓰이는 **공용 값**이다. 위젯·옆핀·대시보드가
   * 같은 값을 쓰고, 자리별 환산은 `domain/rules/glassSurface.ts` 가 맡는다.
   *
   * optional 인 이유는 기존 사용자 설정 파일에 이 항목이 없기 때문이다. 없으면 0으로
   * 읽혀 지금과 똑같이 동작한다.
   */
  readonly blur?: number;
  /**
   * 앱 뒤에 깔 배경 (기본 `none` = 깔지 않음).
   *
   * 유리는 뒤에 비칠 것이 있어야 성립하므로, 투명도·흐림과 한 벌로 쓰인다.
   * - `none`      : 지금 그대로. 배경 레이어를 아예 만들지 않는다.
   * - `generated` : 테마 색에서 만든 배경. 이미지 파일이 없어 용량이 늘지 않고,
   *                 밝기를 앱이 정하므로 글자가 안전하다.
   * - `os`        : 윈도우 11 내장 유리(Acrylic). OS 가 바탕화면을 흐려 창 배경으로
   *                 합성해 준다. 앱이 이미지를 다룰 필요가 없다. 안 되는 환경에서는
   *                 `generated` 로 자동으로 되돌아간다.
   */
  readonly backdrop?: 'none' | 'generated' | 'os';
  /**
   * 이 투명도 값을 **대시보드에도** 적용해도 되는가 (기본 true).
   *
   * 예전에는 `opacity`·`cardOpacity` 가 위젯 창에만 적용됐다. 위젯을 반투명하게 맞춰 둔
   * 선생님이 업데이트하면, 아무것도 건드리지 않았는데 대시보드까지 갑자기 반투명해진다.
   *
   * 그래서 **업데이트 전부터 있던 설정 파일에는 false 를 넣어 준다**(useSettingsStore 의
   * 이전 처리). 그 상태에서는 위젯만 예전처럼 동작하고 대시보드는 불투명하게 남는다.
   * 사용자가 투명도나 유리 효과를 한 번이라도 직접 조절하면 true 가 되어 대시보드도 따라온다.
   *
   * 새로 설치하는 사용자는 기본 true — 값이 모두 기본값(불투명)이라 아무 차이가 없다.
   */
  readonly glassDashboardOptIn?: boolean;
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean; // keep for backward compat
  /**
   * X 버튼 동작.
   * - 'widget': 위젯 모드로 전환 (기본)
   * - 'icon': 아이콘 모드(56×56 floating)로 접기 (v2.0.2~)
   * - 'sidePin': 옆핀으로 접기 (화면 오른쪽 가장자리)
   * - 'tray': 트레이로만 숨김
   * - 'quit': 앱 완전 종료
   * - 'ask': 매번 다이얼로그
   */
  readonly closeAction?: 'widget' | 'tray' | 'ask' | 'icon' | 'quit' | 'sidePin';
  /**
   * 앱을 켤 때 어떤 모습으로 시작할지.
   *
   * - 'main':    전체 화면 (기본)
   * - 'widget':  위젯 모드
   * - 'sidePin': 옆핀 (화면 오른쪽 가장자리 손잡이)
   * - 'icon':    아이콘 모드 (화면에 떠 있는 작은 핀 캐릭터)
   *
   * optional 인 이유는 예전 설정 파일에 이 항목이 없기 때문이다. 없으면 `transparent`
   * 로 판단한다 — 그 값이 원래 "시작 시 위젯 모드" 토글이었다(`resolveStartupMode`).
   */
  readonly startupMode?: WindowStartupMode;
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
  /** 아이콘 모드 옵션 (v2.0.2~) */
  readonly icon?: IconModeOptions;
  /**
   * Phase 7-E (v2.1.0~) — 사용자가 native-desktop 모드를 처음 활성화할 때 노출되는 AV 안내
   * 토스트를 봤는지 여부. true이면 다시 노출 안 함.
   *
   * AV 차단으로 hook 설치가 실패한 경우는 별도 흐름(useDesktopModeFallback)이 처리하므로
   * 본 플래그는 "사용 전 가벼운 사전 안내" 용도로만 사용된다.
   */
  readonly nativeDesktopAvWarningShown?: boolean;
  /**
   * widget-mode-discovery (v2.1.x~) — 모드 발견성 개선 PDCA.
   *
   * 위젯 모드 첫 진입 시 모드 3종(normal/topmost/native-desktop)을 비교 설명하는
   * 1회성 코치 투어(WidgetModeCoachTour)가 표시된다. 사용자가 봤거나 Skip을 누르면
   * `shown=true`로 저장 → 다음 진입에서 자동 표시 안 함.
   *
   * 사용자가 "모드 가이드 다시 보기"를 누르면 `shown=false`로 reset되어 재진입 시 표시.
   * 옵셔널 — 기존 사용자 마이그레이션 불필요(undefined → 표시 가능).
   */
  readonly modeTour?: {
    readonly shown: boolean;
  };
}

/**
 * 아이콘 모드 옵션 (v2.0.2~).
 *
 * 풀스크린 자동 hide는 사용자 결정으로 제외됨 — 아이콘은 항상 떠 있음.
 * 사용자가 가리고 싶으면 트레이 우클릭 또는 위젯/풀앱으로 전환.
 */
export interface IconModeOptions {
  /** 첫 활성화 코치마크 노출 여부 (기본 true → 첫 진입 후 false로 갱신) */
  readonly showCoachMark: boolean;
}

/**
 * 옆핀 모드 옵션.
 *
 * 아이콘 모드 옵션과 같은 자리에 둔다 — 옆핀도 X 버튼으로 들어가는 "접어 둔 상태"의
 * 하나이고, 그 선택(`closeAction`)이 이미 여기 있기 때문이다.
 */
/*
  옆핀 전용 투명도(`opacity`·`cardOpacity`)가 여기 있었는데 없앴다.
  위젯 모드·옆핀·대시보드가 `WidgetSettings` 의 `opacity`·`cardOpacity`·`blur` 를
  **함께 쓴다** — 설정을 하나로 합치기로 했다.

  자리마다 뒤에 있는 것이 다르므로(바탕화면 위 / 창 안) 같은 값을 그대로 쓰지는 않는다.
  자리별 환산은 `domain/rules/glassSurface.ts` 가 맡는다.

  v2.3.8 이후 추가된 미출시 항목이라 저장된 사용자 값이 없다. 그래서 승계 없이 지웠다.
*/

export interface SystemSettings {
  readonly autoLaunch: boolean;
  readonly notificationSound: boolean;
  readonly doNotDisturbStart: string; // "HH:mm"
  readonly doNotDisturbEnd: string; // "HH:mm"
}

export interface NeisAutoSyncSettings {
  readonly enabled: boolean;
  readonly grade: string;
  readonly className: string;
  readonly lastSyncDate: string;
  readonly lastSyncWeek: string;
  readonly syncTarget: 'class' | 'both';
  /**
   * true면 변경 감지 시 확인 없이 무음 적용, false/미설정이면 알림만(비파괴).
   * optional — 기존 자동동기화 사용자는 load 시 true로 마이그레이션(현행 무음 동작 유지).
   */
  readonly autoApply?: boolean;
}

/** 컴시간 자동연동 설정 (M3). 전부 optional — 기존 사용자 마이그레이션 불필요. */
export interface ComciganAutoSyncSettings {
  readonly enabled: boolean;
  /** true면 변경 감지 시 무음 적용. 기본 false — 비공식 소스라 항상 알림+확인. */
  readonly autoApply: boolean;
  readonly lastSyncDate: string; // 'YYYY-MM-DD'
}

/**
 * 컴시간 교사 재매칭용 저장 지문. raw teacherIndex(fetch마다 재부여 위험)를 저장하지 않고
 * 마스킹 이름 + 과목으로 재매칭한다. schoolCode는 재fetch 대상 학교.
 */
export interface ComciganTeacherFingerprint {
  readonly schoolCode: number;
  readonly maskedName: string;
  readonly subjects: readonly string[];
}

export interface ComciganSettings {
  readonly autoSync?: ComciganAutoSyncSettings;
  readonly fingerprint?: ComciganTeacherFingerprint;
}

/**
 * 압핀 자동연동 설정. 전부 optional — 기존 사용자 마이그레이션 불필요.
 * 압핀은 학교(webdir)·교사번호·학년/반이 안정적이라 컴시간처럼 지문 재매칭이 필요 없다.
 */
export interface AppinAutoSyncSettings {
  readonly enabled: boolean;
  /** 재fetch 대상 학교 식별자 */
  readonly webdir: string;
  readonly schoolName: string;
  readonly city: string;
  /** getupdir 날짜 앵커(현재 주차 추정 폴백용) */
  readonly date?: string;
  /** 자동연동 대상 */
  readonly target: 'teacher' | 'class';
  /** target='teacher' — 교사 번호(1-베이스) */
  readonly teacherNo?: number;
  /** target='class' — 학년/반 */
  readonly grade?: number;
  readonly classNum?: number;
  /** true면 변경 감지 시 무음 적용. 기본 false — 비공식 소스라 항상 알림+확인. */
  readonly autoApply: boolean;
  readonly lastSyncDate: string; // 'YYYY-MM-DD'
}

export interface AppinSettings {
  readonly autoSync?: AppinAutoSyncSettings;
}

export interface NeisSettings {
  readonly schoolCode: string; // SD_SCHUL_CODE
  readonly atptCode: string; // ATPT_OFCDC_SC_CODE
  readonly schoolName: string; // 선택된 학교명
  /**
   * 학교 도로명주소(NEIS ORG_RDNMA). 선택된 학교 확인 + 날씨 지역 자동설정 근거 표시용.
   * 옵셔널 — 직접 입력(NEIS 미연동) 학교나 기존 사용자는 없을 수 있다(마이그레이션 불필요).
   */
  readonly address?: string;
  /** 도로명 우편번호(ORG_RDNZC). 공문서·택배 확인/복사용 */
  readonly postalCode?: string;
  /** 대표 전화번호(ORG_TELNO) */
  readonly tel?: string;
  /** 팩스번호(ORG_FAXNO) */
  readonly fax?: string;
  readonly autoSync?: NeisAutoSyncSettings;
}

export interface WeatherLocation {
  readonly lat: number;
  readonly lon: number;
  readonly name: string; // 표시용 지역명 (예: "서울 강남구")
}

/**
 * 학교알리미(schoolinfo) 학교 연결 (school-enrich ②-B).
 *
 * 온보딩/설정에서 NEIS 학교를 고를 때 학교명+주소로 학교알리미 식별자(shlIdfCd)를
 * best-effort 매칭해 저장한다. 평가계획 불러오기(①)가 이 값이 있으면 학교 재검색
 * 단계를 건너뛴다(없거나 모호하면 ① 수동검색 폴백 — 차단 없음, §13).
 */
export interface SchoolInfoLink {
  readonly shlIdfCd: string;
  readonly matchedName: string; // 매칭된 학교알리미 학교명(확인용)
}

export interface WeatherSettings {
  readonly location: WeatherLocation | null;
  readonly refreshIntervalMin: number; // 갱신 주기 (분)
}

export interface FeedbackConfig {
  readonly formUrl: string; // Google Forms URL (비어있으면 클립보드 폴백)
  readonly email: string;
}

export interface SyncSettings {
  readonly enabled: boolean;
  readonly autoSyncOnStart: boolean;
  readonly autoSyncOnSave: boolean;
  readonly autoSyncIntervalMin: number; // 0=비활성
  readonly conflictPolicy: 'latest' | 'ask';
  /**
   * @deprecated v2.3.5부터 **쓰지 않는다**(ADR-040). 마지막 동기화 시각은 기기 전용
   * 저장소(`drive-sync-device-state`)가 정본이다. 이 필드는 v2.3.4 이하에서 올라온
   * 값을 1회 승계하기 위한 읽기 전용 레거시로만 남아 있다.
   *
   * ⚠️ 여기에 다시 쓰지 말 것: settings는 동기화 대상 파일이라, 동기화가 끝날 때마다
   * 이 값을 갱신하면 매 주기 업로드·기기 간 LWW 핑퐁·가짜 충돌(ADR-039)이 재발한다.
   */
  readonly lastSyncedAt: string | null;
  readonly deviceId: string;
  /**
   * 신규 기기 첫 동기화 시 사용자가 "나중에 결정"을 선택했는지.
   * true → BackupCard에 알림 배너 표시, autoSync는 false 상태로 둠.
   * 사용자가 download/upload 결정을 명시적으로 내리면 false로 초기화.
   * optional 필드 → 기존 사용자 마이그레이션 불필요.
   */
  readonly firstSyncDeferred?: boolean;
}

/** 글로벌 퀵애드 단축키 ID */
export type QuickAddShortcutId =
  | 'quickAdd.todo'
  | 'quickAdd.event'
  | 'quickAdd.memo'
  | 'quickAdd.note'
  | 'quickAdd.bookmark'
  | 'sticker-picker:toggle'
  | 'sidePin:toggle'
  | 'sidePin:openWidget'
  | 'sidePin:openMemo';

export interface ShortcutBinding {
  /** 정규화 조합 문자열, 예: "mod+alt+t" */
  readonly combo: string;
  /** 사용자가 개별 단축키 비활성화한 경우 false */
  readonly enabled: boolean;
}

export interface ShortcutSettings {
  /** 커맨드 ID → 키 조합 매핑 */
  readonly bindings: Record<string, ShortcutBinding>;
  /** OS 전역 단축키(Electron globalShortcut) 활성화 여부. v2.1+ 기본 true */
  readonly globalEnabled: boolean;
  /**
   * v2 자동 활성화 마이그레이션 완료 플래그.
   * v2.0.0 이하에서 globalEnabled=false로 저장된 사용자를 위해 1회 강제로 true로 전환한 뒤
   * 이 플래그를 true로 박아서 사용자가 의도적으로 다시 false로 끈 경우 다시 자동 활성화하지 않는다.
   */
  readonly migratedAutoEnableV2?: boolean;
}

export interface MealSchoolSettings {
  readonly schoolCode: string; // 급식 조회용 SD_SCHUL_CODE (비어있으면 neis.schoolCode 사용)
  readonly atptCode: string; // 급식 조회용 ATPT_OFCDC_SC_CODE
  readonly schoolName: string; // 표시용 학교명
}

export interface Settings {
  readonly schoolName: string;
  readonly grade?: string;
  readonly className: string;
  readonly teacherName: string;
  /**
   * 현재 학기 라벨('2026-1' 형식) — 학년도 전환(S2.4 ExecuteYearTransition)이 완료 시 기록한다.
   * 미설정(구버전·전환 미사용)이면 undefined — 표시 축은 academicTerm() 파생으로 폴백.
   * ⚠️ 이름 규칙: `schoolYear` 금지(§6.1-㉕ — NEIS 학사일정 SchoolEvent.schoolYear와 충돌).
   * 학년도는 schoolYearOf(currentTerm)로 파생한다.
   */
  readonly currentTerm?: string;
  /**
   * 마지막으로 **마감한**(학년도 마무리를 실행한) 학기 라벨('2026-1' 형식) — F9a.
   * 동기화 병합의 스킵 기준 정본: 리모트 레코드의 term이 이 값 이하면 병합하지 않는다
   * (사용자가 명시적으로 마감한 학기는 라이브에 없어야 한다 — 같은 학년도 학기 전환 부활 차단).
   * 미설정(전환 미사용·구버전 이력)이면 학년도 비교로 폴백한다.
   * currentTerm과 **항상 같은 저장에서 함께 갱신**되어야 한다(갈리면 가드가 어긋난다).
   */
  readonly lastClosedTerm?: string;
  /**
   * F11a — 마지막 마감을 **실행한 시각**(ISO). `lastClosedTerm`과 같은 저장에서 기록한다.
   * 병합 스킵은 "마감 학기 이하 **AND** 이 시각 이전 기록"에만 적용된다 —
   * 마감 이후 새로 만든 기록은 term이 같아도 정상 병합된다(중간 마감 후 전파 정지 방지).
   */
  readonly lastClosedAt?: string;
  /**
   * F11b — 학기 가드(currentTerm·lastClosedTerm·lastClosedAt)를 **마지막으로 결정한 시각**(ISO).
   * settings 통파일 교체 시 "더 최신 결정이 이긴다" 판정의 근거 — 학기 비교만 쓰면
   * 되돌리기(해제=후퇴)가 항상 밀려 다른 기기로 전파되지 않는다.
   */
  readonly termGuardUpdatedAt?: string;
  /**
   * 학기별 **실제 개학일**('2026-2' → '2026-08-18') — 화면에 보이는 현재 학기의 정본.
   *
   * 달력 파생(3~8월=1학기)만 쓰면 8월 중순에 2학기를 개학한 학교가 9월 1일까지 1학기로 보인다.
   * 반대로 "8월 중순부터 2학기"로 날짜를 박으면 3월 개학 학교가 정반대로 틀린다 — 앱은 개학일을
   * 알 수 없다(ADR-037). 그래서 **학교가 알려준 개학일**만 달력 파생을 대신한다.
   *
   * 채우는 경로 3가지: 설정에서 학기 직접 선택 · 개학일 직접 입력 · 시간표 신호 감지 후 확인.
   * 미설정이면 종전대로 달력 파생이며 동작이 달라지지 않는다.
   *
   * ⚠️ `currentTerm`(마무리 마법사·동기화 병합 가드)과는 **별개 축**이다. 표시를 바꾸려고
   * currentTerm을 건드리면 학기 마감 가드가 어긋난다 — 판정은 resolveCurrentTerm이 합친다.
   * 판정 정본: `@domain/rules/schoolTermStart`
   */
  readonly termStartDates?: Readonly<Record<string, string>>;
  /**
   * 개학일 확인 팝업을 사용자가 "나중에"로 넘긴 학기 라벨 — 같은 학기에 다시 묻지 않는다.
   * 답을 하면(termStartDates에 등록되면) 이 값과 무관하게 조용해지므로 별도 해제가 필요 없다.
   */
  readonly termStartPromptSkipped?: string;
  /**
   * 학기별 **실제 종료일**('2026-2' → '2026-12-31') — `termStartDates`와 짝을 이루는 반대쪽 끝.
   *
   * 학기 총 수업 차시를 세려면 시작과 끝이 둘 다 필요한데, **앱은 끝도 알 수 없다**(ADR-037 —
   * 방학 날짜는 학교마다 다르고, 달력으로 단정하면 시작일과 똑같은 이유로 틀린다). 그래서
   * 시작일과 같은 규칙을 쓴다: **학교가 알려준 값만** 담는다.
   *
   * 채우는 경로 2가지: 학사일정에서 찾은 후보를 사용자가 확인 · 직접 입력.
   * 미설정이면 차시 계산을 **하지 않고** 종료일을 묻는 안내를 띄운다 — 앱이 임의의 날짜를
   * 채워 넣고 그 위에서 숫자를 만들지 않는다.
   *
   * 후보 탐색 정본: `@domain/rules/termEndFromSchedule`
   */
  readonly termEndDates?: Readonly<Record<string, string>>;
  /**
   * 종료일 확인 팝업을 사용자가 "나중에"로 넘긴 학기 라벨 — 같은 학기에 다시 묻지 않는다.
   * `termStartPromptSkipped`와 같은 규칙이라, 답을 하면(termEndDates에 등록되면) 이 값과
   * 무관하게 조용해지므로 별도 해제가 필요 없다.
   */
  readonly termEndPromptSkipped?: string;
  /**
   * 시간표가 "이 학기 기준으로 최신"임을 확인한 학기 라벨('2026-1' 형식).
   *
   * 시간표는 학기가 바뀌어도 자동으로 갱신되지 않는데(원본은 학교가 올려야 한다) 그 사실을
   * 알리는 곳이 없어 지난 학기 표를 계속 보는 사용자가 생겼다. 이 값과 현재 학기가 다르면
   * 시간표 화면이 갱신 여부를 **묻는다**(단정하지 않는다 — 8월 개학처럼 학교마다 실제 학기
   * 시작이 달라 앱이 낡음을 확신할 수 없다. ADR-037과 같은 이유).
   *
   * 갱신 시점: 시간표를 불러오거나 직접 저장했을 때, 그리고 사용자가 "이미 최신"이라고 답했을 때.
   * 미설정(구버전 이력)이면 시간표 화면 첫 진입에서 조용히 현재 학기로 채운다 —
   * 업데이트 직후 전원에게 배너를 띄우지 않기 위함이다.
   */
  readonly timetableTermAck?: string;
  /** 담임 누가기록 통합 입력(S4) 사용자 추가 태그 — DEFAULT_HOMEROOM_RECORD_TAGS 외 직접 추가분. */
  readonly homeroomRecordTags?: readonly string[];
  /**
   * 출결 사유 반복 경고 키워드(M2) — 같은 달 동일 키워드 재입력 시 비차단 경고.
   * 기본 제공 키워드 없음(사용자 등록만) — 규정 판단을 내장하지 않는다.
   */
  readonly attendanceReasonKeywords?: readonly string[];
  /**
   * 증빙서류 요구 정책(M4) — 어떤 출결(사유 축×상태)이 서류 수합 대상인지 학교 방침.
   * 미설정 시 기본 정책(출석인정만 요구, DEFAULT_ATTENDANCE_DOCUMENT_POLICY) 적용.
   */
  readonly attendanceDocumentPolicy?: import('@domain/rules/attendanceDocumentPolicy').AttendanceDocumentPolicy;
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
  /** 컴시간알리미 교사 시간표 자동연동 (M3). optional — 미import 사용자는 없음. */
  readonly comcigan?: ComciganSettings;
  /** 압핀 시간표 자동연동. optional — 압핀 미import 사용자는 없음. */
  readonly appin?: AppinSettings;
  /**
   * 쿨메신저 쪽지에서 일정·할일 가져오기.
   *
   * **기본값은 꺼짐이다.** 쿨메신저를 쓰지 않는 시도교육청이 많아서, 안 쓰는 선생님께는
   * 버튼이 아예 안 보이는 게 맞다. 설정에서 켜야 일정·할일 화면에 버튼이 나온다.
   * optional 이라 기존 사용자 데이터와 100% 호환된다(값이 없으면 꺼짐).
   */
  readonly coolMessengerImportEnabled?: boolean;
  /** 학교알리미 학교 연결 (평가계획 불러오기 학교 재검색 생략용, school-enrich ②-B) */
  readonly schoolInfo?: SchoolInfoLink;
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
  /** 학생 관찰 기록 알림 설정. 미설정 시 DEFAULT_REMINDER_SETTINGS(전체 OFF). */
  readonly recordReminder?: ReminderSettings;
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
  /**
   * 미니앱("내가 만든 앱") 메타데이터 목록.
   * HTML 본문·이미지 아이콘은 로컬 userData/miniapps/<id>/ 에 저장(동기화 제외),
   * 메타만 여기 실려 'settings' 동기화 도메인에 편승한다(다른 기기엔 목록/이모지만 전달).
   * 미설정/빈 배열 = 등록된 미니앱 없음.
   */
  readonly miniApps?: readonly MiniApp[];
  /** 쌤도구 "내가 만든 앱" 섹션을 숨겼는지 여부 (기본 false = 표시) */
  readonly hiddenMiniAppSection?: boolean;
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
  /**
   * 점심을 둘 교시 위치 (이 교시 직후에 점심). 1-based.
   *
   * 우선순위 (presenter `getLunchBreakIndex`):
   * 1. 이 값
   * 2. `lunchStart` / `lunchEnd` 시간대 겹침
   * 3. 교시 간 30분 이상 갭 자동 추정 (레거시)
   *
   * 마이그레이션 정책: lazy — 사용자가 PeriodTab에서 위·아래 버튼을 처음 누르는
   * 순간 박힌다. 부팅 시 자동 마이그레이션은 수행하지 않는다.
   * 옵셔널 필드라 기존 사용자 마이그레이션 0줄 + 동기화 호환.
   */
  readonly lunchAfterPeriod?: number;
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

  // ──────────────────────────────────────────────────────────────────
  // 샘플 명렬(데모 35명) 관련 플래그 — roster-sample-data-removal PDCA
  //
  // 신규 설치 시 자동 시드되는 35명 데모 명렬을 사용자가 손도 안 댄 채
  // 그대로 두는 문제를 해결하기 위한 가드 플래그 묶음.
  // 모두 옵셔널이며 기본값은 false/undefined → 기존 사용자 마이그레이션 불필요.
  // ──────────────────────────────────────────────────────────────────

  /**
   * 사용자가 명렬 관리(RosterManagementTab)에서 한 번이라도 수정한 흔적
   * (가드 F — "사용자 의도 흔적").
   *
   * 한 번이라도 true가 되면 자동 정리 대상에서 제외한다.
   * 기본값 undefined → false 취급.
   */
  readonly everEditedRoster?: boolean;

  /**
   * 마이그레이션 1회성 정리 완료 멱등 가드 (가드 G).
   *
   * 첫 실행 시 샘플 명렬을 자동 정리하면서 true로 박는다.
   * 사용자가 이후 다시 샘플과 동일한 35명을 만들어도 두 번 정리하지 않는다.
   * 기본값 undefined → false 취급.
   */
  readonly didCleanSampleRoster?: boolean;

  /**
   * 상단 안내 배너를 닫은 시각 (ISO 8601, 예: "2026-05-21T09:30:00.000Z").
   *
   * 닫고 나서 3일이 지나면 다시 표시한다. 미설정 시 처음 보는 상태로 간주.
   */
  readonly sampleRosterBannerDismissedAt?: string;

  /**
   * 마이그레이션 토스트를 표시한 시각 (ISO 8601).
   *
   * 토스트는 1회만 띄우고, 한 번 박힌 뒤에는 다시 보여주지 않는다.
   * 미설정 시 "아직 안 보여줬다"는 의미.
   */
  readonly sampleRosterMigrationToastShownAt?: string;
}
