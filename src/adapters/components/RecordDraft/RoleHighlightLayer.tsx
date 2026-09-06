import { forwardRef, useMemo } from 'react';
import { alignRoleMarksInline, type RoleMark } from '@domain/rules/narrativeParagraphs';
import { ROLE_BG, ROLE_BG_STALE } from '@adapters/components/RecordDraft/narrativeRoleStyles';

/** 편집 칸(textarea)과 이 레이어가 **똑같이** 써야 하는 글꼴·여백·줄바꿈 클래스. 하나라도 다르면 색이 밀린다. */
export const DRAFT_TEXT_METRICS =
  'px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words border rounded-lg';

interface RoleHighlightLayerProps {
  readonly text: string;
  readonly marks: readonly RoleMark[] | undefined;
}

/**
 * 편집 칸 뒤에 까는 **거울 레이어** — 글자는 textarea 가 그리고, 여기서는 문단별 배경색만 그린다.
 *
 * 같은 글꼴·여백·`pre-wrap` 으로 같은 글을 한 번 더 그려 줄바꿈을 맞추고, 글자색은 투명으로 둔다.
 * 스크롤은 부모가 textarea 의 onScroll 에서 `ref.scrollTop` 으로 맞춘다. 크기는 absolute inset-0 이라
 * textarea 를 끌어 늘려도 따라간다. 새 의존성 없음(설계서 §7-3).
 */
export const RoleHighlightLayer = forwardRef<HTMLDivElement, RoleHighlightLayerProps>(
  function RoleHighlightLayer({ text, marks }, ref) {
    const segments = useMemo(() => buildSegments(text, marks), [text, marks]);
    return (
      <div
        ref={ref}
        aria-hidden="true"
        data-testid="role-highlight-layer"
        className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent border-transparent ${DRAFT_TEXT_METRICS}`}
      >
        {segments.map((seg, i) =>
          seg.cls ? (
            <span key={i} className={`rounded-sm box-decoration-clone ${seg.cls}`}>
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {/* 마지막 줄바꿈이 있으면 textarea 는 빈 줄을 하나 더 보여 준다 — 높이를 맞춘다. */}
        {text.endsWith('\n') ? '\u200b' : null}
      </div>
    );
  },
);

interface Segment {
  readonly text: string;
  readonly cls: string | null;
}

/**
 * 표식 본문을 순서대로 찾아 구간을 만든다(`alignRoleMarksInline`) — 원문의 **모든 글자를 그대로 보존**한다.
 * 생기부 본문은 줄바꿈 없는 한 덩어리라 문단으로 자를 수 없고, 빈 줄이 든 옛 초안도 같은 방식으로 맞는다.
 */
function buildSegments(text: string, marks: readonly RoleMark[] | undefined): Segment[] {
  if (text.length === 0) return [];
  return alignRoleMarksInline(text, marks).map((a) => ({
    text: a.text,
    cls: a.role === null ? null : a.match === 'exact' ? ROLE_BG[a.role] : ROLE_BG_STALE[a.role],
  }));
}
