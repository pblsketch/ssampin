/**
 * @vitest-environment jsdom
 *
 * 오른쪽 보조 공간(ADR-093 결정 2) — [AI 초안 | 근거] 두 탭. 쌤핀 AI(범용 대화)는 여기 없다(오너 피드백 2026-09-08:
 * 이 화면의 AI 는 초안 쓰기라 범용 대화가 같은 자리에 있으면 헷갈린다). 도크와의 배타는 `recordDraftAiWiring.test` 가 지킨다.
 *
 * 지키는 것:
 * 1. 부모가 준 탭이 활성이고 ARIA 탭 패턴(tablist/tabpanel/←→)을 따른다.
 * 2. ✕ 는 부모의 닫기를 부른다. 좁은 배치(sheet)에는 [본문으로] 가 더 있다.
 * 3. 배치 규칙 `resolvePanelLayout`: 본문 560px 을 못 확보하면 sheet.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecordDraftSidePanel } from '../RecordDraftSidePanel';
import { resolvePanelLayout } from '../RecordDraftView';

function panel(over: Partial<Parameters<typeof RecordDraftSidePanel>[0]> = {}) {
  const onTabChange = vi.fn();
  const onClose = vi.fn();
  render(
    <RecordDraftSidePanel
      studentName="김지훈"
      area="subject"
      tab="ai"
      onTabChange={onTabChange}
      onClose={onClose}
      evidences={[]}
      threads={[]}
      obsById={new Map()}
      onOpenBoard={() => {}}
      aiPanel={<div data-testid="ai-panel">AI 패널</div>}
      {...over}
    />,
  );
  return { onTabChange, onClose };
}

afterEach(cleanup);

describe('두 탭 — AI 초안·근거 (쌤핀 AI 는 여기 없다: 오너 피드백 2026-09-08)', () => {
  it('부모가 준 탭이 활성이고 쌤핀 AI 탭은 없다', () => {
    panel();
    expect(screen.getByRole('tab', { name: 'AI 초안' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: '쌤핀 AI' })).toBeNull();
    expect(screen.getByTestId('ai-panel')).toBeTruthy();
    expect(screen.getByRole('tabpanel')).toBeTruthy();
  });

  it('[근거] 탭을 누르면 부모에게 알린다', () => {
    const { onTabChange } = panel();
    fireEvent.click(screen.getByRole('tab', { name: '근거' }));
    expect(onTabChange).toHaveBeenCalledWith('evidence');
  });

  it('← / → 로 이웃 탭으로 옮긴다(ARIA 탭 패턴)', () => {
    const { onTabChange } = panel();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'AI 초안' }), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('evidence');
  });

  it('✕ 는 부모의 닫기를 부르고, sheet 배치에는 [본문으로] 가 더 있다', () => {
    const { onClose } = panel({ placement: 'sheet' });
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /본문으로/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('complementary', { name: '고른 학생 패널' }).getAttribute('data-placement'),
    ).toBe('sheet');
  });

  it('나란히 배치에서는 부모가 준 폭을 쓴다', () => {
    panel({ width: 320 });
    const aside = screen.getByRole('complementary', { name: '고른 학생 패널' });
    expect(aside.style.width).toBe('320px');
  });
});

describe('배치 규칙 resolvePanelLayout (설계서 §2-3)', () => {
  it('폭을 모르면(jsdom) 넓다고 본다', () => {
    expect(resolvePanelLayout(null)).toEqual({ panelWidth: 380, placement: 'side' });
  });
  it('1200px 이상이면 패널 380, 본문 560 이 남으면 나란히', () => {
    expect(resolvePanelLayout(1200)).toEqual({ panelWidth: 380, placement: 'side' });
  });
  it('1200px 아래는 패널 320, 편집 칸 560(+안쪽 여백 32)이 남으면 나란히(912 이상)', () => {
    expect(resolvePanelLayout(912)).toEqual({ panelWidth: 320, placement: 'side' });
  });
  it('★편집 칸 560 을 못 확보하면 sheet — 짓누르지 않고 자리를 통째로 준다', () => {
    expect(resolvePanelLayout(911).placement).toBe('sheet');
    expect(resolvePanelLayout(700).placement).toBe('sheet');
  });
});
