/**
 * @vitest-environment jsdom
 *
 * SplitDivider — 폭 조절 손잡이.
 *
 * 여기서 확인하는 것은 "렌더가 되나" 가 아니라 **조절이 실제로 먹는가**다.
 * 특히 범위 제한(clamp)은 눈으로 확인하기 어려운 자리라 그물이 필요하다 —
 * 없으면 한쪽 영역이 0% 까지 찌그러져 못 쓰게 되는 것을 아무도 못 잡는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SplitDivider } from './SplitDivider';

// 이 저장소는 testing-library 자동 정리를 켜 두지 않았다. 안 지우면 이전 테스트의
// 손잡이가 화면에 남아 "separator 가 여러 개" 로 실패한다.
afterEach(cleanup);

function setup(value = 60, onChange = vi.fn()) {
  const ref = createRef<HTMLDivElement>();
  render(
    <div ref={ref}>
      <SplitDivider
        value={value}
        onChange={onChange}
        containerRef={ref}
        min={30}
        max={75}
        defaultValue={60}
        ariaLabel="달력과 이번 달 일정의 폭 조절"
      />
    </div>,
  );
  return { onChange, handle: screen.getByRole('separator') };
}

describe('SplitDivider', () => {
  it('스크린리더가 현재 비율과 범위를 읽을 수 있다', () => {
    const { handle } = setup(62);
    // jest-dom 매처를 쓰지 않는 저장소라 속성을 직접 읽어 비교한다.
    expect(handle.getAttribute('aria-valuenow')).toBe('62');
    expect(handle.getAttribute('aria-valuemin')).toBe('30');
    expect(handle.getAttribute('aria-valuemax')).toBe('75');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('방향키로 조절된다 (마우스 없이도 쓸 수 있어야 한다)', () => {
    const { onChange, handle } = setup(60);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(62);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(58);
  });

  it('최대값을 넘지 않는다 — 넘으면 일정 목록이 사라진다', () => {
    const { onChange, handle } = setup(75);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('최소값 아래로 내려가지 않는다 — 내려가면 달력이 사라진다', () => {
    const { onChange, handle } = setup(30);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('더블클릭하면 defaultValue 로 되돌아간다 (잘못 끌었을 때의 탈출구)', () => {
    const { onChange, handle } = setup(74);
    fireEvent.doubleClick(handle);
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('좁은 화면에서는 숨는다 — 위아래로 쌓이므로 좌우 조절이 의미 없다', () => {
    const { handle } = setup();
    // `hidden lg:flex` — 기본은 숨김, 넓을 때만 보인다.
    expect(handle.className).toContain('hidden');
    expect(handle.className).toContain('lg:flex');
  });
});
