/**
 * OAuth 콜백 응답 HTML 메타테스트
 *
 * Layer 1 회귀 방지 — 사용자가 콜백 페이지에서 "이 창을 닫고 쌤핀으로 돌아가세요"
 * 만 보고 멈췄던 2026-05-19 사용자 신고에 대응해 `window.close()` 자동 닫기와
 * escape 처리를 추가함. 향후 응답 HTML 이 다시 정적 안내문으로 회귀되지 않도록
 * 핵심 동작을 고정한다.
 */
import { describe, it, expect } from 'vitest';
import { buildCallbackSuccessHtml, buildCallbackErrorHtml } from './oauth';

describe('OAuth 콜백 응답 HTML — Layer 1 (auto-close + escape)', () => {
  describe('buildCallbackSuccessHtml', () => {
    const html = buildCallbackSuccessHtml();

    it('window.close() 스크립트를 포함한다', () => {
      expect(html).toContain('window.close()');
    });

    it('카운트다운 타이머 (setInterval) 를 포함한다', () => {
      expect(html).toContain('setInterval');
      expect(html).toMatch(/countdown/);
    });

    it('성공 케이스는 5초 카운트다운', () => {
      // var n = 5; 패턴 매칭
      expect(html).toMatch(/var\s+n\s*=\s*5\s*;/);
    });

    it('window.close() 가 거부될 경우 폴백 안내를 포함한다', () => {
      expect(html).toMatch(/창이 닫히지 않으면/);
    });

    it('인증 완료 메시지를 포함한다', () => {
      expect(html).toContain('쌤핀 인증 완료');
    });

    it('한국어 lang 속성을 명시한다', () => {
      expect(html).toMatch(/<html\s+lang="ko"/);
    });

    it('try/catch 로 window.close 실패를 흡수한다', () => {
      // 브라우저 보안 정책으로 거부될 수 있으므로 try/catch 필수
      expect(html).toMatch(/try\s*\{\s*window\.close\(\);?\s*\}\s*catch/);
    });
  });

  describe('buildCallbackErrorHtml', () => {
    it('window.close() 스크립트를 포함한다 (에러 케이스도 자동 닫기)', () => {
      const html = buildCallbackErrorHtml('access_denied');
      expect(html).toContain('window.close()');
    });

    it('에러 케이스는 10초 카운트다운 (사용자가 사유를 읽도록 더 길게)', () => {
      const html = buildCallbackErrorHtml('access_denied');
      expect(html).toMatch(/var\s+n\s*=\s*10\s*;/);
    });

    it('Google error 파라미터를 그대로 노출한다 (escape 후)', () => {
      const html = buildCallbackErrorHtml('access_denied');
      expect(html).toContain('access_denied');
    });

    it('빈 error 는 기본 메시지로 대체', () => {
      const html = buildCallbackErrorHtml('');
      expect(html).toContain('알 수 없는 오류가 발생했습니다');
    });

    it('HTML escape: <script> 태그를 무력화', () => {
      const html = buildCallbackErrorHtml('<script>alert(1)</script>');
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('HTML escape: 따옴표/앰퍼샌드/꺾쇠', () => {
      const html = buildCallbackErrorHtml('a & b < c > "d" \'e\'');
      expect(html).toContain('a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;');
    });

    it('실패 메시지를 포함한다', () => {
      const html = buildCallbackErrorHtml('access_denied');
      expect(html).toContain('인증 실패');
    });
  });
});
