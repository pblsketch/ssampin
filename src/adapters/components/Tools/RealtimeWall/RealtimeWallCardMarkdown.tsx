import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

/**
 * v2.1 — 카드 본문 마크다운 렌더 wrapper (Plan §B / Design v2.1 §5.5).
 *
 * 보안 (회귀 위험 #7 — `dangerouslySetInnerHTML` 절대 부재):
 * - react-markdown은 자체적으로 `dangerouslySetInnerHTML` 사용 안 함 (선언적 ReactNode 트리)
 * - `allowedElements` 7종 화이트리스트만 허용
 * - `unwrapDisallowed: true` — 차단된 요소는 plain text로 unwrap
 *
 * 화이트리스트 (Plan FR-B8 / Design v2.1 §2.4 / §5.5):
 *   ['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']
 *
 * 차단 (모두 plain text 변환):
 * - heading (h1-h6)
 * - link (`<a>` — linkUrl 별도 필드로 OG 처리)
 * - image (`<img>` — images 필드 별도 처리)
 * - code / pre / table
 * - **marquee / iframe / script / svg / object / embed / video / audio** (XSS — fuzz 테스트로 검증)
 *
 * remark-gfm 미사용 (보안 + 번들 ~20KB 절감). blockquote는 CommonMark 기본 지원.
 *
 * v3+: DOMPurify 추가 검토 (현 v2.1은 react-markdown 단독 신뢰).
 */

const ALLOWED_ELEMENTS = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote'] as const;

const COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="text-sm text-sp-text leading-relaxed whitespace-pre-wrap">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-sp-text">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-sp-text">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-sp-text space-y-0.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-sp-text space-y-0.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-sky-400/40 pl-3 text-sm text-sp-muted italic my-2">
      {children}
    </blockquote>
  ),
};

interface RealtimeWallCardMarkdownProps {
  readonly text: string;
  readonly className?: string;
}

export function RealtimeWallCardMarkdown({
  text,
  className,
}: RealtimeWallCardMarkdownProps) {
  if (!text || text.length === 0) return null;
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={[...ALLOWED_ELEMENTS]}
        unwrapDisallowed
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
