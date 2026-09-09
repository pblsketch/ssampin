/**
 * @vitest-environment jsdom
 *
 * 학급 목록 세 번째 줄 — 수업 요일·교시.
 *
 * 회귀 대상 두 가지:
 *  - 덜 확실한 매칭(2·3단계)의 안내가 **화면 낭독기에도** 닿는가. `title`만 붙이면 마우스
 *    사용자에게만 전달되고, 그 사실은 눈으로 봐서는 드러나지 않는다.
 *  - 확실한 매칭에는 점선을 붙이지 않는가. 전부 점선이 되면 구분이 사라진다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClassScheduleLine } from './ClassScheduleLine';

afterEach(() => cleanup());

describe('ClassScheduleLine', () => {
  it('요일·교시를 그대로 보여주고 완전한 문장을 툴팁으로 단다', () => {
    render(
      <ClassScheduleLine
        schedule={{
          label: '수3 · 금5',
          fullText: '매주 수요일 3교시, 금요일 5교시 수업',
          uncertain: false,
        }}
      />,
    );

    const line = screen.getByTitle('매주 수요일 3교시, 금요일 5교시 수업');
    expect(line.textContent).toContain('수3 · 금5');
  });

  it('확실한 매칭에는 점선을 붙이지 않는다', () => {
    const { container } = render(
      <ClassScheduleLine
        schedule={{ label: '수3', fullText: '매주 수요일 3교시 수업', uncertain: false }}
      />,
    );

    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('덜 확실한 매칭은 점선 + 낭독용 안내를 함께 남긴다', () => {
    const { container } = render(
      <ClassScheduleLine
        schedule={{
          label: '수3',
          fullText: '매주 수요일 3교시 수업 — 교실 이름만 맞아서 넣었어요',
          uncertain: true,
          confidenceNote: '교실 이름만 맞아서 넣었어요',
        }}
      />,
    );

    expect(container.querySelector('.border-dashed')).not.toBeNull();
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toContain('교실 이름만 맞아서 넣었어요');
  });

  it('아이콘은 낭독에서 뺀다 — 정보가 텍스트에 이미 있다', () => {
    const { container } = render(
      <ClassScheduleLine
        schedule={{ label: '수3', fullText: '매주 수요일 3교시 수업', uncertain: false }}
      />,
    );

    const icon = container.querySelector('.material-symbols-outlined');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });
});
