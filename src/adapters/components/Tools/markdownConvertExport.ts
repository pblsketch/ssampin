/** 마크다운 변환기 내보내기 관련 순수 유틸 — 컴포넌트와 분리해 테스트 용이하게. */

/** 원본 파일명을 .hwpx 로 바꾼 추천 저장명. 확장자 제거 후 빈 이름이면 'converted'. */
export function toHwpxFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').trim();
  return `${base.length > 0 ? base : 'converted'}.hwpx`;
}
