/**
 * @vitest-environment jsdom
 *
 * 상단 정보 바의 작성 방식 배지(ADR-099 보강).
 *
 * 여기서 지키는 것:
 *  - 고른 방식마다 **이름과 요소 순서가 실제로 달라진다**(이 검사가 없으면 다시 고정 범례로 되돌아가도 아무도 모른다).
 *  - 색은 넷 그대로이고, 색점은 형광펜을 켰을 때만 붙는다. 이름은 껐을 때도 보인다.
 *  - 색만으로 뜻을 전하지 않는다: 순번·이름·역할 이름이 읽히는 문장에 들어간다.
 *  - 없어진 옛 초점 값이 저장돼 있어도 기존형으로 보인다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecordStyleLegend } from '../RecordStyleLegend';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';

afterEach(cleanup);

const text = (): string => screen.getByTestId('record-style-legend').textContent ?? '';

/** 화면에 적힌 순서대로인가. 이름이 다 있어도 순서가 틀리면 다른 글이 된다. */
function inOrder(all: string, parts: readonly string[]): boolean {
  let at = -1;
  for (const p of parts) {
    const next = all.indexOf(p, at + 1);
    if (next <= at) return false;
    at = next;
  }
  return true;
}

describe('작성 방식 배지 — 고른 방식이 그대로 보인다', () => {
  it('기본값이면 기존 순서 그대로: 교사 판단 → 동기·질문 → 탐구 과정 → 결과·적용', () => {
    render(<RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={true} />);
    const all = text();
    expect(all).toContain('질문에서 출발한 탐구 흐름 (기본)');
    expect(inOrder(all, ['교사 판단', '동기·질문', '탐구 과정', '결과·적용'])).toBe(true);
  });

  it('다른 방식을 고르면 이름도 요소도 달라진다', () => {
    const style: RecordWritingStyle = { ...DEFAULT_RECORD_WRITING_STYLE, focus: 'compareJudge' };
    render(<RecordStyleLegend style={style} highlightOn={true} />);
    const all = text();
    expect(all).toContain('자료를 견주어 판단한 과정');
    expect(
      inOrder(all, ['교사 판단', '쟁점·해석 문제', '비교 기준', '사용한 근거', '자신의 결론']),
    ).toBe(true);
    expect(all).not.toContain('탐구 과정');
  });

  it('행동특성은 과정 색이 잇달아도 요소 이름으로 갈린다', () => {
    const style: RecordWritingStyle = { ...DEFAULT_RECORD_WRITING_STYLE, focus: 'lifeRelation' };
    render(<RecordStyleLegend style={style} highlightOn={true} />);
    expect(inOrder(text(), ['반복 관찰된 특성', '대표 생활 장면', '자기관리·관계·책임'])).toBe(
      true,
    );
  });

  it('시작 방식을 바꾸면 교사 판단이 맨 뒤로 간다', () => {
    const style: RecordWritingStyle = { ...DEFAULT_RECORD_WRITING_STYLE, opening: 'performance' };
    render(<RecordStyleLegend style={style} highlightOn={true} />);
    expect(inOrder(text(), ['동기·질문', '탐구 과정', '결과·적용', '교사 판단'])).toBe(true);
  });

  it('없어진 옛 초점 값이 저장돼 있어도 기존형으로 보인다', () => {
    // 옛 저장값은 지금 타입에 없는 값이다. 실제 설정 파일에는 그대로 남아 있으므로 그 상황을 그대로 만든다.
    const style = {
      ...DEFAULT_RECORD_WRITING_STYLE,
      focus: 'achievement',
    } as unknown as RecordWritingStyle;
    render(<RecordStyleLegend style={style} highlightOn={false} />);
    expect(text()).toContain('질문에서 출발한 탐구 흐름 (기본)');
  });
});

describe('작성 방식 배지 — 형광펜 스위치와 읽히는 문장', () => {
  it('스위치를 꺼도 이름과 요소는 보이고, 색점만 사라진다', () => {
    const { rerender } = render(
      <RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={false} />,
    );
    expect(text()).toContain('질문에서 출발한 탐구 흐름 (기본)');
    expect(text()).toContain('동기·질문');
    expect(screen.queryAllByTestId('legend-role-dot')).toHaveLength(0);

    rerender(<RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={true} />);
    expect(screen.getAllByTestId('legend-role-dot')).toHaveLength(4);
  });

  it('읽히는 문장에 순번과 역할 이름이 함께 들어간다', () => {
    render(<RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={true} />);
    const all = text();
    expect(all).toContain('1번째 교사 판단(교사 평가)');
    expect(all).toContain('3번째 탐구 과정(과정)');
    // 요소 이름이 곧 역할 이름이면 같은 말을 두 번 읽지 않는다.
    expect(all).toContain('2번째 동기·질문,');
  });
});

describe('작성 방식 배지 — 누르면 고르는 자리로', () => {
  it('onOpen 이 있으면 단추이고 누르면 불린다', () => {
    const onOpen = vi.fn();
    render(
      <RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={true} onOpen={onOpen} />,
    );
    const el = screen.getByTestId('record-style-legend');
    expect(el.tagName).toBe('BUTTON');
    fireEvent.click(el);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('onOpen 이 없으면 단추가 아니다: 갈 곳이 없는데 눌리게 두지 않는다', () => {
    render(<RecordStyleLegend style={DEFAULT_RECORD_WRITING_STYLE} highlightOn={true} />);
    expect(screen.getByTestId('record-style-legend').tagName).not.toBe('BUTTON');
  });
});
