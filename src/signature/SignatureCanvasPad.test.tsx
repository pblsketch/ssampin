import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignatureCanvasPad } from './SignatureCanvasPad';

describe('SignatureCanvasPad', () => {
  it('SSR에서 안전하게 마운트되고 안내 카피를 노출한다', () => {
    const html = renderToString(<SignatureCanvasPad />);
    expect(html).toContain('손가락 또는 마우스로 서명');
    expect(html).toContain('지우기');
    expect(html).toContain('aria-label="서명 입력 영역"');
  });

  it('disabled 일 때 caption 그대로 + 지우기 버튼이 비활성', () => {
    const html = renderToString(<SignatureCanvasPad disabled />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('cursor-not-allowed');
  });

  it('커스텀 aria-label을 우선한다', () => {
    const html = renderToString(<SignatureCanvasPad ariaLabel="결석계 서명 영역" />);
    expect(html).toContain('aria-label="결석계 서명 영역"');
  });
});
