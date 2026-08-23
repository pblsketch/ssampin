/**
 * 온라인 교무실 — 본문 그리기 테스트 (ADR-069)
 *
 * 환경: vitest(node) — `renderToString` 으로 출력 문자열을 검사한다.
 *
 * 잠그는 것:
 *   - 남이 쓴 글이 **태그로 해석되지 않는다**(회귀 #7 과 같은 원칙).
 *   - 도메인이 아는 색·크기를 화면도 전부 알고 있다(한쪽만 늘면 조용히 기본색).
 *   - 읽을 수 없는 글을 만나도 하얗게 비우지 않고 한국어로 알린다.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  STAFFROOM_TEXT_COLORS,
  STAFFROOM_TEXT_SIZES,
  STAFFROOM_TEXT_COLOR_LABELS,
  STAFFROOM_TEXT_SIZE_LABELS,
} from '@domain/rules/staffRoomRichText';
import {
  StaffRoomRichText,
  STAFFROOM_TEXT_COLOR_STYLE,
  STAFFROOM_TEXT_SIZE_STYLE,
} from './StaffRoomRichText';

function doc(...children: unknown[]) {
  return JSON.stringify({
    root: { type: 'root', children: [{ type: 'paragraph', children }] },
  });
}
const text = (t: string, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  text: t,
  format: 0,
  style: '',
  ...extra,
});

describe('본문 그리기 — 맨글', () => {
  it('줄바꿈을 살려서 글자 그대로 보여준다', () => {
    const html = renderToString(<StaffRoomRichText body={'첫 줄\n둘째 줄'} bodyFormat="plain" />);
    expect(html).toContain('첫 줄');
    expect(html).toContain('whitespace-pre-wrap');
  });

  it('🔒 맨글에 든 태그 모양 글자가 태그로 해석되지 않는다', () => {
    const html = renderToString(
      <StaffRoomRichText body={'<img src=x onerror=alert(1)>'} bodyFormat="plain" />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('본문 그리기 — 서식 있는 글', () => {
  it('꾸밈을 화면 표시로 옮긴다', () => {
    const html = renderToString(
      <StaffRoomRichText body={doc(text('필독', { format: 9 }))} bodyFormat="lexical" />,
    );
    expect(html).toContain('필독');
    expect(html).toContain('font-bold');
    expect(html).toContain('underline');
  });

  it('허용된 색을 sp-* 토큰으로 붙인다 (하드코딩 색 없음)', () => {
    const html = renderToString(
      <StaffRoomRichText
        body={doc(text('중요', { style: STAFFROOM_TEXT_COLORS.error }))}
        bodyFormat="lexical"
      />,
    );
    expect(html).toContain('var(--sp-error)');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('🔒 허용되지 않은 색은 화면까지 오지 못한다', () => {
    const html = renderToString(
      <StaffRoomRichText
        body={doc(text('시도', { style: 'color: red; background: url(javascript:alert(1))' }))}
        bodyFormat="lexical"
      />,
    );
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('url(');
    expect(html).toContain('시도'); // 글자는 살아남는다
  });

  it('🔒 서식 글에 든 태그 모양 글자도 태그로 해석되지 않는다', () => {
    const html = renderToString(
      <StaffRoomRichText body={doc(text('<script>alert(1)</script>'))} bodyFormat="lexical" />,
    );
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script');
  });

  it('읽을 수 없는 본문은 하얗게 비우지 않고 한국어로 알린다', () => {
    const html = renderToString(<StaffRoomRichText body="깨진 값" bodyFormat="lexical" />);
    expect(html).toContain('불러오지 못했습니다');
  });
});

/**
 * 도메인과 화면의 목록이 어긋나면 그 색으로 쓴 글이 조용히 기본색으로 보인다.
 * 조용한 실패라 눈치채기 어려워서, 두 목록이 정확히 같은지를 테스트로 묶어 둔다.
 */
describe('본문 그리기 — 도메인과 화면의 목록이 어긋나지 않는다', () => {
  it('색 목록이 정확히 일치한다', () => {
    expect(Object.keys(STAFFROOM_TEXT_COLOR_STYLE).sort()).toEqual(
      Object.keys(STAFFROOM_TEXT_COLORS).sort(),
    );
  });

  it('크기 목록이 정확히 일치한다', () => {
    expect(Object.keys(STAFFROOM_TEXT_SIZE_STYLE).sort()).toEqual(
      Object.keys(STAFFROOM_TEXT_SIZES).sort(),
    );
  });

  it('모든 색·크기에 한국어 이름이 있다', () => {
    for (const name of Object.keys(STAFFROOM_TEXT_COLORS)) {
      expect(STAFFROOM_TEXT_COLOR_LABELS[name as keyof typeof STAFFROOM_TEXT_COLORS]).toBeTruthy();
    }
    for (const name of Object.keys(STAFFROOM_TEXT_SIZES)) {
      expect(STAFFROOM_TEXT_SIZE_LABELS[name as keyof typeof STAFFROOM_TEXT_SIZES]).toBeTruthy();
    }
  });
});

describe('본문 그리기 — 링크', () => {
  const linked = (url: string, label = '쌤핀') =>
    JSON.stringify({
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'link', url, children: [text(label)] }] },
        ],
      },
    });

  it('허용된 주소는 링크로 그린다', () => {
    const html = renderToString(
      <StaffRoomRichText body={linked('https://ssampin.com')} bodyFormat="lexical" />,
    );
    expect(html).toContain('href="https://ssampin.com"');
    expect(html).toContain('쌤핀');
  });

  it('새 창을 여는 쪽이 열린 창을 조작하지 못하게 한다', () => {
    const html = renderToString(
      <StaffRoomRichText body={linked('https://ssampin.com')} bodyFormat="lexical" />,
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('🔒 javascript: 주소는 링크로 그려지지 않는다 — 글자만 남는다', () => {
    const html = renderToString(
      <StaffRoomRichText body={linked('javascript:alert(1)', '눌러보세요')} bodyFormat="lexical" />,
    );
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('<a ');
    expect(html).toContain('눌러보세요');
  });

  it('🔒 data: 주소도 막힌다', () => {
    const html = renderToString(
      <StaffRoomRichText
        body={linked('data:text/html,<script>alert(1)</script>')}
        bodyFormat="lexical"
      />,
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script');
  });
});
