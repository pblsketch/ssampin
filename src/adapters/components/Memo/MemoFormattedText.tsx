import { memo, useMemo } from 'react';
import { parseInlineMarkdown } from '@domain/rules/memoRules';
import type { FormattedSegment } from '@domain/rules/memoRules';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { MEMO_FONT_SIZE_CLASS } from '@domain/valueObjects/MemoFontSize';

interface MemoFormattedTextProps {
  content: string;
  fontSize?: MemoFontSize;
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

function openExternalLink(url: string): void {
  const api = window.electronAPI;
  if (api?.openExternal !== undefined) {
    void api.openExternal(url);
    return;
  }
  // 브라우저 폴백
  window.open(url, '_blank', 'noopener,noreferrer');
}

function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string): void {
  e.preventDefault();
  e.stopPropagation();
  openExternalLink(href);
}

function MemoFormattedTextInner({ content, fontSize, className, style }: MemoFormattedTextProps) {
  const segments = useMemo(() => parseInlineMarkdown(content), [content]);

  // 세그먼트를 개행 기준으로 나눠 <br /> 처리. 링크는 개행 기준 분할 후에도 href 유지.
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
      if (part.length === 0) continue;

      if (seg.href !== undefined) {
        // break-all: 긴 URL이 텍스트 표시용인 경우(제목 미지정 시) 카드 경계 밖으로 삐져나가지 않도록.
        const linkCls = [cls, 'text-sp-accent underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer break-all'].filter(Boolean).join(' ');
        elements.push(
          <a
            key={`a-${key++}`}
            href={seg.href}
            onClick={(e) => handleLinkClick(e, seg.href!)}
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
            title={seg.href}
          >
            {part}
          </a>,
        );
      } else if (cls) {
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

  const sizeClass = MEMO_FONT_SIZE_CLASS[fontSize ?? 'base'];
  // sizeClass를 뒤에 두어 호출부 className에 text-xx가 있어도 fontSize가 이긴다
  // break-words: 긴 단어(URL 등)가 카드 너비를 넘지 않도록 자동 줄바꿈
  const combinedClassName = [className, sizeClass, 'break-words'].filter(Boolean).join(' ');
  return <div className={combinedClassName} style={style}>{elements}</div>;
}

export const MemoFormattedText = memo(MemoFormattedTextInner);
