/**
 * 두 칸(위젯·메모)을 어떻게 나눠 그릴지 정하는 **유일한 규칙**.
 *
 * 패널(칸 크기)과 칸 머리말(띠로 접혔는가)이 같은 판단을 각자 하면 반드시 어긋난다.
 * 그래서 순수 함수 하나로 뽑아 두고 양쪽이 이것만 본다.
 *
 * 우선순위가 핵심이다 — **편집이 항상 이긴다.**
 * 들어온 칸을 먼저 보면, 메모가 띠로 접힌 상태에서 메모를 쓸 방법이 사라진다.
 * (`SidePinPanel`이 예전부터 경고해 온 "둘 다 접혀 아무것도 안 보이는" 상태와 같은 계열)
 */
import type { SidePinZone } from '@domain/entities/SidePinRuntimeState';

/** 한 칸이 차지하는 모양 */
export interface SidePinZoneFit {
  /**
   * - `full`   — 화면을 거의 다 쓴다
   * - `band`   — 48px 띠로 접힌다
   * - `shared` — 둘이 나눠 쓴다(위젯 3 : 메모 2)
   */
  readonly kind: 'full' | 'band' | 'shared';
  /**
   * 띠를 눌러 이 칸으로 넘어올 수 있는가.
   *
   * **편집 때문에 접힌 띠는 누를 수 없다.** 눌러도 편집이 이겨 그대로라, 누를 수 있게
   * 두면 "눌리는데 아무 일도 안 일어나는" 버튼이 된다.
   */
  readonly expandable: boolean;
}

export interface SidePinZoneLayout {
  readonly widget: SidePinZoneFit;
  readonly memo: SidePinZoneFit;
}

const FULL: SidePinZoneFit = { kind: 'full', expandable: false };
const SHARED: SidePinZoneFit = { kind: 'shared', expandable: false };
/** 들어온 칸 때문에 접힌 띠 — 누르면 넘어간다 */
const BAND_OPENABLE: SidePinZoneFit = { kind: 'band', expandable: true };
/** 편집 때문에 접힌 띠 — 누를 수 없다 */
const BAND_LOCKED: SidePinZoneFit = { kind: 'band', expandable: false };

export interface SidePinZoneLayoutInput {
  /** 들어온 칸. `both`·`null`이면 지정이 없다는 뜻이다 */
  readonly activeZone: SidePinZone | null;
  readonly memoEditing: boolean;
  readonly widgetEditing: boolean;
}

export function resolveSidePinZoneLayout({
  activeZone,
  memoEditing,
  widgetEditing,
}: SidePinZoneLayoutInput): SidePinZoneLayout {
  // 1) 편집이 먼저다. 둘 다 참으로 들어오면 메모를 택한다 — 둘 다 접으면 빈 패널이 된다.
  if (memoEditing) return { widget: BAND_LOCKED, memo: FULL };
  if (widgetEditing) return { widget: FULL, memo: BAND_LOCKED };

  // 2) 그다음이 들어온 칸이다.
  if (activeZone === 'widget') return { widget: FULL, memo: BAND_OPENABLE };
  if (activeZone === 'memo') return { widget: BAND_OPENABLE, memo: FULL };

  // 3) 가리킨 곳이 없으면(단축키·끌기 자리) 앱이 대신 고르지 않고 둘 다 보여 준다.
  return { widget: SHARED, memo: SHARED };
}
