/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { BalanceByLevelToggle } from './BalanceByLevelToggle';
import type { BalanceByLevelAckState } from '@domain/rules/balanceByLevelAck';

/**
 * BalanceByLevelToggle SSR 컴포넌트 테스트
 *
 * Acceptance: 'first toggle blocks on ack checkbox; reset clears ack state'
 *
 * Note: SSR markup만 검증 (실제 onClick 이벤트 시뮬레이션은 jsdom + RTL 필요).
 * 토글 결정 로직(`decideToggleAction` 호출 결과)은 balanceByLevelAck.test.ts에서 검증.
 */

const initial: BalanceByLevelAckState = { acknowledged: false, enabled: false };
const ackedEnabled: BalanceByLevelAckState = { acknowledged: true, enabled: true };

describe('BalanceByLevelToggle SSR', () => {
  it('renders toggle label "학업성취도 균형"', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: initial,
        onChange: vi.fn(),
        piiCoverage: 1,
      }),
    );
    expect(html).toContain('학업성취도 균형');
    expect(html).toContain('type="checkbox"');
  });

  it('insufficient piiCoverage (<50%) → checkbox disabled + 안내문', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: initial,
        onChange: vi.fn(),
        piiCoverage: 0.3,
      }),
    );
    expect(html).toContain('disabled');
    expect(html).toContain('50% 이상');
    expect(html).toContain('학업성취도 등급이 입력');
  });

  it('sufficient piiCoverage (>=50%) → checkbox enabled + 안내문 없음', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: initial,
        onChange: vi.fn(),
        piiCoverage: 0.5,
      }),
    );
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('50% 이상');
  });

  it('acknowledged + enabled + onReset 제공 시 reset 버튼 노출', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: ackedEnabled,
        onChange: vi.fn(),
        piiCoverage: 1,
        onReset: vi.fn(),
      }),
    );
    expect(html).toContain('ack 재설정');
  });

  it('initial state (acknowledged=false) → reset 버튼 미노출', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: initial,
        onChange: vi.fn(),
        piiCoverage: 1,
        onReset: vi.fn(),
      }),
    );
    expect(html).not.toContain('ack 재설정');
  });

  it('SSR: modal은 첫 렌더에서 닫힘 (useState false) → modal 요소 미존재', () => {
    const html = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: initial,
        onChange: vi.fn(),
        piiCoverage: 1,
      }),
    );
    // modal은 modalOpen=true 시에만 렌더링 — SSR 초기 false이므로 미존재
    expect(html).not.toContain('balance-ack-title');
    expect(html).not.toContain('aria-modal');
  });

  it('checkbox checked 속성이 state.enabled를 반영', () => {
    const enabledHtml = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: ackedEnabled,
        onChange: vi.fn(),
        piiCoverage: 1,
      }),
    );
    expect(enabledHtml).toContain('checked=""');

    const disabledStateHtml = renderToStaticMarkup(
      React.createElement(BalanceByLevelToggle, {
        state: { acknowledged: true, enabled: false },
        onChange: vi.fn(),
        piiCoverage: 1,
      }),
    );
    // disabled state는 checkbox에 checked가 없어야 함
    const checkboxIdx = disabledStateHtml.indexOf('aria-label="학업성취도 균형 토글"');
    const before = disabledStateHtml.slice(0, checkboxIdx);
    expect(before).not.toContain('checked=""');
  });
});
