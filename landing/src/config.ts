export const DOWNLOAD_URL =
  'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe';
// macOS 는 칩별 2파일이다(통합 universal 은 용량 부담으로 보류 — 2026-08-24 결정).
// 실측: 통합 480MB vs 칩별 약 290MB. 실사용 인텔 Mac 이 거의 없어(릴리즈당 x64 1건) 칩별을 택했다.
// DownloadButton 이 접속 OS 를 감지해 기본은 ARM(Apple Silicon), 인텔은 별도 링크로 제공한다.
export const DOWNLOAD_URL_MAC_ARM =
  'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-arm64.dmg';
export const DOWNLOAD_URL_MAC_X64 =
  'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-x64.dmg';
export const VERSION = '2.4.5';
export const FILE_SIZE = '~290MB';
export const FILE_SIZE_MAC = '~330MB';
export const GITHUB_URL = 'https://github.com/pblsketch/ssampin';
export const EDZIP_URL = 'https://edzip.kr/learning-sw/6a840aca03edc81c0fd12a6a';
export const GUIDE_URL = '/docs';
export const FALLBACK_DOWNLOAD_URL = '/docs/troubleshooting/download';
export const MOBILE_URL = 'https://m.ssampin.com';

// 정본(canonical) 주소. apex(ssampin.com)는 www 로 리다이렉트되므로 실제 서빙 주소인
// www 가 정본이다. 예전에는 메타·사이트맵·구조화 데이터가 apex 를 가리켜, 검색엔진에
// "정본이라고 신고한 주소가 다른 곳으로 튕기는" 신호 충돌이 있었다.
// 메타데이터·사이트맵·JSON-LD 는 전부 이 상수를 참조한다 — 도메인을 바꿀 일이 생기면 여기만 고친다.
export const SITE_URL = 'https://www.ssampin.com';
