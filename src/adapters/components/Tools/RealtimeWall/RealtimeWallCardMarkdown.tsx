import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

/**
 * @deprecated v1.10.6+ (2026-04-26) — 학생 카드/댓글 본문에서 마크다운 렌더가 plain text로 교체됨.
 *   - production 코드(RealtimeWallCard / RealtimeWallCommentList)에서 더 이상 import되지 않음.
 *   - XSS fuzz 테스트(`RealtimeWallCardMarkdown.fuzz.test.tsx`)와 `StudentMarkdownPreviewToggle`(deprecated)만 참조함.
 *   - 다음 마이너 릴리즈에서 본 파일 + fuzz 테스트 삭제 예정.
 *   - 신규 호출처 추가 금지.
 *
 * v2.1 — 카드 본문 마크다운 렌더 wrapper (Plan §B / Design v2.1 §5.5).
 *
 * 보안 (회귀 위험 #7 — `dangerouslySetInnerHTML` 절대 부재):
 * - react-markdown은 자체적으로 `dangerouslySetInnerHTML` 사용 안 함 (선언적 ReactNode 트리)
 * - `allowedElements` 화이트리스트만 허용
 * - `unwrapDisallowed: true` — 차단된 요소는 plain text로 unwrap
 *
 * 화이트리스트 (Plan FR-B8 / Design v2.1 §2.4 / §5.5):
 *   ['h1', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']
 *
 * 2026-04-26 — 카드 제목 viewerRole 비대칭 결함 fix (회귀 #11):
 *   StudentSubmitForm은 제목 입력을 `# 제목\n\n본문` 마크다운으로 합성한다
 *   (StudentSubmitForm.tsx line 134-140). 기존에는 h1이 화이트리스트 외라
 *   `unwrapDisallowed`로 plain text 처리되어 학생/교사 모두 제목이 본문과 같은
 *   톤으로 보였고, 일부 환경에서 줄바꿈 위치 차이 때문에 학생만 첫 줄이
 *   "제목처럼" 보이는 시각 불일치가 발생. h1을 화이트리스트에 추가하고
 *   동일한 굵은 톤 컴포넌트로 매핑해 양쪽 카드 픽셀 일치(Padlet 동일뷰 §0.1).
 *   h2~h6은 여전히 차단 (학생 입력 경로 없음 + XSS 표면 최소화).
 *
 * 차단 (모두 plain text 변환):
 * - heading h2~h6 (학생은 h1만 입력 가능)
 * - link (`<a>` — linkUrl 별도 필드로 OG 처리)
 * - image (`<img>` — images 필드 별도 처리)
 * - code / pre / table
 * - **marquee / iframe / script / svg / object / embed / video / audio** (XSS — fuzz 테스트로 검증)
 *
 * remark-gfm 미사용 (보안 + 번들 ~20KB 절감). blockquote는 CommonMark 기본 지원.
 *
 * v3+: DOMPurify 추가 검토 (현 v2.1은 react-markdown 단독 신뢰).
 */

const ALLOWED_ELEMENTS = ['h1', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote'] as const;

const COMPONENTS: Components = {
  // 2026-04-26 — 카드 제목 (StudentSubmitForm `# 제목\n\n본문` 합성).
  // 학생/교사 동일 토큰 — viewerRole 분기 0건 (Padlet 동일뷰 §0.1).
  // 본문 sp-text와 같은 색상으로 대비 보장 (회귀 #7 96조합 정합).
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-sp-text leading-snug mb-1.5">
      {children}
    </h1>
  ),
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
