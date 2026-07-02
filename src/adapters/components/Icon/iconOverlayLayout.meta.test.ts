/**
 * 아이콘 모드 오버레이 배치 메타테스트 (v2.2.7).
 *
 * 2026-07-02 진단에서 발견된 버그 부류의 재발 방지:
 *   말풍선(PinBubble)·코치마크·컨텍스트 메뉴가 뷰포트(=창) 기준 absolute/fixed 로
 *   자기 배치를 하면, 64×64 고정 창에서 전부 화면 밖에 그려져 보이지 않는다.
 *   배치 책임은 IconWindow 의 오버레이 컨테이너(핀 옆, 확장 방향)에만 있다.
 *
 * 소스 텍스트 검사(런타임 아님) — 실제 창 확장은 electron/iconWindowGeometry.test.ts 가,
 * 알림 내용은 pinPresence.test.ts 가 담당한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (name: string): string => readFileSync(resolve(__dirname, name), 'utf-8');

describe('아이콘 오버레이 컴포넌트는 자기 배치를 하지 않는다', () => {
  // 뷰포트 기준 자기 배치 클래스 — 이 클래스들이 다시 들어오면 64×64 창에서
  // 화면 밖 렌더 버그가 재발한다.
  const FORBIDDEN = ['bottom-full', 'top-full', 'fixed'];

  for (const file of ['PinBubble.tsx', 'CoachMark.tsx', 'IconContextMenu.tsx']) {
    it(`${file} 에 뷰포트 기준 배치 클래스가 없다`, () => {
      const src = read(file);
      for (const cls of FORBIDDEN) {
        // className 문자열 안의 단어 단위 사용만 금지 (주석 언급은 허용)
        const inClassName = new RegExp(`className[^>]*[\\s'"\`]${cls}[\\s'"\`]`);
        expect(
          inClassName.test(src),
          `${file} 이 '${cls}' 로 자기 배치 중 — IconWindow 오버레이 컨테이너로 옮길 것`,
        ).toBe(false);
      }
    });
  }
});

describe('IconWindow 는 확장 창 프로토콜을 사용한다', () => {
  it('창 확장 요청(iconSetExpanded)과 오버레이 컨테이너가 존재한다', () => {
    const src = read('IconWindow.tsx');
    expect(src).toContain('iconSetExpanded');
    expect(src).toContain('iconSetMouseIgnore');
    // 오버레이는 핀 높이(64)+여백 만큼 떨어진 위치에서 열린다
    expect(src).toContain('bottom-[72px]');
    expect(src).toContain('top-[72px]');
  });

  it('main 주도 레이아웃 변경(onIconLayout)과 진입 통지(onIconShown)를 구독한다', () => {
    const src = read('IconWindow.tsx');
    expect(src).toContain('onIconLayout');
    expect(src).toContain('onIconShown');
  });
});
