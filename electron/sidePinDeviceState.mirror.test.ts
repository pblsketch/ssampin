/**
 * 미러 동치 테스트 — 도메인 정본과 electron 미러가 같은 입력에 같은 답을 내는지 강제한다.
 *
 * electron은 rootDir 제약으로 @domain을 import할 수 없어 순수 함수를 의도적으로 복제한다
 * (archiveRules ↔ archiveManager 선례). 이 테스트가 빨간불이면 한쪽만 고친 것이다 —
 * 정본(src/domain/entities/SidePinDeviceState.ts, src/domain/valueObjects/SidePinWidth.ts)을
 * 먼저 고치고 미러를 맞출 것.
 */
import { describe, expect, test } from 'vitest';
import * as domainState from '../src/domain/entities/SidePinDeviceState';
import * as domainWidth from '../src/domain/valueObjects/SidePinWidth';
import * as mirror from './sidePinDeviceState';

/** 정상·경계·손상 값을 섞은 코퍼스 */
const WIDTH_CORPUS: readonly unknown[] = [
  400,
  360,
  460,
  359,
  461,
  0,
  -1,
  -9999,
  99999,
  400.4,
  400.5,
  400.6,
  NaN,
  Infinity,
  -Infinity,
  '400',
  '',
  null,
  undefined,
  {},
  [],
  true,
];

const DISPLAY_ID_CORPUS: readonly unknown[] = [
  '2528732444',
  2528732444,
  0,
  -1,
  '  공백  ',
  '',
  '   ',
  null,
  undefined,
  NaN,
  Infinity,
  {},
  [],
  true,
  '한글-모니터',
];

const STATE_CORPUS: readonly unknown[] = [
  { schemaVersion: 1, displayId: '12345', panelWidth: 420 },
  { schemaVersion: 0, displayId: null, panelWidth: 400 },
  { schemaVersion: 99, displayId: 777, panelWidth: 5000 },
  { displayId: '  x  ', panelWidth: '넓게' },
  { panelWidth: 1 },
  { 모르는필드: true },
  {},
  [],
  null,
  undefined,
  '{{망가진 JSON',
  42,
  true,
];

describe('상수 동치', () => {
  test('너비 경계값이 같다', () => {
    expect(mirror.SIDE_PIN_WIDTH_MIN).toBe(domainWidth.SIDE_PIN_WIDTH_MIN);
    expect(mirror.SIDE_PIN_WIDTH_MAX).toBe(domainWidth.SIDE_PIN_WIDTH_MAX);
    expect(mirror.SIDE_PIN_WIDTH_DEFAULT).toBe(domainWidth.SIDE_PIN_WIDTH_DEFAULT);
  });

  test('스키마 버전이 같다', () => {
    expect(mirror.SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION).toBe(
      domainState.SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
    );
  });

  test('기본값이 같다', () => {
    expect(mirror.DEFAULT_SIDE_PIN_DEVICE_STATE).toEqual(domainState.DEFAULT_SIDE_PIN_DEVICE_STATE);
  });
});

describe('순수 함수 동치', () => {
  test.each(WIDTH_CORPUS.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
    'clampSidePinWidth(%s)',
    (_label, value) => {
      expect(mirror.clampSidePinWidth(value)).toBe(domainWidth.clampSidePinWidth(value));
    },
  );

  test.each(DISPLAY_ID_CORPUS.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
    'normalizeSidePinDisplayId(%s)',
    (_label, value) => {
      expect(mirror.normalizeSidePinDisplayId(value)).toBe(
        domainState.normalizeSidePinDisplayId(value),
      );
    },
  );

  test.each(STATE_CORPUS.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
    'normalizeSidePinDeviceState(%s)',
    (_label, value) => {
      expect(mirror.normalizeSidePinDeviceState(value)).toEqual(
        domainState.normalizeSidePinDeviceState(value),
      );
    },
  );
});
