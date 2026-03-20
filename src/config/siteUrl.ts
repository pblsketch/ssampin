/**
 * 사이트 URL 상수
 * 도메인 변경 시 이 파일만 수정하면 됩니다.
 */

/** 메인 사이트 URL (PC 웹 / 과제 제출 / 숏링크 등) */
export const SITE_URL = 'https://ssampin.com';

/** 모바일 PWA URL */
export const MOBILE_URL = 'https://m.ssampin.com';

/** 표시용 도메인 (프로토콜 제외) */
export const SITE_DISPLAY = SITE_URL.replace(/^https?:\/\//, '');
