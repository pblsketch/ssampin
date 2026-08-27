import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIDE_PIN_DEVICE_STATE,
  SIDE_PIN_RAIL_POSITION_DEFAULT,
  SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  normalizeSidePinDeviceState,
  normalizeSidePinDisplayId,
  normalizeSidePinRailPosition,
} from './SidePinDeviceState';
import {
  SIDE_PIN_WIDTH_DEFAULT,
  SIDE_PIN_WIDTH_MAX,
  SIDE_PIN_WIDTH_MIN,
  clampSidePinWidth,
} from '../valueObjects/SidePinWidth';

describe('clampSidePinWidth', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampSidePinWidth(400)).toBe(400);
    expect(clampSidePinWidth(SIDE_PIN_WIDTH_MIN)).toBe(SIDE_PIN_WIDTH_MIN);
    expect(clampSidePinWidth(SIDE_PIN_WIDTH_MAX)).toBe(SIDE_PIN_WIDTH_MAX);
  });

  it('하한보다 좁으면 360으로 넓힌다 — 메모 편집기가 눌리지 않도록', () => {
    expect(clampSidePinWidth(100)).toBe(SIDE_PIN_WIDTH_MIN);
    expect(clampSidePinWidth(359)).toBe(SIDE_PIN_WIDTH_MIN);
    expect(clampSidePinWidth(0)).toBe(SIDE_PIN_WIDTH_MIN);
    expect(clampSidePinWidth(-500)).toBe(SIDE_PIN_WIDTH_MIN);
  });

  it('상한보다 넓으면 460으로 줄인다 — 작업 화면을 과하게 가리지 않도록', () => {
    expect(clampSidePinWidth(461)).toBe(SIDE_PIN_WIDTH_MAX);
    expect(clampSidePinWidth(99999)).toBe(SIDE_PIN_WIDTH_MAX);
  });

  it('소수점은 반올림해 정수 DIP로 맞춘다', () => {
    expect(clampSidePinWidth(400.4)).toBe(400);
    expect(clampSidePinWidth(400.6)).toBe(401);
  });

  it('숫자가 아니거나 계산 불가능한 값은 기본값 400', () => {
    expect(clampSidePinWidth(undefined)).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(clampSidePinWidth(null)).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(clampSidePinWidth('400')).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(clampSidePinWidth(NaN)).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(clampSidePinWidth(Infinity)).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(clampSidePinWidth(-Infinity)).toBe(SIDE_PIN_WIDTH_DEFAULT);
  });
});

describe('normalizeSidePinDisplayId', () => {
  it('Electron이 숫자로 주는 display id를 문자열로 맞춘다', () => {
    expect(normalizeSidePinDisplayId(2528732444)).toBe('2528732444');
  });

  it('파일에 문자열로 저장된 값은 그대로 쓴다', () => {
    expect(normalizeSidePinDisplayId('2528732444')).toBe('2528732444');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeSidePinDisplayId('  abc  ')).toBe('abc');
  });

  it('비었거나 알 수 없는 값은 "고르지 않음"(null)', () => {
    expect(normalizeSidePinDisplayId('')).toBeNull();
    expect(normalizeSidePinDisplayId('   ')).toBeNull();
    expect(normalizeSidePinDisplayId(undefined)).toBeNull();
    expect(normalizeSidePinDisplayId(null)).toBeNull();
    expect(normalizeSidePinDisplayId(NaN)).toBeNull();
    expect(normalizeSidePinDisplayId({})).toBeNull();
  });
});

describe('normalizeSidePinDeviceState', () => {
  it('파일이 없으면 기본값 — 주 모니터, 너비 400', () => {
    expect(normalizeSidePinDeviceState(undefined)).toEqual(DEFAULT_SIDE_PIN_DEVICE_STATE);
    expect(DEFAULT_SIDE_PIN_DEVICE_STATE.displayId).toBeNull();
    expect(DEFAULT_SIDE_PIN_DEVICE_STATE.panelWidth).toBe(SIDE_PIN_WIDTH_DEFAULT);
    expect(DEFAULT_SIDE_PIN_DEVICE_STATE.railPosition).toBe(SIDE_PIN_RAIL_POSITION_DEFAULT);
  });

  it('정상 저장값을 보존한다', () => {
    expect(
      normalizeSidePinDeviceState({
        schemaVersion: 1,
        displayId: '12345',
        panelWidth: 420,
        railPosition: 0.6,
      }),
    ).toEqual({
      schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
      displayId: '12345',
      // 단서가 없던 옛 저장본 — 번호로만 찾는다
      displayHint: null,
      panelWidth: 420,
      railPosition: 0.6,
    });
  });

  it('파일이 손상돼도 예외를 던지지 않는다 — 옆핀이 아예 안 뜨는 상황을 막는다', () => {
    expect(() => normalizeSidePinDeviceState('{{망가진 JSON')).not.toThrow();
    expect(normalizeSidePinDeviceState('{{망가진 JSON')).toEqual(DEFAULT_SIDE_PIN_DEVICE_STATE);
    expect(normalizeSidePinDeviceState([])).toEqual({
      schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
      displayId: null,
      displayHint: null,
      panelWidth: SIDE_PIN_WIDTH_DEFAULT,
      railPosition: SIDE_PIN_RAIL_POSITION_DEFAULT,
    });
  });

  it('손잡이 위치는 0~1 범위로 clamp하고 누락 시 기본 위치를 쓴다', () => {
    expect(normalizeSidePinRailPosition(undefined)).toBe(SIDE_PIN_RAIL_POSITION_DEFAULT);
    expect(normalizeSidePinRailPosition(-10)).toBe(0);
    expect(normalizeSidePinRailPosition(0.46)).toBe(0.46);
    expect(normalizeSidePinRailPosition(99)).toBe(1);
  });

  it('8단계 칸 번호로 저장된 예전 개발본을 비율로 옮긴다', () => {
    // 칸 모델은 놓을 때 창이 커서 밑에서 튀어 두 번째 끌기를 막았다(2026-08-17).
    // 이미 만들어진 파일이 남아 있어, 같은 자리를 가리키도록 옮겨 준다.
    expect(normalizeSidePinDeviceState({ railSlot: 0 }).railPosition).toBe(0);
    expect(normalizeSidePinDeviceState({ railSlot: 7 }).railPosition).toBe(1);
    expect(normalizeSidePinDeviceState({ railSlot: 3 }).railPosition).toBe(3 / 7);
    // 새 값이 있으면 그쪽이 정본이다
    expect(normalizeSidePinDeviceState({ railSlot: 0, railPosition: 0.8 }).railPosition).toBe(0.8);
  });

  it('범위 밖 너비는 잘라내고 나머지 값은 살린다', () => {
    const result = normalizeSidePinDeviceState({ displayId: '77', panelWidth: 5000 });
    expect(result.displayId).toBe('77');
    expect(result.panelWidth).toBe(SIDE_PIN_WIDTH_MAX);
  });

  it('구버전 schemaVersion은 현재 버전으로 올린다', () => {
    expect(normalizeSidePinDeviceState({ schemaVersion: 0 }).schemaVersion).toBe(
      SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
    );
  });
});
