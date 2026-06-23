import { useState } from 'react';
import {
  previewContent,
  DEFAULT_CONTENT_PREVIEW_LIMIT,
} from '@adapters/presentation/recordContentPreview';

interface ExpandableRecordContentProps {
  /** 표시할 본문(특기사항·관찰 내용 등). */
  content: string;
  /** 미리보기 최대 길이(기본 100). 초과 시 [더보기]/[접기] 토글. */
  limit?: number;
  /** 본문 p 태그 클래스(미지정 시 조회 표준 스타일). */
  className?: string;
}

/**
 * 긴 기록 본문을 limit 자까지 보여주고 [더보기]/[접기]로 펼치는 공용 부품.
 *
 * 펼침 상태를 컴포넌트가 자체 관리하므로 소비 화면은 expandedIds 같은 상태를
 * 들고 있을 필요가 없다. 경계 로직은 순수 함수 {@link previewContent}에 위임
 * (단위 테스트로 100/101 경계 가드).
 */
export function ExpandableRecordContent({
  content,
  limit = DEFAULT_CONTENT_PREVIEW_LIMIT,
  className = 'text-sm text-sp-text leading-relaxed whitespace-pre-wrap',
}: ExpandableRecordContentProps) {
  const [expanded, setExpanded] = useState(false);
  const { text, showToggle } = previewContent(content, expanded, limit);

  return (
    <div>
      <p className={className}>{text}</p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-xs text-sp-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
        >
          {expanded ? '접기' : '더보기'}
        </button>
      )}
    </div>
  );
}
