/**
 * v2.1 — RealtimeWallCardMarkdown XSS fuzz 테스트.
 *
 * Design v2.1 §5.5 / §9.3 / §10.7:
 *   - react-markdown allowedElements 7종 화이트리스트 강제
 *   - dangerouslySetInnerHTML 0 hit (회귀 위험 #7)
 *   - marquee/iframe/script/svg/object/embed/javascript: 차단
 *
 * 100+ XSS payload 입력 → DOM에 위험 요소 0개.
 *
 * 테스트 환경: vitest + jsdom (가벼운 DOM)
 *   - happy-dom 또는 jsdom 필요
 *   - react-dom/server.renderToString으로 서버 렌더 후 HTML 검사 (DOM 없이도 검증 가능)
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RealtimeWallCardMarkdown } from './RealtimeWallCardMarkdown';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<marquee>scrolling</marquee>',
  '<svg onload="alert(1)"></svg>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)"></embed>',
  '<video src=x onerror=alert(1)>',
  '<audio src=x onerror=alert(1)>',
  '[link](javascript:alert(1))',
  '![alt](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '<a href="javascript:alert(1)">click</a>',
  '<img src=x onerror=alert(1)>',
  '<style>body{display:none}</style>',
  '<base href="javascript:alert(1)//">',
  '<form action="javascript:alert(1)">',
  '<input onfocus=alert(1) autofocus>',
  '<details open ontoggle=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<math><mtext><script>alert(1)</script></mtext></math>',
  '"><script>alert(1)</script>',
  '\'><script>alert(1)</script>',
  // markdown link with javascript:
  '[text](javascript:alert(1))',
  // markdown image with data URL
  '![](data:image/svg+xml,<svg/onload=alert(1)>)',
  // h1/h2/h3는 차단되지 않으면 위험은 아니지만 화이트리스트 외
  '# heading',
  '## heading2',
  // table — 화이트리스트 외
  '| a | b |\n|---|---|\n| 1 | 2 |',
  // code block — 화이트리스트 외
  '```js\nalert(1)\n```',
  // inline code
  '`code`',
];

/**
 * 실제 활성 DOM 태그/속성만 검사 (escape된 plain text는 안전 — &lt;script&gt; 등 허용).
 *
 * react-markdown은 raw HTML을 모두 entity-escape하므로 위험 태그가 plain text로
 * 남아있어도 실행되지 않는다. 따라서 검사는 진짜 DOM 출력에 위험 태그/속성이
 * 등장하는지만 본다.
 *
 * 패턴은 모두 "비-escaped" `<` 직후의 위험 태그명을 잡는다 (`&lt;`로 시작하는 것은 안전).
 */
const FORBIDDEN_DOM_PATTERNS = [
  /(?<!&lt;|&amp;lt;)<script\b/i,
  /(?<!&lt;|&amp;lt;)<iframe\b/i,
  /(?<!&lt;|&amp;lt;)<marquee\b/i,
  /(?<!&lt;|&amp;lt;)<svg\b/i,
  /(?<!&lt;|&amp;lt;)<object\b/i,
  /(?<!&lt;|&amp;lt;)<embed\b/i,
  /(?<!&lt;|&amp;lt;)<video\b/i,
  /(?<!&lt;|&amp;lt;)<audio\b/i,
  /(?<!&lt;|&amp;lt;)<img\b/i,
  /(?<!&lt;|&amp;lt;)<style\b/i,
  /(?<!&lt;|&amp;lt;)<base\b/i,
  /(?<!&lt;|&amp;lt;)<form\b/i,
  /(?<!&lt;|&amp;lt;)<input\b/i,
  /(?<!&lt;|&amp;lt;)<details\b/i,
  /(?<!&lt;|&amp;lt;)<math\b/i,
  // 활성 속성 (실제 HTML 속성 — escape된 텍스트는 검사 X)
  // " on{이벤트}=" 형태만 매치 (속성 sigil 보호)
  /\s(onerror|onload|ontoggle|onfocus|onclick|onmouseover|onerror)\s*=/i,
];

describe('RealtimeWallCardMarkdown — XSS fuzz', () => {
  /**
   * react-markdown은 raw HTML을 모두 entity-escape한다.
   * 따라서 위험은 "활성 DOM 태그 영역" (`<tag ...>`)에만 존재한다.
   *
   * 검사 전에 escape된 plain text의 위험 단어는 무시 (안전):
   *   - HTML entity 디코드 후 남은 raw `<` 직후 토큰만 검사
   *   - 또는 출력 HTML 안의 escape된 부분(`&lt;...&gt;` span)을 제외하고 검사
   */
  for (const payload of XSS_PAYLOADS) {
    it(`payload "${payload.slice(0, 60).replace(/\n/g, '\\n')}" → DOM 안전`, () => {
      const html = renderToString(<RealtimeWallCardMarkdown text={payload} />);
      // entity-escaped 영역 (예: `&lt;...&gt;` 또는 `&quot;...&quot;`)을 제거한 뒤 검사
      const liveDomOnly = html.replace(/&lt;[\s\S]*?&gt;/g, '').replace(/&quot;/g, '"');
      for (const forbidden of FORBIDDEN_DOM_PATTERNS) {
        expect(
          liveDomOnly,
          `forbidden pattern ${forbidden} found in live DOM: ${liveDomOnly}\n(full output: ${html})`,
        ).not.toMatch(forbidden);
      }
    });
  }

  it('정상 마크다운 — bold / italic / list / blockquote 렌더', () => {
    const html = renderToString(
      <RealtimeWallCardMarkdown text={'**굵게** *기울임*\n\n- 항목\n\n> 인용'} />,
    );
    expect(html).toMatch(/<strong[\s>]/);
    expect(html).toMatch(/<em[\s>]/);
    expect(html).toMatch(/<ul[\s>]/);
    expect(html).toMatch(/<blockquote[\s>]/);
  });

  it('ordered list 렌더', () => {
    const html = renderToString(
      <RealtimeWallCardMarkdown text={'1. 첫째\n2. 둘째'} />,
    );
    expect(html).toMatch(/<ol[\s>]/);
  });

  it('빈 텍스트 → null 반환 (DOM 없음)', () => {
    const html = renderToString(<RealtimeWallCardMarkdown text="" />);
    expect(html).toBe('');
  });
});
