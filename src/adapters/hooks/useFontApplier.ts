import { useEffect, useRef } from 'react';
import { getFontPreset } from '@domain/entities/FontPreset';
import type { FontFamily } from '@domain/entities/Settings';

export function useFontApplier(fontFamily: FontFamily) {
  const prevLinkRef = useRef<HTMLLinkElement | null>(null);
  const prevStyleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
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

    document.documentElement.style.fontFamily = preset.cssFamily;

    return () => {
      document.documentElement.style.fontFamily = '';
    };
  }, [fontFamily]);
}
