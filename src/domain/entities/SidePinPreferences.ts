/**
 * 옆핀에서 기기 간에 동기화되는 사용자 선택.
 *
 * 여기에는 "어느 모니터", "패널 너비" 같은 기기마다 달라지는 값을 넣지 않는다.
 * 그런 값을 동기화 설정에 넣으면 기기끼리 서로의 값을 덮어써서 매 주기 업로드와
 * 가짜 충돌이 생긴다 — 이미 겪은 문제다(`src/domain/entities/Settings.ts:365-373`).
 * 기기 전용 값은 [[SidePinDeviceState]]가 따로 가진다.
 */

/** 옆핀 동기화 설정 스키마 버전 */
export const SIDE_PIN_PREFERENCES_SCHEMA_VERSION = 1;

/** 옆핀에 올릴 수 있는 위젯 최대 개수 (기획서 §3) */
export const SIDE_PIN_MAX_WIDGETS = 4;

/**
 * 메모 목록 정렬 기준.
 *
 * 1차는 최근 수정순 하나뿐이다. `고정 메모 우선`은 `Memo`에 `pinned` 필드가 없어
 * 스키마 변경이 필요하므로 후속 기능으로 미뤘다(기획서 §3 1차 제외).
 */
export type SidePinMemoSort = 'recent';

export interface SidePinPreferences {
  /**
   * 옆핀 사용 여부.
   *
   * 기본값이 false인 것은 의도다. 성능 게이트를 통과한 출시 후보에서만 true로 바꾼다
   * (기획서 §4). 검증 전 빌드에서 상시 손잡이가 켜지면 측정 기준이 흔들린다.
   */
  readonly enabled: boolean;
  /** 옆핀 위젯 영역에 표시할 위젯 id와 순서 */
  readonly widgetItemIds: readonly string[];
  readonly memoSort: SidePinMemoSort;
  readonly schemaVersion: number;
}

export const DEFAULT_SIDE_PIN_PREFERENCES: SidePinPreferences = {
  enabled: false,
  widgetItemIds: [],
  memoSort: 'recent',
  schemaVersion: SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
};

/**
 * 위젯 id 목록을 정규화한다.
 *
 * 같은 위젯이 두 번 들어오면 옆핀에 같은 카드가 겹쳐 보이므로 중복을 제거하고,
 * 최대 개수를 넘으면 앞에서부터 자른다. 순서는 사용자가 정한 것이므로 보존한다.
 */
export function normalizeSidePinWidgetIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= SIDE_PIN_MAX_WIDGETS) break;
  }
  return result;
}

/**
 * 저장된 값을 안전한 옆핀 설정으로 정규화한다.
 *
 * 설정 파일이 손상되거나 예전 버전에서 올라와도 예외를 던지지 않는다.
 * 옆핀 설정 하나 때문에 앱 전체 설정 로드가 실패하면 안 되기 때문이다.
 */
export function normalizeSidePinPreferences(value: unknown): SidePinPreferences {
  if (value === null || typeof value !== 'object') {
    return DEFAULT_SIDE_PIN_PREFERENCES;
  }
  const raw = value as Partial<Record<keyof SidePinPreferences, unknown>>;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
    widgetItemIds: normalizeSidePinWidgetIds(raw.widgetItemIds),
    // 1차 허용값은 'recent' 하나뿐이다. 나중에 'pinned-first'가 생기면
    // 여기에서 허용 목록을 검사하도록 바꾼다.
    memoSort: 'recent',
    schemaVersion: SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
  };
}
