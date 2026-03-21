/**
 * 인앱 브라우저 감지
 *
 * Threads, Instagram, Facebook, KakaoTalk, Naver, LINE 등
 * 주요 앱의 내장 브라우저를 감지합니다.
 */

export interface InAppBrowserInfo {
  isInApp: boolean;
  appName: string | null;
}

export function detectInAppBrowser(): InAppBrowserInfo {
  const ua = navigator.userAgent || '';

  const patterns: Array<{ pattern: RegExp; name: string }> = [
    // Meta 계열
    { pattern: /FBAN|FBAV/i, name: 'Facebook' },
    { pattern: /Instagram/i, name: 'Instagram' },
    { pattern: /Threads/i, name: 'Threads' },

    // 국내 앱
    { pattern: /KAKAOTALK/i, name: '카카오톡' },
    { pattern: /NAVER/i, name: '네이버' },
    { pattern: /DaumApps/i, name: '다음' },
    { pattern: /everytimeApp/i, name: '에브리타임' },

    // 메신저
    { pattern: /Line\//i, name: 'LINE' },
    { pattern: /Twitter/i, name: 'X(트위터)' },

    // Android WebView
    { pattern: /wv\)/i, name: '앱 내 브라우저' },
  ];

  for (const { pattern, name } of patterns) {
    if (pattern.test(ua)) {
      return { isInApp: true, appName: name };
    }
  }

  // iOS: 독립 Safari가 아닌 경우 감지
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
  if (isIOS && !isSafari && !/Chrome/.test(ua)) {
    return { isInApp: true, appName: '앱 내 브라우저' };
  }

  return { isInApp: false, appName: null };
}
