/**
 * RealtimeResponseToggle 단위 테스트.
 *
 * 환경: vitest (environment: 'node'), DOM 인프라(jsdom/RTL) 없음.
 * 따라서 다음 두 축으로 분리한다:
 *   1. 순수 로직: `decideToggleAction` 게이트 함수 (모든 4가지 경로)
 *   2. 정적 렌더: `renderToString` 으로 출력 검증 (role/aria-checked/카피)
 *
 * 이벤트 기반 검증(클릭 → 모달 노출 → onChange 호출 등)은 통합 테스트에서
 * 별도로 다루지 않고, decideToggleAction 의 분기로 충분히 보장한다.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  RealtimeResponseToggle,
  decideToggleAction,
  REALTIME_RESPONSE_WARN_KEY,
} from './RealtimeResponseToggle';

describe('decideToggleAction', () => {
  it('OFF → ON, hasWarned=false → show-warning', () => {
    expect(decideToggleAction(false, true, false)).toBe('show-warning');
  });

  it('OFF → ON, hasWarned=true → apply-immediately', () => {
    expect(decideToggleAction(false, true, true)).toBe('apply-immediately');
  });

  it('ON → OFF, hasWarned=false → apply-immediately (경고 없음)', () => {
    expect(decideToggleAction(true, false, false)).toBe('apply-immediately');
  });

  it('ON → OFF, hasWarned=true → apply-immediately', () => {
    expect(decideToggleAction(true, false, true)).toBe('apply-immediately');
  });

  it('동일 값 시도(OFF → OFF) → noop', () => {
    expect(decideToggleAction(false, false, false)).toBe('noop');
  });

  it('동일 값 시도(ON → ON) → noop', () => {
    expect(decideToggleAction(true, true, true)).toBe('noop');
  });
});

describe('RealtimeResponseToggle 정적 렌더', () => {
  it('checked=false 일 때 aria-checked="false" + bg-sp-surface', () => {
    const html = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="survey" />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('bg-sp-surface');
    expect(html).not.toContain('bg-sp-accent');
  });

  it('checked=true 일 때 aria-checked="true" + bg-sp-accent', () => {
    const html = renderToString(
      <RealtimeResponseToggle checked={true} onChange={() => {}} tool="survey" />,
    );
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('bg-sp-accent');
  });

  it('도구별 설명 카피가 다름 (poll vs survey vs multiSurvey)', () => {
    const pollHtml = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="poll" />,
    );
    const surveyHtml = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="survey" />,
    );
    const multiHtml = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="multiSurvey" />,
    );

    expect(pollHtml).toContain('투표');
    expect(surveyHtml).toContain('답변이 도착하는 즉시');
    expect(multiHtml).toContain('객관식');
    expect(multiHtml).toContain('주관식');
  });

  it('경고 카피("별도 모니터")가 항상 노출됨', () => {
    const html = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="multiSurvey" />,
    );
    expect(html).toContain('별도 모니터');
  });

  it('disabled=true 일 때 opacity-50 + cursor-not-allowed', () => {
    const html = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="survey" disabled />,
    );
    expect(html).toContain('opacity-50');
    expect(html).toContain('cursor-not-allowed');
    expect(html).toContain('disabled=""');
  });

  it('초기 렌더 시 모달은 노출되지 않음(showWarning 초기값 false)', () => {
    const html = renderToString(
      <RealtimeResponseToggle checked={false} onChange={() => {}} tool="survey" />,
    );
    expect(html).not.toContain('시작 전 확인');
    expect(html).not.toContain('확인하고 켜기');
  });
});

describe('localStorage 키 상수', () => {
  it('전역 키가 v1 네임스페이스로 고정되어 회귀 차단', () => {
    expect(REALTIME_RESPONSE_WARN_KEY).toBe('ssampin-realtime-response-toggle-warned-v1');
  });
});
