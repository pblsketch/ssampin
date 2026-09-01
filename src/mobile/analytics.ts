/**
 * 모바일 웹(m.ssampin.com) 사용 기록.
 *
 * ★왜 새로 만들었나 (2026-09-01)
 * 모바일 웹은 157개 파일 규모인데 **통계 코드가 한 줄도 없었다.** 그래서 관리자 화면의
 * 사용자 수·활성 사용자에 모바일 사용자는 **아예 존재하지 않았다.** 몇 명이 쓰는지,
 * 무엇을 보는지, 늘고 있는지 줄고 있는지 전부 알 수 없었다.
 *
 * ★이름을 `mobile_` 로 시작하게 둔 이유
 * 같은 표(`app_analytics`)에 쌓이므로, 이름을 구분하지 않으면 데스크톱 지표에 그대로
 * 섞여 **지금까지 쌓은 추세선이 끊긴다.** 접두사를 두면 나중에 "데스크톱만" / "모바일만"
 * 을 언제든 갈라 볼 수 있다.
 * ⚠️ 활성 사용자(DAU)를 세는 롤업은 이벤트 이름을 가리지 않는다. 접두사만으로는
 *    부족하고 **롤업에서 걸러야** 한다 — `supabase/migrations/065_analytics_mobile_split.sql`.
 *
 * ★화면 이름에 **주소를 그대로 쓰지 않는다.**
 * 모바일 주소에는 `classId`·`className`(반 이름)이 들어간다. 주소를 그대로 보내면
 * 학교 반 이름이 통계 표에 쌓인다. 그래서 `route.kind` 에서 안전한 이름만 조립한다.
 */
import { SupabaseAnalyticsAdapter } from '@infrastructure/analytics/SupabaseAnalyticsAdapter';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { MobileRoute } from './routing/routes';

const DEVICE_ID_KEY = 'ssampin_device_id';
const LAUNCH_COUNT_KEY = 'ssampin_launch_count';

const analytics = new SupabaseAnalyticsAdapter();

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // 사생활 보호 모드 등으로 저장소를 못 쓰면 이번 방문만 세고 만다.
    return '';
  }
}

/**
 * 주소에서 **안전한 화면 이름**만 뽑는다.
 *
 * `classId`·`className` 은 절대 넣지 않는다 — 반 이름이 통계에 남으면 안 된다.
 */
export function screenNameOf(route: MobileRoute): string {
  switch (route.kind) {
    case 'schedule':
      return `schedule:${route.seg}`;
    case 'moreSection':
      return `more:${route.section}`;
    case 'tool':
      return `tool:${route.toolId}`;
    case 'attendance':
      // 어떤 반인지는 빼고, 담임 출결인지 수업반 출결인지만 남긴다.
      return `attendance:${route.type}`;
    case 'teachingClass':
      return 'teachingClass';
    default:
      return route.kind;
  }
}

let started = false;

/** 앱이 뜰 때 한 번. 두 번 불러도 손해가 없다. */
export function startMobileAnalytics(): void {
  if (started) return;
  started = true;

  analytics.setDeviceId(getOrCreateDeviceId());
  analytics.setAppVersion(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');

  let launchCount = 1;
  try {
    launchCount = parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, String(launchCount));
  } catch {
    // 못 세도 그만 — 기록 자체는 남긴다.
  }
  analytics.track('mobile_app_open', { isReturning: launchCount > 1 });

  // 모바일은 탭을 닫는 순간을 잡기 어렵다. `visibilitychange`(숨김)가 `beforeunload`
  // 보다 확실히 불린다 — iOS 사파리는 beforeunload 를 자주 건너뛴다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void analytics.flush();
  });
  window.addEventListener('pagehide', () => {
    void analytics.flush();
  });
}

export function trackMobilePageView(route: MobileRoute): void {
  analytics.track('mobile_page_view', { page: screenNameOf(route) });
}

/** 화면 이동 말고 "무엇을 했는지". 이름은 미리 정해 둔 것만 쓴다(값은 담지 않는다). */
export function trackMobileAction(action: string): void {
  analytics.track('mobile_action', { action });
}
