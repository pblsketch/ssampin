/**
 * 회귀 방지 — 위젯 손잡이 탭(드래그/숨기기) 배치 계약.
 *
 * 배경(사용자 신고 2026-08-11):
 *   위젯 14종의 헤더는 모두 "왼쪽 제목 / 오른쪽 자체 버튼" 구조다.
 *   시스템 손잡이를 카드 상단 **오른쪽**에 띄우면 미니 캘린더의 ‹ 8월 ›,
 *   자주 쓰는 도구의 ✏️ 편집 버튼과 같은 자리를 다투게 된다.
 *   또한 이전 구현의 60×60 투명 hover zone은 카드 콘텐츠 위(z-10)를 덮어
 *   그 안에 들어간 위젯 자체 버튼의 **클릭 자체를 삼켰다**.
 *
 * 손잡이는 상단 **왼쪽(제목 줄)** 로 옮겼다. 제목은 읽기 전용 텍스트라
 * 호버 중 잠깐 가려도 조작을 막지 않지만, 오른쪽 버튼은 가리면 누를 수 없다.
 *
 * 이 테스트는 소스 문자열을 스캔해 다음 3가지를 고정한다.
 *   1. 손잡이는 카드 상단 **왼쪽**(left-*)에 배치한다.
 *   2. 카드 상단 오른쪽 절대배치(right-*)를 손잡이에 다시 쓰지 않는다.
 *   3. 숨김 상태의 손잡이는 pointer-events-none 이어야 한다
 *      (투명 요소가 클릭을 가로채는 회귀 차단).
 *
 * 정적 분석 패턴은 widgetItemHoverCue.spec.tsx 를 미러링한다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// process.cwd()는 Vitest 실행 위치 = 저장소 루트
const SOURCE_PATH = resolve(process.cwd(), 'src/widgets/components/SortableWidget.tsx');

function readSource(): string {
  try {
    return readFileSync(SOURCE_PATH, 'utf-8');
  } catch (err) {
    throw new Error(
      `[손잡이 배치] 소스 읽기 실패: ${SOURCE_PATH} — ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/** 손잡이 탭 컨테이너 블록(data-widget-handle-tab 가 붙은 div)을 추출한다. */
function extractHandleTabBlock(src: string): string {
  const marker = 'data-widget-handle-tab';
  const markerIdx = src.indexOf(marker);
  expect(
    markerIdx,
    '[손잡이 배치] data-widget-handle-tab 마커를 찾지 못했습니다. 손잡이 탭 컨테이너에 마커를 유지하세요.',
  ).toBeGreaterThan(-1);

  // 마커부터 여는 태그가 닫히는 '>' 까지 = 컨테이너의 속성 영역
  const closeIdx = src.indexOf('>', markerIdx);
  expect(closeIdx, '[손잡이 배치] 손잡이 탭 여는 태그가 닫히지 않았습니다').toBeGreaterThan(
    markerIdx,
  );
  return src.slice(markerIdx, closeIdx);
}

describe('위젯 손잡이 탭 배치 계약', () => {
  it('손잡이는 카드 상단 왼쪽(제목 줄)에 배치된다', () => {
    const block = extractHandleTabBlock(readSource());

    expect(
      /\bleft-[\d.]/.test(block),
      '[손잡이 배치] 손잡이에 left-* 절대배치가 없습니다. 위젯 자체 버튼이 없는 왼쪽(제목 줄)에 두어야 합니다.',
    ).toBe(true);

    expect(
      /\btop-[\d.]/.test(block),
      '[손잡이 배치] 손잡이가 카드 상단(top-*)에 있어야 합니다.',
    ).toBe(true);
  });

  it('손잡이를 카드 상단 오른쪽으로 되돌리지 않는다', () => {
    const block = extractHandleTabBlock(readSource());

    expect(
      /\bright-[\d.]/.test(block),
      '[손잡이 배치] 손잡이에 right-* 절대배치가 있습니다. 위젯 헤더의 자체 버튼 자리(오른쪽)와 겹쳐 버튼을 못 누르게 됩니다.',
    ).toBe(false);
  });

  it('카드 위로 걸치는 배치(-translate-y-*)를 쓰지 않는다', () => {
    const block = extractHandleTabBlock(readSource());

    // 대시보드 컨테이너가 overflow-y-auto — 첫 줄 카드에서 위로 튀어나온 부분은 잘린다.
    expect(
      /-translate-y-/.test(block),
      '[손잡이 배치] 손잡이가 카드 위로 걸쳐 있습니다. 대시보드가 세로 스크롤 영역이라 첫 줄에서 잘립니다.',
    ).toBe(false);
  });

  it('숨김 상태의 손잡이 탭은 클릭을 가로채지 않는다(pointer-events-none)', () => {
    const block = extractHandleTabBlock(readSource());

    expect(
      /pointer-events-none/.test(block),
      '[손잡이 배치] 숨김 상태에 pointer-events-none 이 없습니다. 투명한 손잡이가 위젯 버튼 클릭을 삼킵니다.',
    ).toBe(true);
  });

  it('카드 콘텐츠를 덮는 투명 hover zone을 다시 도입하지 않는다', () => {
    const src = readSource();

    // 이전 구현: <div className="absolute top-0 right-0 w-[60px] h-[60px] z-10" ... />
    expect(
      /w-\[\d+px\]\s+h-\[\d+px\][^"]*z-\d/.test(src),
      '[손잡이 배치] 고정 크기 투명 오버레이가 감지되었습니다. 카드 위를 덮는 zone은 위젯 자체 버튼의 클릭을 삼킵니다.',
    ).toBe(false);
  });
});
