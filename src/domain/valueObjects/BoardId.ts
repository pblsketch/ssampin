/**
 * BoardId — 협업 보드 고유 식별자
 *
 * 포맷: `bd-` + 14자 url-safe 문자 (총 17자).
 * FileBoardRepository(adapters 레이어)가 생성한다.
 */
export type BoardId = string & { readonly __brand: 'BoardId' };

/** URL/파일시스템 안전한 id 여부 */
export function isBoardId(s: string): s is BoardId {
  return /^bd-[A-Za-z0-9_-]{14}$/.test(s);
}
