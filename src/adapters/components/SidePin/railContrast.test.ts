/**
 * 손잡이 칩이 배경과 실제로 구분되는지 검사한다.
 *
 * 2026-08-14 실제 사고: 칩 배경으로 `sp-card`를 골랐는데, 라이트 모드에서
 * `sp-surface`(#f7f6f3)와 `sp-card`(#f5f5f3)는 **RGB 차이가 2·1·0**이었다.
 * 코드는 멀쩡했고 테스트도 전부 통과했지만, 화면에는 아무것도 없는 흰 막대만 보였다.
 *
 * 원인은 "토큰이 존재하는가"만 확인하고 **"값이 실제로 다른가"는 확인하지 않은 것**이다.
 * 클래스 이름을 아무리 검사해도 이 실수는 잡히지 않는다. 그래서 색 값 자체를 본다.
 *
 * 손잡이는 늘 화면에 떠 있고 폭이 1.4cm뿐이라, 대비가 없으면 기능 자체가 안 보인다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../../../index.css'), 'utf-8');

/** 손잡이 바탕 */
const BACKGROUND_TOKEN = '--sp-surface';
/** 칩 바탕 — `SidePinRail.tsx`가 쓰는 값과 같아야 한다 */
const CHIP_TOKEN = '--sp-border';

/**
 * 사람이 "다른 색"으로 알아볼 수 있는 최소 차이.
 *
 * 사고 당시 차이는 1.6이었고, 지금 쓰는 조합은 13이다. 그 사이에 선을 긋는다.
 */
const MIN_DIFFERENCE = 6;

/** 주제(라이트·고대비 등)마다 한 번씩, 정의된 순서대로 값을 모은다 */
function readTokenValues(token: string): string[] {
  return [...CSS.matchAll(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map(
    (m) => m[1] as string,
  );
}

/** 밝기(0~255). 사람 눈이 초록에 민감한 것을 반영한 통상 가중치 */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('손잡이 칩이 배경과 구분되는가', () => {
  const backgrounds = readTokenValues(BACKGROUND_TOKEN);
  const chips = readTokenValues(CHIP_TOKEN);

  test('두 토큰을 실제로 찾았다 — 못 찾고 빈 목록끼리 비교하면 무의미하게 통과한다', () => {
    expect(backgrounds.length).toBeGreaterThan(0);
    expect(chips.length).toBe(backgrounds.length);
  });

  test('모든 주제에서 칩과 배경의 밝기 차이가 충분하다', () => {
    const tooClose = backgrounds
      .map((bg, i) => ({ bg, chip: chips[i] as string }))
      .map((pair) => ({ ...pair, diff: Math.abs(luminance(pair.bg) - luminance(pair.chip)) }))
      .filter((pair) => pair.diff < MIN_DIFFERENCE);

    expect(tooClose).toEqual([]);
  });

  test('손잡이가 실제로 이 토큰을 쓴다 — 코드가 다른 색을 쓰면 위 검사가 헛돈다', () => {
    const source = readFileSync(resolve(__dirname, 'SidePinRail.tsx'), 'utf-8');
    expect(source).toContain(`bg-${CHIP_TOKEN.replace('--', '')}`);
  });
});

describe('위젯 칸과 메모 칸이 구분되는가', () => {
  // 패널 바탕은 sp-bg, 칸 머리말과 위젯 카드는 한 단계 어두운 sp-surface를 쓴다.
  const bases = readTokenValues('--sp-bg');
  const raised = readTokenValues(BACKGROUND_TOKEN);

  test('바탕과 머리말 띠의 밝기 차이가 충분하다', () => {
    // 처음에는 sp-surface 위에 sp-card를 얹었는데 밝기 차이가 1.2뿐이라,
    // 두 칸이 눈으로 전혀 갈라지지 않았다(2026-08-14 사용자 지적).
    const tooClose = bases
      .map((base, i) => ({ base, raised: raised[i] as string }))
      .map((pair) => ({ ...pair, diff: Math.abs(luminance(pair.base) - luminance(pair.raised)) }))
      .filter((pair) => pair.diff < MIN_DIFFERENCE);

    expect(tooClose).toEqual([]);
  });

  test('두 칸이 실제로 이 조합을 쓴다', () => {
    const panel = readFileSync(resolve(__dirname, 'SidePinPanel.tsx'), 'utf-8');
    const header = readFileSync(resolve(__dirname, 'SidePinZoneHeader.tsx'), 'utf-8');

    // 패널 바탕은 설정한 투명도가 실린 색을 인라인으로 칠한다(`--sp-widget-rgb` = 주제 바탕색).
    // 클래스로는 투명도를 못 준다 — 이 저장소에서 bg-sp-*/50 은 CSS가 만들어지지 않는다.
    expect(panel).toContain('backgroundColor');
    expect(header).toContain('bg-sp-surface');
  });

  test('칸 바탕을 따로 칠하지 않는다 — 칠하면 투명도가 가려진다', () => {
    // 칸이 자기 배경을 칠하면 패널이 깔아 둔 반투명 배경을 통째로 덮어,
    // 투명도를 아무리 낮춰도 뒤가 비치지 않는다.
    for (const file of ['SidePinMemoList.tsx', 'SidePinWidgetZone.tsx']) {
      const source = readFileSync(resolve(__dirname, file), 'utf-8');
      const sectionTag = source.match(/<section[^>]*>/)?.[0] ?? '';
      expect(sectionTag).not.toMatch(/bg-sp-/);
    }
  });

  test('구분이 사라지는 sp-card 조합으로 되돌아가지 않는다', () => {
    // sp-card 는 sp-surface 와 사실상 같은 색이다. 칸이나 카드 바탕으로 쓰면
    // 코드는 멀쩡한데 화면에서는 아무 경계도 보이지 않는다.
    for (const file of ['SidePinPanel.tsx', 'SidePinZoneHeader.tsx', 'SidePinWidgetZone.tsx']) {
      const source = readFileSync(resolve(__dirname, file), 'utf-8');
      expect(source).not.toMatch(/(?<!hover:)bg-sp-card\b/);
    }
  });
});
