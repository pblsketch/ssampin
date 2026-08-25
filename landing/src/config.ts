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
