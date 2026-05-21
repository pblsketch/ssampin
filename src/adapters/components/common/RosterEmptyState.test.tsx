/**
 * RosterEmptyState 단위 테스트.
 *
 * 환경: vitest (environment: 'node') — RTL/jsdom 미사용.
 * `renderToString`으로 정적 HTML 출력을 검증한다. 클릭 이벤트는 컴포넌트가
 * onNavigate prop을 호출하는지 spy로 확인 (renderToString만으로는 onClick이
 * 실행되지 않으므로 props 시그니처 자체로 회귀 차단 + 별도 컴포넌트 호출
 * 테스트).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RosterEmptyState } from './RosterEmptyState';
import type { RosterEmptyStateContext } from './RosterEmptyState';

/** 컨텍스트별 핵심 카피 — 카피 누락·오타 회귀 차단용. */
const CONTEXT_TITLES: Readonly<Record<RosterEmptyStateContext, string>> = {
  homeroom: '우리 반 명단을 등록해 주세요',
  seating: '명단이 있어야 자리를 배치할 수 있어요',
  attendance: '출결 기록을 시작하려면 명단이 필요해요',
  assignment: '과제를 수합할 학생을 등록해 주세요',
  survey: '설문을 보낼 학생을 등록해 주세요',
  records: '학생 기록을 시작하기 전에 명단이 필요해요',
  consultation: '상담 일정을 잡기 전에 명단을 등록해 주세요',
  seat_picker: '학생이 있어야 자리를 뽑을 수 있어요',
  grouping: '모둠을 섞으려면 명단이 필요해요',
  roster_management: '아직 학생이 없어요',
};

describe('RosterEmptyState — 컨텍스트별 카피 렌더', () => {
  for (const ctx of Object.keys(CONTEXT_TITLES) as RosterEmptyStateContext[]) {
    it(`${ctx} 컨텍스트는 디자인 §2.2 표 그대로의 제목을 렌더`, () => {
      const html = renderToString(<RosterEmptyState context={ctx} />);
      expect(html).toContain(CONTEXT_TITLES[ctx]);
    });
  }
});

describe('RosterEmptyState — 디자인 토큰·접근성', () => {
  it('role="region" + aria-label 노출', () => {
    const html = renderToString(<RosterEmptyState context="records" />);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="학생 기록 시작 안내"');
  });

  it('Primary CTA는 button[type="button"]로 렌더', () => {
    const html = renderToString(<RosterEmptyState context="survey" />);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>학생 명단 등록하기<\/button>/);
  });

  it('카드는 디자인 토큰(bg-sp-card·ring-1·rounded-xl)을 사용', () => {
    const html = renderToString(<RosterEmptyState context="homeroom" />);
    expect(html).toContain('bg-sp-card');
    expect(html).toContain('ring-1');
    expect(html).toContain('ring-sp-border');
    expect(html).toContain('rounded-xl');
  });

  it('Primary CTA는 직각 금지 — rounded-lg 사용', () => {
    const html = renderToString(<RosterEmptyState context="survey" />);
    // CTA는 rounded-lg, 카드는 rounded-xl — 둘 다 있어야 함
    expect(html).toContain('rounded-lg');
    expect(html).toContain('rounded-xl');
  });
});

describe('RosterEmptyState — Secondary CTA (roster_management 전용)', () => {
  it('roster_management + onSecondaryAction 제공 시 "직접 입력 시작" 버튼 노출', () => {
    const html = renderToString(
      <RosterEmptyState context="roster_management" onSecondaryAction={() => {}} />,
    );
    expect(html).toContain('직접 입력 시작');
  });

  it('roster_management + onSecondaryAction 미제공 시 Secondary CTA 미표시', () => {
    const html = renderToString(<RosterEmptyState context="roster_management" />);
    expect(html).not.toContain('직접 입력 시작');
  });

  it('다른 컨텍스트(survey)에서는 onSecondaryAction 제공해도 Secondary CTA 미표시', () => {
    const html = renderToString(<RosterEmptyState context="survey" onSecondaryAction={() => {}} />);
    expect(html).not.toContain('직접 입력 시작');
  });
});

describe('RosterEmptyState — onNavigate 콜백', () => {
  it('onNavigate 미제공 시 컴포넌트는 정상 렌더 (defaultNavigate fallback)', () => {
    // SSR 환경에서는 window 가용성을 가정할 수 없으므로
    // 마운트 단계가 아니라 props로 fallback 동작이 안전하게 처리되는지만 확인.
    expect(() => renderToString(<RosterEmptyState context="homeroom" />)).not.toThrow();
  });

  it('onNavigate 제공 시 type 검증 — JSX prop 시그니처가 함수를 받음', () => {
    // props 시그니처 회귀 차단: TypeScript 컴파일 + 정적 렌더 성공.
    const spy = vi.fn();
    const html = renderToString(<RosterEmptyState context="seating" onNavigate={spy} />);
    expect(html).toContain('학생 명단 등록하기');
    // SSR 단계에서는 클릭 이벤트가 실행되지 않으므로 spy는 0회.
    expect(spy).not.toHaveBeenCalled();
  });
});
