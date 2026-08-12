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
}

export const DEFAULT_SIDE_PIN_DEVICE_STATE: SidePinDeviceState = {
  schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  displayId: null,
  panelWidth: SIDE_PIN_WIDTH_DEFAULT,
};

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
  };
}
