/**
 * 온라인 교무실 — 저장된 본문을 화면에 그린다 (ADR-069)
 *
 * **본문을 그리는 자리는 여기 하나뿐이다.** 글 상세·미리보기·나중에 붙을
 * 어디서든 이 부품을 쓴다. 두 벌로 갈리면 한쪽만 안전하게 되는 사고가 난다.
 *
 * 안전에 관하여
 * ─────────────
 * - `dangerouslySetInnerHTML` 을 **쓰지 않는다**(회귀 #7). 저장된 값은 React
 *   글자 노드로 들어가므로 태그로 해석될 여지가 없다.
 * - 무엇을 통과시킬지는 도메인(`staffRoomRichText.ts`)이 이미 걸렀다. 여기서는
 *   걸러진 결과를 **아는 모양으로만** 그린다.
 * - 색과 크기는 이름(토큰)으로 오고, 그 이름에 해당하는 값만 여기서 붙인다.
 *   저장된 문자열을 그대로 style 에 넣지 않는다.
 * - 링크는 도메인에서 이미 `http`·`https`·`mailto` 만 통과시켰다. 그래도 여는 방식은
 *   **바깥 브라우저**다 — 앱 창 안에서 남이 준 주소를 열면 그 페이지가 앱과 같은
 *   자리에 앉는다.
 */
import {
  parseStaffRoomRichText,
  type StaffRoomTextColor,
  type StaffRoomTextSize,
  type StaffRoomTextSpan,
} from '@domain/rules/staffRoomRichText';
import type { StaffRoomBodyFormat } from '@domain/entities/StaffRoomBoard';

/**
 * 색 이름 → 실제로 붙일 값.
 *
 * 전부 `sp-*` 토큰을 가리킨다 — 하드코딩 색 금지 규칙을 지키면서, 라이트·다크에서
 * 각각 알맞은 색이 나오게 하기 위해서다.
 *
 * ⚠️ 도메인에 색을 하나 더하면 **여기도 더해야 한다.** 빠뜨리면 그 색으로 쓴 글이
 * 기본색으로 보인다. 같은 폴더의 테스트가 두 목록이 어긋나면 실패시킨다.
 */
export const STAFFROOM_TEXT_COLOR_STYLE: Record<StaffRoomTextColor, string | undefined> = {
  default: undefined,
  accent: 'var(--sp-accent)',
  error: 'var(--sp-error)',
  warning: 'var(--sp-warning)',
  success: 'var(--sp-success)',
  info: 'var(--sp-info)',
  muted: 'var(--sp-muted)',
};

/** 크기 이름 → 실제로 붙일 값. rem 이라 앱 글자 크기 설정을 따라 함께 커진다 */
export const STAFFROOM_TEXT_SIZE_STYLE: Record<StaffRoomTextSize, string | undefined> = {
  small: '0.875rem',
  normal: undefined,
  large: '1.125rem',
  xlarge: '1.375rem',
};

/**
 * 링크를 **앱 밖 브라우저**로 연다.
 *
 * 앱 창 안에서 열면 남이 올린 주소의 페이지가 쌤핀과 같은 자리에 앉는다.
 * 옆핀 메모(MemoFormattedText)가 쓰는 방식과 같다.
 */
function openExternalLink(url: string): void {
  const api = window.electronAPI;
  if (api?.openExternal !== undefined) {
    void api.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function spanClassName(span: StaffRoomTextSpan): string {
  const parts: string[] = [];
  if (span.bold) parts.push('font-bold');
  if (span.italic) parts.push('italic');
  return parts.join(' ');
}

/**
 * 밑줄·취소선을 **한 값으로 합쳐서** 준다.
 *
 * ⚠️ `underline` 과 `line-through` 클래스를 함께 걸면 안 된다. 둘 다 같은 속성
 * (`text-decoration-line`)을 건드려서 나중에 정의된 하나만 이기고 **다른 하나는
 * 조용히 사라진다.** 실제로 그렇게 만들었다가 QA 에서 잡았다 — 밑줄+취소선을
 * 같이 건 글자에서 밑줄이 없어졌다.
 *
 * CSS 는 한 속성에 두 값을 함께 받으므로(`underline line-through`) 그렇게 준다.
 */
function decorationOf(span: StaffRoomTextSpan): string | undefined {
  const parts: string[] = [];
  if (span.underline) parts.push('underline');
  if (span.strikethrough) parts.push('line-through');
  return parts.length === 0 ? undefined : parts.join(' ');
}

interface StaffRoomRichTextProps {
  body: string;
  bodyFormat: StaffRoomBodyFormat;
  className?: string;
}

export function StaffRoomRichText({
  body,
  bodyFormat,
  className = '',
}: StaffRoomRichTextProps): JSX.Element {
  // 맨글 — 줄바꿈만 살리고 나머지는 글자 그대로. 서식 편집기가 붙기 전에 쓰인
  // 글이 전부 여기로 온다.
  if (bodyFormat === 'plain') {
    return (
      <div className={`whitespace-pre-wrap break-words text-sp-text ${className}`}>{body}</div>
    );
  }

  const blocks = parseStaffRoomRichText(body);

  // 읽을 수 없는 본문 — 하얀 화면 대신 무슨 일인지 한국어로 알린다.
  // 조용히 비워 두면 선생님은 "글이 사라졌다"로 겪는다.
  if (blocks.length === 0) {
    return (
      <div className={`text-sm text-sp-muted ${className}`}>
        내용을 불러오지 못했습니다. 글을 쓴 분에게 알려주세요.
      </div>
    );
  }

  return (
    <div className={`break-words text-sp-text ${className}`}>
      {blocks.map((block, blockIndex) => (
        // 문단은 순서가 바뀌지 않고 다시 그릴 때마다 통째로 만들어지므로
        // 자리(번호)로 구분해도 안전하다
        <p key={blockIndex} className="min-h-[1.5em] leading-relaxed">
          {block.spans.map((span, spanIndex) => {
            const style = {
              color: STAFFROOM_TEXT_COLOR_STYLE[span.color],
              fontSize: STAFFROOM_TEXT_SIZE_STYLE[span.size],
              textDecorationLine: decorationOf(span),
            };

            if (span.href !== null) {
              return (
                <a
                  key={spanIndex}
                  href={span.href}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternalLink(span.href!);
                  }}
                  // 혹시 기본 동작으로 열리더라도 새 창을 여는 쪽이 열린 창을
                  // 조작하지 못하게 한다
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${spanClassName(span)} text-sp-accent underline-offset-2 hover:opacity-80`}
                  // 링크는 밑줄이 기본이다. 여기서 style 로 함께 주지 않으면
                  // 취소선이 걸린 링크에서 밑줄이 조용히 사라진다(같은 속성 다툼).
                  style={{
                    ...style,
                    textDecorationLine: span.strikethrough ? 'underline line-through' : 'underline',
                  }}
                >
                  {span.text}
                </a>
              );
            }

            return (
              <span key={spanIndex} className={spanClassName(span)} style={style}>
                {span.text}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
