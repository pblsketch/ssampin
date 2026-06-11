/**
 * 학생 페이지 공용 셸(sps-*) 메타테스트 — student-pages-design-refactor Phase 1.
 *
 * 셸이 보장해야 하는 불변식:
 *   1. viewport 가 핀치 줌을 막지 않는다 (WCAG 1.4.4 — 2026-06-12 감사 F4)
 *   2. 브랜드 폰트 스택(Pretendard/Noto Sans KR) 선언 (감사 F1)
 *   3. plan D1/D4 확정 토큰값 (--sps-accent #3b82f6 / --sps-card #1a2332 / 카드 12·컨트롤 8)
 *   4. DN-10 SSOT(--color-*, MultiSurvey v2 영역) 비침범 — 기존 기본값 그대로
 *   5. 상태 화면 4종 + 토스트의 접근성 마크업 (role="status" / aria-live)
 *   6. 전송 중/토스트 전역 JS 헬퍼 노출
 */
import { describe, expect, it } from 'vitest';
import {
  getDesignTokenDefaults,
  getStatusScreenHTML,
  getStudentBaseCSS,
  getStudentFeedbackJS,
  getStudentFontLinks,
  getStudentShellBundle,
  getStudentViewportMeta,
  getToastHTML,
} from './_studentPageChrome';

describe('student shell: viewport (WCAG 1.4.4)', () => {
  it('does not block pinch zoom', () => {
    const meta = getStudentViewportMeta();
    expect(meta).not.toContain('user-scalable=no');
    expect(meta).not.toContain('maximum-scale');
  });

  it('enables safe-area env() via viewport-fit=cover', () => {
    expect(getStudentViewportMeta()).toContain('viewport-fit=cover');
  });
});

describe('student shell: brand font (audit F1)', () => {
  it('declares Pretendard + Noto Sans KR in the base font stack', () => {
    const css = getStudentBaseCSS();
    expect(css).toContain("'Pretendard Variable'");
    expect(css).toContain("'Noto Sans KR'");
  });

  it('loads Pretendard via CDN with preconnect', () => {
    const links = getStudentFontLinks();
    expect(links).toContain('rel="preconnect"');
    expect(links).toContain('pretendard');
  });
});

describe('student shell: design tokens (plan D1/D4)', () => {
  it('defines the approved sps token values', () => {
    const css = getStudentBaseCSS();
    expect(css).toContain('--sps-accent: #3b82f6');
    expect(css).toContain('--sps-card: #1a2332');
    expect(css).toContain('--sps-highlight: #f59e0b');
    expect(css).toContain('--sps-radius-card: 12px');
    expect(css).toContain('--sps-radius-control: 8px');
  });

  it('keeps keyboard focus visible and the [hidden] guard', () => {
    const css = getStudentBaseCSS();
    expect(css).toMatch(/:focus-visible\s*\{/);
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it('does NOT touch the MultiSurvey v2 token SSOT (DN-10, 다른 세션 영역)', () => {
    const defaults = getDesignTokenDefaults();
    expect(defaults['--color-accent']).toBe('#60a5fa');
    expect(defaults['--color-card']).toBe('#1a1f2e');
    expect(defaults['--color-highlight']).toBe('#fbbf24');
  });
});

describe('student shell: status screens', () => {
  it('renders the 4 kinds with role="status" and default ids', () => {
    for (const kind of ['connecting', 'disconnected', 'closed', 'done'] as const) {
      const html = getStatusScreenHTML(kind);
      expect(html).toContain('role="status"');
      expect(html).toContain(`id="sps-${kind}"`);
      expect(html).toContain(' hidden');
    }
  });

  it('done screen contains the SVG check (stroke-draw)', () => {
    const html = getStatusScreenHTML('done');
    expect(html).toContain('sps-done-check-mark');
    expect(html).toContain('<svg');
  });

  it('supports id/title overrides for existing show() routing and escapes text', () => {
    const html = getStatusScreenHTML('closed', {
      id: 'closed',
      title: '투표가 종료되었습니다 <b>',
    });
    expect(html).toContain('id="closed"');
    expect(html).toContain('투표가 종료되었습니다 &lt;b&gt;');
  });
});

describe('student shell: feedback (toast + pending)', () => {
  it('toast container is polite live region', () => {
    const html = getToastHTML();
    expect(html).toContain('id="spsToast"');
    expect(html).toContain('aria-live="polite"');
  });

  it('exposes window.spsToast and window.spsSetPending', () => {
    const js = getStudentFeedbackJS();
    expect(js).toContain('window.spsToast');
    expect(js).toContain('window.spsSetPending');
  });

  it('feedback JS parses as valid script (inline string은 tsc 검증 밖)', () => {
    expect(() => new Function(getStudentFeedbackJS())).not.toThrow();
  });

  it('bundle exposes all 5 parts', () => {
    const bundle = getStudentShellBundle();
    expect(bundle.viewportMeta).toBeTruthy();
    expect(bundle.fontLinks).toBeTruthy();
    expect(bundle.baseCSS).toBeTruthy();
    expect(bundle.toastHTML).toBeTruthy();
    expect(bundle.feedbackJS).toBeTruthy();
  });
});
