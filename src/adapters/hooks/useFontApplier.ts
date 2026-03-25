import { useEffect, useRef } from 'react';
import { getFontPreset } from '@domain/entities/FontPreset';
import type { FontFamily, CustomFontSettings } from '@domain/entities/Settings';

/** MIME 타입 → CSS format() 값 */
function getFontFormat(mimeType: string): string {
  switch (mimeType) {
    case 'font/woff2': return 'woff2';
    case 'font/woff': return 'woff';
    case 'font/ttf':
    case 'application/x-font-ttf': return 'truetype';
    case 'font/otf':
    case 'application/x-font-opentype': return 'opentype';
    default: return 'woff2';
  }
}

export function useFontApplier(fontFamily: FontFamily, customFont?: CustomFontSettings) {
  const prevLinkRef = useRef<HTMLLinkElement | null>(null);
  const prevStyleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    // ── 커스텀 폰트 처리 ──
    if (fontFamily === 'custom' && customFont?.dataUrl) {
      const styleId = 'ssp-custom-font';
      let style = document.querySelector(`#${styleId}`) as HTMLStyleElement | null;

      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
      }

      const fmt = getFontFormat(customFont.mimeType);
      style.textContent = `
        @font-face {
          font-family: 'SsampinCustomFont';
          src: url('${customFont.dataUrl}') format('${fmt}');
          font-weight: 400;
          font-display: swap;
        }
        @font-face {
          font-family: 'SsampinCustomFont';
          src: url('${customFont.dataUrl}') format('${fmt}');
          font-weight: 700;
          font-display: swap;
        }
      `;

      if (prevStyleRef.current && prevStyleRef.current.id !== styleId) {
        prevStyleRef.current.remove();
      }
      prevStyleRef.current = style;
      return;
    }

    // ── 기존 프리셋 폰트 처리 (변경 없음) ──
    const preset = getFontPreset(fontFamily);
    const url = preset.googleFontsUrl ?? preset.cdnUrl;

    // customCss 처리 (카카오 글씨 등 @font-face 직접 정의)
    if (preset.customCss && !document.querySelector(`style[data-ssp-font="${fontFamily}"]`)) {
      const style = document.createElement('style');
      style.dataset.sspFont = fontFamily;
      style.textContent = preset.customCss;
      document.head.appendChild(style);

      if (prevStyleRef.current && prevStyleRef.current.dataset.sspFont !== fontFamily) {
        prevStyleRef.current.remove();
      }
      prevStyleRef.current = style;
    }

    // CDN/Google Fonts stylesheet 처리
    if (fontFamily !== 'noto-sans' && url) {
      const existingLink = document.querySelector(`link[href="${url}"]`);

      if (!existingLink) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.dataset.sspFont = fontFamily;
        document.head.appendChild(link);

        if (prevLinkRef.current && prevLinkRef.current.dataset.sspFont !== fontFamily) {
          prevLinkRef.current.remove();
        }
        prevLinkRef.current = link;
      }
    }

    // 폰트 적용은 --sp-font-family CSS 변수(useThemeApplier)가 담당
    // 인라인 fontFamily를 설정하면 CSS 변수를 덮어쓰므로 여기선 로드만 수행
  }, [fontFamily, customFont?.dataUrl]);
}
