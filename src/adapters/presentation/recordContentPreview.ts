/**
 * 기록 내용 미리보기/펼치기 순수 로직.
 *
 * 조회 화면에서 긴 내용(특기사항 등)을 limit 자까지 잘라 보여주고,
 * 초과 시 [더보기]/[접기] 토글을 노출한다. 경계(off-by-one) 회귀를
 * 단위 테스트로 가드하기 위해 표시 컴포넌트에서 분리한 순수 함수다.
 *
 * Phase B에서 `ExpandableRecordContent` 부품으로 흡수될 때 이 로직을 재사용한다.
 */

export interface ContentPreview {
  /** 화면에 표시할 텍스트 (접힘 상태면 잘린 뒤 '…' 부착). */
  readonly text: string;
  /** [더보기]/[접기] 토글을 노출해야 하는가 (= 내용이 limit 자를 초과). */
  readonly showToggle: boolean;
}

/** 기본 미리보기 길이(자). */
export const DEFAULT_CONTENT_PREVIEW_LIMIT = 100;

/**
 * @param content  원본 내용
 * @param expanded 펼침 상태 여부
 * @param limit    미리보기 최대 길이(기본 100). 이 값을 **초과**할 때만 자른다(100자는 전문 노출).
 */
export function previewContent(
  content: string,
  expanded: boolean,
  limit: number = DEFAULT_CONTENT_PREVIEW_LIMIT,
): ContentPreview {
  const showToggle = content.length > limit;
  const text = showToggle && !expanded ? content.slice(0, limit) + '…' : content;
  return { text, showToggle };
}
