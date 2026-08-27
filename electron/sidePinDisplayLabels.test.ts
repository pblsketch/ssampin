/**
 * 모니터 이름 짓기 테스트.
 *
 * 여기서 확인하는 것은 "선생님이 화면을 보고 어느 것인지 고를 수 있는가"다.
 * 좌표·배율은 실제 장비 없이 값으로만 넣는다.
 */
import { describe, expect, test } from 'vitest';
import { describeSidePinDisplays } from './sidePinDisplayLabels';
import type { SidePinDisplayInfo } from './sidePinGeometry';

const PRIMARY: SidePinDisplayInfo = {
  id: '1',
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

describe('자리 표시', () => {
  test('오른쪽에 붙은 보조 모니터를 오른쪽이라고 부른다', () => {
    const right: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    };

    const [first, second] = describeSidePinDisplays([PRIMARY, right], '1');

    expect(first?.menuLabel).toBe('모니터 1 · 주 모니터 (1920×1080)');
    expect(second?.menuLabel).toBe('모니터 2 · 오른쪽 (2560×1440)');
  });

  test('음수 좌표 보조 모니터는 왼쪽이라고 부른다', () => {
    const left: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, left], '1');

    expect(second?.position).toBe('왼쪽');
  });

  test('세로로 쌓은 배치는 위·아래로 부른다', () => {
    const above: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      bounds: { x: 0, y: -1080, width: 1920, height: 1080 },
      workArea: { x: 0, y: -1080, width: 1920, height: 1040 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, above], '1');

    expect(second?.position).toBe('위');
  });

  test('가로·세로가 함께 어긋나면 더 많이 벌어진 쪽만 말한다', () => {
    // 세로로 200 어긋났지만 가로로 1920 벌어졌다 — "오른쪽 위"라고 겹쳐 부르지 않는다
    const diagonal: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      bounds: { x: 1920, y: -200, width: 1920, height: 1080 },
      workArea: { x: 1920, y: -200, width: 1920, height: 1040 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, diagonal], '1');

    expect(second?.position).toBe('오른쪽');
  });
});

describe('이름 짓기', () => {
  test('모니터 이름이 쓸 만하면 그대로 쓴다', () => {
    const named: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      label: 'DELL U2720Q',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, named], '1');

    expect(second?.name).toBe('DELL U2720Q');
    expect(second?.menuLabel).toBe('DELL U2720Q · 오른쪽 (2560×1440)');
  });

  test('Windows 장치 이름은 번호로 대신한다', () => {
    const deviceName: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      label: '\\.\\DISPLAY2',
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, deviceName], '1');

    // 장치 이름은 번호보다 알아보기 어렵다 — 보여 줄 이유가 없다
    expect(second?.name).toBe('모니터 2');
  });

  test('이름이 비었거나 DISPLAY1 같은 값이면 번호를 쓴다', () => {
    const blank: SidePinDisplayInfo = { ...PRIMARY, id: '2', label: '   ' };
    const generic: SidePinDisplayInfo = { ...PRIMARY, id: '3', label: 'DISPLAY1' };

    const choices = describeSidePinDisplays([PRIMARY, blank, generic], '1');

    expect(choices[1]?.name).toBe('모니터 2');
    expect(choices[2]?.name).toBe('모니터 3');
  });
});

describe('해상도와 배율', () => {
  test('배율이 100%가 아니면 함께 적는다', () => {
    const scaled: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1.5,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, scaled], '1');

    expect(second?.scalePercent).toBe(150);
    expect(second?.menuLabel).toBe('모니터 2 · 오른쪽 (2560×1440, 배율 150%)');
  });

  test('배율 정보가 없으면 100%로 본다', () => {
    const noScale: SidePinDisplayInfo = {
      id: '2',
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, noScale], '1');

    expect(second?.scalePercent).toBe(100);
    expect(second?.menuLabel).toBe('모니터 2 · 오른쪽 (1920×1080)');
  });

  test('전체 영역 정보가 없으면 작업 영역으로 대신한다', () => {
    // 작업 표시줄을 뺀 값이라도, 아무것도 못 보여주는 것보다는 낫다
    const workAreaOnly: SidePinDisplayInfo = {
      id: '2',
      scaleFactor: 1,
      workArea: { x: 1920, y: 0, width: 1600, height: 860 },
    };

    const [, second] = describeSidePinDisplays([PRIMARY, workAreaOnly], '1');

    expect(second?.resolution).toBe('1600×860');
  });
});

describe('경계', () => {
  test('모니터가 하나뿐이면 주 모니터 하나만 나온다', () => {
    const choices = describeSidePinDisplays([PRIMARY], '1');

    expect(choices).toHaveLength(1);
    expect(choices[0]?.isPrimary).toBe(true);
    expect(choices[0]?.menuLabel).toBe('모니터 1 · 주 모니터 (1920×1080)');
  });

  test('모니터가 하나도 없으면 빈 목록이다', () => {
    expect(describeSidePinDisplays([], '1')).toEqual([]);
  });

  test('주 모니터 번호가 목록에 없어도 무너지지 않는다', () => {
    // 목록과 주 모니터 번호가 잠깐 어긋날 수 있다(모니터를 빼는 순간 등)
    const choices = describeSidePinDisplays([PRIMARY], '없는번호');

    expect(choices).toHaveLength(1);
    expect(choices[0]?.isPrimary).toBe(false);
    // 자기 자신을 기준으로 재므로 '같은 자리'가 된다 — 빈 값이나 예외가 아니어야 한다
    expect(choices[0]?.position).toBe('같은 자리');
  });

  test('순서를 다시 정렬하지 않는다', () => {
    // Electron이 준 순서가 곧 사용자가 디스플레이 설정에서 본 번호 순서다
    const far: SidePinDisplayInfo = {
      ...PRIMARY,
      id: '2',
      bounds: { x: -5000, y: 0, width: 1920, height: 1080 },
    };

    const choices = describeSidePinDisplays([far, PRIMARY], '1');

    expect(choices.map((c) => c.id)).toEqual(['2', '1']);
    expect(choices[0]?.name).toBe('모니터 1');
  });
});
