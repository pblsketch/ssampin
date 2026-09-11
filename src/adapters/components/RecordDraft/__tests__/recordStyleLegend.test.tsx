/**
 * @vitest-environment jsdom
 *
 * 상단 정보 바의 **작성 구성** 배지(ADR-099 보강 → ADR-103).
 *
 * 여기서 지키는 것:
 *  - 부르는 쪽이 준 차례가 **그대로** 보인다(이 검사가 없으면 다시 고정 범례로 되돌아가도 아무도 모른다).
 *  - 색은 넷 그대로이고, 색점은 형광펜을 켰을 때만 붙는다. 이름은 껐을 때도 보인다.
 *  - 색만으로 뜻을 전하지 않는다: 순번·이름·역할 이름이 읽히는 문장에 들어간다.
 *  - 누를 곳이 없으면 단추를 만들지 않는다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecordStyleLegend } from '../RecordStyleLegend';
import { DEFAULT_RECORD_WRITING_STYLE } from '@domain/entities/RecordWritingStyle';
import { resolveComposition } from '@domain/rules/recordStyleCompose';
import { RECORD_MODULES } from '@domain/rules/recordStyleCatalog';

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

const fallbackModules = resolveComposition(DEFAULT_RECORD_WRITING_STYLE).modules;

describe('작성 구성 배지 — 준 차례가 그대로 보인다', () => {
  it('폴백이면 「전체 근거」와 기존 순서: 교사 판단 → 동기·질문 → 탐구 과정 → 결과·적용', () => {
    render(<RecordStyleLegend title="전체 근거" modules={fallbackModules} highlightOn={true} />);
    const all = text();
    expect(all).toContain('전체 근거');
    expect(inOrder(all, ['교사 판단', '동기·질문', '탐구 과정', '결과·적용'])).toBe(true);
  });

  it('★서사로 쓰면 주제 이름과 그 장면 차례가 보인다 — 고정 범례로 되돌아가지 않는다', () => {
    const modules = [
      RECORD_MODULES.teacherJudgement,
      RECORD_MODULES.firstAttempt,
      RECORD_MODULES.feedbackReceived,
      RECORD_MODULES.revisedPerformance,
    ];
    render(<RecordStyleLegend title="할인 문구와 선택" modules={modules} highlightOn={true} />);
    const all = text();
    expect(all).toContain('할인 문구와 선택');
    expect(all).not.toContain('전체 근거');
    expect(
      inOrder(all, ['교사 판단', '첫 수행의 특징', '받은 의견·자기 점검', '달라진 수행']),
    ).toBe(true);
  });

  it('구성 요소가 넷이 아니어도 번호가 그 수만큼 붙는다', () => {
    const modules = [RECORD_MODULES.teacherJudgement, RECORD_MODULES.legacyMotive];
    render(<RecordStyleLegend title="짧은 흐름" modules={modules} highlightOn={true} />);
    expect(text()).toContain('2단계');
  });
});

describe('색과 형광펜', () => {
  it('형광펜을 켜면 색점이 요소 수만큼 붙는다', () => {
    render(<RecordStyleLegend title="전체 근거" modules={fallbackModules} highlightOn={true} />);
    expect(screen.getAllByTestId('legend-role-dot')).toHaveLength(fallbackModules.length);
  });

  it('★형광펜을 끄면 색점이 사라지지만 이름은 남는다 — 방식은 형광펜과 무관하게 적용된다', () => {
    render(<RecordStyleLegend title="전체 근거" modules={fallbackModules} highlightOn={false} />);
    expect(screen.queryAllByTestId('legend-role-dot')).toHaveLength(0);
    expect(text()).toContain('전체 근거');
  });

  it('색만으로 뜻을 전하지 않는다 — 순번·이름·역할 이름이 읽히는 문장에 있다', () => {
    render(<RecordStyleLegend title="전체 근거" modules={fallbackModules} highlightOn={true} />);
    const all = text();
    expect(all).toContain('작성 구성: 전체 근거');
    expect(all).toContain('1번째');
    expect(all).toContain('(교사 평가)');
  });
});

describe('누를 곳', () => {
  it('onOpen 을 주면 단추가 되고 눌리면 부른다', () => {
    const onOpen = vi.fn();
    render(
      <RecordStyleLegend
        title="전체 근거"
        modules={fallbackModules}
        highlightOn={true}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByTestId('record-style-legend'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(text()).toContain('눌러서 근거 정리로 갑니다');
  });

  it('★onOpen 이 없으면 단추를 만들지 않는다 — 누를 곳이 없는 헛클릭을 만들지 않는다', () => {
    render(<RecordStyleLegend title="전체 근거" modules={fallbackModules} highlightOn={true} />);
    expect(screen.getByTestId('record-style-legend').tagName).not.toBe('BUTTON');
    expect(text()).not.toContain('눌러서');
  });
});
