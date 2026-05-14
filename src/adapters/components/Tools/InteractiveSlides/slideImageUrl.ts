/**
 * 슬라이드 이미지 URL 변환 — domain의 file:// 경로를 renderer가 로드 가능한 URL로 변환.
 *
 * 배경: Electron 보안 정책상 <img src="file:///..."> 는 dev(http://localhost)와
 * prod(file:///dist/index.html) 양쪽에서 cross-origin/scope 차단된다.
 * 메인 프로세스에 등록한 'ssampin-slides://' privileged scheme로 우회.
 *
 * 매핑:
 *   file:///{userData}/cache/slides/{p}/{r}/{page}.png
 *   → ssampin-slides://localhost/{p}/{r}/{page}.png
 *
 * Domain은 file:// 그대로 보관 — 변환은 view 레이어 boundary에서만.
 */

const CACHE_MARK = '/cache/slides/';

export function fileUrlToRendererUrl(filePath: string | undefined | null): string {
  if (!filePath) return '';
  // 이미 변환된 경우 (멱등)
  if (filePath.startsWith('ssampin-slides://')) return filePath;
  const idx = filePath.indexOf(CACHE_MARK);
  if (idx < 0) return filePath; // 변환 못 하면 그대로 (fail-safe)
  // /cache/slides/ 이후의 경로만 추출
  const suffix = filePath.substring(idx + CACHE_MARK.length);
  // path traversal 방지를 위해 ..나 // 제거
  const safe = suffix.replace(/\.\.\//g, '').replace(/\/{2,}/g, '/');
  return `ssampin-slides://localhost/${safe}`;
}
