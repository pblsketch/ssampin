import { parseDescription, parseInlineMarks } from '@usecases/releaseNotes/parseDescription';
import type { InlineNode } from '@usecases/releaseNotes/parseDescription';

interface DescriptionRendererProps {
  description: string | null | undefined;
}

/**
 * release-notes.json description 4슬롯 텍스트를 React 트리로 렌더.
 *
 * UpdateNotification 모달과 AppInfoSection 릴리즈 노트 섹션이 공유한다.
 * 4슬롯 구조 가이드는 `docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md`.
 */
export function DescriptionRenderer({ description }: DescriptionRendererProps) {
  const nodes = parseDescription(description);
  if (nodes.length === 0) return null;

  return (
    <div className="mt-1 space-y-2">
      {nodes.map((node, i) => {
        if (node.type === 'paragraph') {
          return (
            <p key={i} className="text-sp-muted text-xs leading-relaxed">
              <InlineNodes nodes={node.content} boldClassName="font-semibold text-sp-text/90" />
            </p>
          );
        }

        // bulletList
        return (
          <ul key={i} className="list-none space-y-0.5">
            {node.items.map((item, j) => (
              <li
                key={j}
                className={[
                  'flex items-start gap-1.5 text-xs text-sp-muted leading-relaxed',
                  item.level === 2 ? 'pl-4' : '',
                ].join(' ')}
              >
                <span className="shrink-0 text-sp-muted mt-0.5" aria-hidden="true">
                  {item.level === 2 ? '◦' : '·'}
                </span>
                <span>
                  <InlineNodes nodes={item.nodes} boldClassName="font-semibold text-sp-text/80" />
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

interface InlineNodesProps {
  nodes: InlineNode[];
  boldClassName: string;
}

function InlineNodes({ nodes, boldClassName }: InlineNodesProps) {
  return (
    <>
      {nodes.map((inline, k) => {
        if (inline.kind === 'bold') {
          return (
            <strong key={k} className={boldClassName}>
              {inline.value}
            </strong>
          );
        }
        if (inline.kind === 'link') {
          return (
            <a
              key={k}
              href={inline.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sp-accent underline underline-offset-2 hover:opacity-80 break-all"
            >
              {inline.value}
            </a>
          );
        }
        return <span key={k}>{inline.value}</span>;
      })}
    </>
  );
}

/**
 * 한 줄 텍스트(하이라이트 등)를 bold·링크 인라인 마크업으로 렌더.
 * UpdateNotification·AppInfoSection 의 하이라이트 항목이 공유한다.
 */
export function InlineMarkup({
  text,
  boldClassName = 'font-semibold',
}: {
  text: string;
  boldClassName?: string;
}) {
  return <InlineNodes nodes={parseInlineMarks(text)} boldClassName={boldClassName} />;
}
