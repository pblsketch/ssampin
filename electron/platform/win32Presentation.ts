/**
 * Windows 프레젠테이션/전체화면 감지 — shell32.dll의 SHQueryUserNotificationState를
 * koffi(FFI)로 직접 호출한다.
 *
 * 배경 (옆핀 개인정보 보호 1단계, S1-1 —
 *   docs/01-plan/features/sidepin-privacy-guard.plan.md §5.2/§5.4):
 *   PPT 슬라이드쇼(F5)처럼 학생들 앞에 화면을 띄운 순간 옆핀(화면 가장자리 위젯)을 자동으로
 *   가리기 위해, "지금 전체화면/프레젠테이션 상태인가"를 3초 주기로 물어본다(폴링).
 *
 * ★ 실패 정책이 이 저장소의 다른 두 koffi 모듈과 다르다 — 의도적인 차이다.
 *
 *   `win32Desktop.ts:447`의 `KoffiLoadError`, `win32SendKeys.ts:14-17`("조용한 실패 금지")은
 *   둘 다 **예외를 던진다.** 그 두 모듈은 "선생님이 방금 시킨 일"(바탕화면 위젯 부착, 스티커
 *   Ctrl+V 붙여넣기)이 실패했을 때 호출되므로, 실패를 호출자가 그대로 사용자에게 안내해야
 *   한다 — 조용히 삼키면 사용자에게는 "왜 안 되지"만 남는다.
 *
 *   이 모듈은 다르다. `queryUserNotificationState`는 선생님이 시킨 적 없이 **배경에서 3초마다
 *   저절로 도는 관측**이다. 실패마다 예외를 던지면 호출부가 매번 try/catch를 감싸야 하고,
 *   무엇보다 실패가 반복되면(예: 이 기기에 shell32 API 자체가 없거나 koffi 로드가 계속 안 되는
 *   경우) 3초마다 로그가 영원히 쌓인다 — 그리고 선생님이 그 실패에 대해 할 수 있는 일이 없다
 *   (재시도해도 소용없는 시스템 API 실패다). 그래서 **절대 던지지 않고 `null`("모름")을
 *   돌려준다.**
 *
 *   "모름"일 때 안전한 답은 **"가리지 않는다"**다(§5.4 원문: "모르면 숨기지 않는 쪽이 맞다").
 *   옆핀을 계속 보여주는 지금 동작을 유지하는 쪽이, 잘못 판단해 옆핀을 영영 숨겨버리는 쪽보다
 *   안전하다 — `shouldHideForNotificationState(null)`도 항상 `false`다.
 *
 * 영구 실패 처리 (연속 3회):
 *   koffi 로드, DLL/함수 조회, 또는 HRESULT 실패가 **연속 3회** 발생하면 이후 호출은 koffi를
 *   다시 건드리지 않고 즉시 `null`을 반환한다(폴링 영구 중단). 로그는 **그 순간 딱 한 번만**
 *   남긴다 — 3초 주기 폴링에서 매번 재시도하며 로그를 남기면 이 API가 없는 환경(비Windows,
 *   구형 Windows)에서 로그가 끝없이 쌓인다. 도중에 한 번이라도 성공하면 카운터를 0으로
 *   되돌린다(다시 3회를 허용).
 *
 * ⚠️ 참고 (구현 중 Microsoft Learn 재확인, 계획서 숫자와 다름):
 *   계획서(§5.2/§5.4)와 본 스토리 요청 원문의 QUNS_* 숫자(BUSY=3, D3D_FULL_SCREEN=4,
 *   PRESENTATION_MODE=5, QUIET_TIME=7, APP=8)는 실제 Win32 SDK(shellapi.h)와 1씩 어긋난다.
 *   Microsoft Learn 문서로 재확인한 실제 값은 NOT_PRESENT=1, BUSY=2, D3D_FULL_SCREEN=3,
 *   PRESENTATION_MODE=4, ACCEPTS_NOTIFICATIONS=5, QUIET_TIME=6, APP=7 이다. 본 파일은
 *   **실제 SDK 값**을 쓴다 — 요청 원문 숫자를 그대로 베끼면 가장 흔한 PPT 슬라이드쇼 상태
 *   (실제로는 QUNS_BUSY=2)를 못 가리는 실제 결함이 생긴다. 계획서 쪽 정정이 필요하다.
 */

// ────────────────────────────────────────────────────────────
// QUERY_USER_NOTIFICATION_STATE — shellapi.h 실제 값
// https://learn.microsoft.com/windows/win32/api/shellapi/ne-shellapi-query_user_notification_state
// ────────────────────────────────────────────────────────────

/** 화면보호기 실행 중 · 잠금 상태 · 비활성 빠른 사용자 전환 세션 — 판단 근거 없음. */
export const QUNS_NOT_PRESENT = 1;
/** 전체화면 앱 실행 중 또는 프레젠테이션 설정 적용 중 — PPT 슬라이드쇼가 여기 해당한다. */
export const QUNS_BUSY = 2;
/** 전체화면(exclusive) Direct3D 앱 실행 중 — 게임 등. */
export const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
/** 사용자가 Windows 프레젠테이션 설정을 직접 켬(알림 차단). */
export const QUNS_PRESENTATION_MODE = 4;
/** 위 상태 어디에도 안 걸림 — 평상시, 알림을 자유롭게 보내도 됨. */
export const QUNS_ACCEPTS_NOTIFICATIONS = 5;
/**
 * "조용한 시간" — 새 계정 최초 로그인 후 1시간, 또는 OS 업그레이드/클린 설치 직후.
 * Windows 집중 지원(Focus Assist)류 기능과 맞물릴 수 있다.
 * **반드시 false를 반환해야 한다** — 여기서 옆핀을 가리면 그 선생님은 옆핀을 영영 못 보게 된다.
 */
export const QUNS_QUIET_TIME = 6;
/** 전체화면 스토어 앱(UWP) 실행 중. */
export const QUNS_APP = 7;

/** 옆핀을 가려야 하는 상태 집합 — QUNS_QUIET_TIME은 의도적으로 제외한다. */
const HIDDEN_STATES: ReadonlySet<number> = new Set([
  QUNS_BUSY,
  QUNS_RUNNING_D3D_FULL_SCREEN,
  QUNS_PRESENTATION_MODE,
  QUNS_APP,
]);

/**
 * 감지된 상태값으로 "옆핀을 가려야 하는가"만 순수하게 판정한다.
 *
 * I/O 없음, 절대 throw하지 않는다. `QUNS_QUIET_TIME`은 의도적으로 제외한다 — 여기서 가리면
 * 집중 지원을 켠 선생님이 옆핀을 영영 못 보게 된다. `null`(측정 실패/모름)과 미지의 값도
 * 안전하게 false(가리지 않음)로 처리한다.
 */
export function shouldHideForNotificationState(state: number | null): boolean {
  if (state === null) return false;
  return HIDDEN_STATES.has(state);
}

// ────────────────────────────────────────────────────────────
// koffi 바인딩
// ────────────────────────────────────────────────────────────

interface Shell32Bindings {
  readonly shQueryUserNotificationState: (pquns: unknown) => number;
}

let cachedBindings: Shell32Bindings | null = null;

function loadBindings(): Shell32Bindings {
  if (cachedBindings) return cachedBindings;

  let koffi: typeof import('koffi');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    koffi = require('koffi') as typeof import('koffi');
  } catch (e) {
    throw new Error(`koffi 모듈 로드 실패: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }

  let shell32: ReturnType<typeof koffi.load>;
  try {
    shell32 = koffi.load('shell32.dll');
  } catch (e) {
    throw new Error(`shell32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }

  try {
    // SHQueryUserNotificationState(QUERY_USER_NOTIFICATION_STATE *pquns) → HRESULT.
    // pquns는 4바이트 정수 out-param — win32Desktop.ts의 GetWindowThreadProcessId가 쓰는
    // 'uint32 *' out-param 관례와 동일하게 Buffer를 직접 넘긴다. HRESULT는 부호 있는 32비트
    // 값이라 반환형은 'int32'로 선언한다(uint32면 음수 실패 코드가 거대한 양수로 읽힌다).
    const shQueryUserNotificationState = shell32.func(
      'int32 __stdcall SHQueryUserNotificationState(int32 *)',
    ) as unknown as (pquns: unknown) => number;

    cachedBindings = { shQueryUserNotificationState };
    return cachedBindings;
  } catch (e) {
    throw new Error(
      `SHQueryUserNotificationState 바인딩 준비 실패: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

/** 실제 koffi 호출(내부 전용) — 성공 시 상태값 반환, 실패 시 throw. */
function callNativeQuery(): number {
  const b = loadBindings();
  const buf = Buffer.alloc(4);
  const hr = b.shQueryUserNotificationState(buf);
  // SUCCEEDED(hr) := hr >= 0. 실패해도 buf가 갱신되지 않을 수 있으므로 hr부터 확인한다.
  if (hr < 0) {
    throw new Error(`SHQueryUserNotificationState HRESULT 실패: 0x${(hr >>> 0).toString(16)}`);
  }
  return buf.readInt32LE(0);
}

// ────────────────────────────────────────────────────────────
// 연속 실패 카운터 + 테스트 전용 주입 훅
// ────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 3;

let consecutiveFailureCount = 0;
let hasLoggedPermanentGiveUp = false;

/**
 * 테스트 전용 주입 훅 — 값이 설정돼 있으면 실제 koffi 호출 대신 이 함수를 쓴다.
 *
 * 설정돼 있으면 `process.platform` 검사도 건너뛴다 — 연속 3회 실패 후 영구 중단되는 로직을
 * (CI가 Windows가 아닐 때도) 결정적으로 검증하기 위함이다. 프로덕션 코드는 이 값을 절대
 * 설정하지 않는다.
 */
let nativeQueryOverrideForTests: (() => number) | null = null;

/** @internal 테스트 전용. 프로덕션 코드에서 호출하지 않는다. */
export function __setNativeQueryOverrideForTests(fn: (() => number) | null): void {
  nativeQueryOverrideForTests = fn;
}

/** @internal 테스트 전용 — 연속 실패 카운터·영구 중단 플래그·주입 훅을 모두 초기화한다. */
export function __resetPresentationDetectionForTests(): void {
  consecutiveFailureCount = 0;
  hasLoggedPermanentGiveUp = false;
  nativeQueryOverrideForTests = null;
}

/**
 * 지금 화면이 전체화면/프레젠테이션 상태인지 Windows에 묻는다.
 *
 * **절대 throw하지 않는다.** 비Windows, koffi/DLL 로드 실패, HRESULT 실패 등 어떤 이유로든
 * 실패하면 `null`("모름")을 반환한다 — 이유는 파일 머리말 참고.
 *
 * @returns QUNS_* 상태값, 또는 모르면 `null`.
 */
export function queryUserNotificationState(): number | null {
  if (nativeQueryOverrideForTests === null && process.platform !== 'win32') {
    return null;
  }
  if (consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES) {
    return null;
  }

  try {
    const state = (nativeQueryOverrideForTests ?? callNativeQuery)();
    consecutiveFailureCount = 0;
    return state;
  } catch (e) {
    consecutiveFailureCount += 1;
    if (consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES && !hasLoggedPermanentGiveUp) {
      hasLoggedPermanentGiveUp = true;
      console.warn(
        `[win32Presentation] SHQueryUserNotificationState 연속 ${MAX_CONSECUTIVE_FAILURES}회 ` +
          `실패 — 전체화면 감지 폴링을 영구 중단합니다: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// 감시 판정 — 순수 로직
// ────────────────────────────────────────────────────────────

/**
 * "지금 가려야 하나"를 정하는 부분만 떼어 낸 순수 함수.
 *
 * `sidePinProtection.ts`와 같은 이유로 창을 다루지 않고 판단만 한다 — 실제로 발표를
 * 띄우지 않고도 시험할 수 있어야 하기 때문이다. main.ts 안에 두었더니
 * **되돌리는 데 30초가 걸리는 결함을 어떤 테스트도 잡지 못했고, 실기기에서야 나왔다**
 * (2026-09-01). 그래서 여기로 옮긴다.
 */
export interface PresentationWatchState {
  /** 마지막으로 본 판정 */
  readonly streakHide: boolean;
  /** 그 판정이 몇 번 연속인지 */
  readonly streakCount: number;
  /** 지금 우리가 보호를 걸어 둔 상태인가 */
  readonly hiding: boolean;
}

export type PresentationWatchAction = 'none' | 'protect' | 'release';

export const INITIAL_PRESENTATION_WATCH_STATE: PresentationWatchState = {
  streakHide: false,
  streakCount: 0,
  hiding: false,
};

/**
 * 가릴 때는 **한 번**이면 충분하다 — 확인을 기다리는 3초가 곧 학생 정보가 교실 화면에
 * 떠 있는 3초다. 순한 등급이라 헛짚어도 대가가 싸므로 빨리 가리는 쪽이 맞다.
 */
export const PRESENTATION_HIDE_CONFIRM_COUNT = 1;
/**
 * 되돌릴 때는 **두 번**을 본다. 슬라이드가 넘어가는 순간 값이 한 번 튀는 일이 있는데,
 * 그걸 "발표가 끝났다"로 읽으면 발표 도중에 옆핀이 튀어나온다.
 *
 * ⚠️ 이 비대칭(1 대 2)이 흔들림을 막는 **유일한** 장치다. 값이 한 칸씩 번갈아 튀면
 * "아니오"가 두 번 연속 나오지 않으므로 되돌아가는 일 자체가 일어나지 않는다.
 * 예전에 여기에 "최소 30초 유지"를 덧붙였다가, 발표를 30초 안에 끝내면 손잡이가
 * 사라진 채로 남아 **고장으로 신고됐다.** 다시 넣지 말 것.
 */
export const PRESENTATION_SHOW_CONFIRM_COUNT = 2;

export function stepPresentationWatch(
  prev: PresentationWatchState,
  hide: boolean,
): { readonly next: PresentationWatchState; readonly action: PresentationWatchAction } {
  const streakCount = prev.streakHide === hide ? prev.streakCount + 1 : 1;
  const stepped: PresentationWatchState = { ...prev, streakHide: hide, streakCount };

  const needed = hide ? PRESENTATION_HIDE_CONFIRM_COUNT : PRESENTATION_SHOW_CONFIRM_COUNT;
  if (streakCount < needed) return { next: stepped, action: 'none' };
  if (hide === prev.hiding) return { next: stepped, action: 'none' };

  return {
    next: { ...stepped, hiding: hide },
    action: hide ? 'protect' : 'release',
  };
}
