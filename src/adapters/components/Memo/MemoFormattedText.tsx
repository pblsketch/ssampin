import { memo, useMemo } from 'react';
import { parseInlineMarkdown } from '@domain/rules/memoRules';
import type { FormattedSegment } from '@domain/rules/memoRules';

interface MemoFormattedTextProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

function segmentClassName(seg: FormattedSegment): string {
  const classes: string[] = [];
  if (seg.bold) classes.push('font-bold');
  if (seg.underline) classes.push('underline');
  if (seg.strikethrough) classes.push('line-through');
  return classes.join(' ');
}

function MemoFormattedTextInner({ content, className, style }: MemoFormattedTextProps) {
  const segments = useMemo(() => parseInlineMarkdown(content), [content]);

  // Split segments by newline to handle <br /> correctly
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const seg of segments) {
    const parts = seg.text.split('\n');
    const cls = segmentClassName(seg);

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        elements.push(<br key={`br-${key++}`} />);
      }
      const part = parts[i] ?? '';
      if (part.length > 0) {
        if (cls) {
          elements.push(
            <span key={`s-${key++}`} className={cls}>
              {part}
            </span>,
          );
        } else {
          elements.push(<span key={`s-${key++}`}>{part}</span>);
        }
      }
    }
  }

  return <div className={className} style={style}>{elements}</div>;
}

export const MemoFormattedText = memo(MemoFormattedTextInner);
