/**
 * 옆핀의 기기 전용 상태 — 어느 모니터에, 얼마나 넓게 띄울지.
 *
 * 이 값은 동기화하지 않는다. 학교 컴퓨터와 집 노트북은 모니터 구성이 다르므로,
 * 동기화 설정에 넣으면 서로의 값을 계속 덮어쓴다. 동기화 대상 사용자 선택은
 * [[SidePinPreferences]]가 따로 가진다.
 *
 * 저장은 Electron main이 `app.getPath('userData')` 아래 별도 JSON으로 소유한다.
 */
import { clampSidePinWidth, SIDE_PIN_WIDTH_DEFAULT } from '../valueObjects/SidePinWidth';

/** 기기 전용 상태 파일 스키마 버전 */
export const SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION = 1;
/** 손잡이 세로 위치의 기본값. 예전 8단계의 3번 칸과 같은 자리다. */
export const SIDE_PIN_RAIL_POSITION_DEFAULT = 3 / 7;
/** v2.4.0 이전 개발본이 쓰던 8단계 칸 번호의 최댓값. 비율로 옮길 때만 쓴다. */
const LEGACY_RAIL_SLOT_MAX = 7;

export interface SidePinDeviceState {
  readonly schemaVersion: number;
  /**
   * 사용자가 고른 모니터 식별자. 고르지 않았으면 null(주 모니터 사용).
   *
   * Electron의 `Display.id`는 숫자지만 JSON 왕복과 비교를 단순하게 하려고 문자열로 보관한다.
   * 어차피 모니터를 뺐다 꽂으면 id가 바뀔 수 있어서, 창을 펼칠 때마다 현재 목록과
   * 다시 대조하고 없으면 주 모니터로 되돌린다.
   */
  readonly displayId: string | null;
  /** 펼친 패널 너비 (DIP) */
  readonly panelWidth: number;
  /**
   * 손잡이 세로 위치. 0은 맨 위, 1은 맨 아래다.
   *
   * 픽셀이 아니라 **쓸 수 있는 높이 대비 비율**로 둔다. 해상도나 모니터가 바뀌어도
   * 그대로 유효하고, 화면 밖으로 나갈 수 없다.
   *
   * 처음에는 8단계 칸 번호였는데, 한 칸이 124 DIP라 손을 뗄 때 창이 커서 밑에서
   * 최대 반 칸 빠져나갔다. 그러면 끌기 자리가 손 밑에 없어 **두 번째 끌기가
   * 시작되지 않는다**(2026-08-17 실기기). 튀지 않도록 놓은 자리를 그대로 쓴다.
   */
  readonly railPosition: number;
}

export const DEFAULT_SIDE_PIN_DEVICE_STATE: SidePinDeviceState = {
  schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  displayId: null,
  panelWidth: SIDE_PIN_WIDTH_DEFAULT,
  railPosition: SIDE_PIN_RAIL_POSITION_DEFAULT,
};

export function normalizeSidePinRailPosition(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SIDE_PIN_RAIL_POSITION_DEFAULT;
  return Math.min(1, Math.max(0, value));
}

/**
 * 저장본에서 손잡이 위치를 읽는다.
 *
 * 8단계 칸 번호로 저장된 개발본이 남아 있어 비율로 옮겨 준다. 출시 후에는 지워도 된다.
 */
function readRailPosition(raw: {
  readonly railPosition?: unknown;
  readonly railSlot?: unknown;
}): number {
  if (raw.railPosition !== undefined) return normalizeSidePinRailPosition(raw.railPosition);
  if (typeof raw.railSlot === 'number' && Number.isFinite(raw.railSlot)) {
    return normalizeSidePinRailPosition(raw.railSlot / LEGACY_RAIL_SLOT_MAX);
  }
  return SIDE_PIN_RAIL_POSITION_DEFAULT;
}

/**
 * 모니터 식별자를 정규화한다.
 *
 * Electron이 숫자로 주는 값과 파일에 문자열로 저장된 값을 모두 받아 문자열로 맞춘다.
 * 빈 문자열이나 알 수 없는 타입은 "고르지 않음"(null)으로 본다.
 */
export function normalizeSidePinDisplayId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 저장된 파일 내용을 안전한 기기 상태로 정규화한다.
 *
 * 파일 누락·파손·구버전·범위 밖 값 어느 경우에도 예외를 던지지 않고 기본값으로 채운다.
 * 이 파일 하나가 깨졌다고 옆핀이 아예 안 뜨면, 사용자는 원인을 알 방법이 없다.
 */
export function normalizeSidePinDeviceState(value: unknown): SidePinDeviceState {
  if (value === null || typeof value !== 'object') {
    return DEFAULT_SIDE_PIN_DEVICE_STATE;
  }
  const raw = value as Partial<Record<keyof SidePinDeviceState, unknown>>;

  return {
    schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
    displayId: normalizeSidePinDisplayId(raw.displayId),
    panelWidth: clampSidePinWidth(raw.panelWidth),
    railPosition: readRailPosition(
      raw as { readonly railPosition?: unknown; readonly railSlot?: unknown },
    ),
  };
}
