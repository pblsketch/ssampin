import type { CoolPiiKind, CoolPiiSpan } from '@domain/privacy/coolMessagePii';

/**
 * 개인정보로 탐지된 구간을 빨갛게 표시해 보여주는 읽기 전용 텍스트.
 *
 * ## 지우지 않는다 — 표시만 한다
 * 자동으로 가리면 선생님이 "가려졌겠지" 하고 넘어간다. 그래서 **눈에 띄게 두고**
 * 지울지는 사람이 정하게 한다. 원본(`coolm-helper`)의 판단을 따른 것이다.
 *
 * ## 색만으로 뜻을 전달하지 않는다
 * 빨간색에 더해 **점선 밑줄**을 함께 준다. 색을 구분하기 어려운 사용자도
 * 어디가 개인정보인지 알 수 있어야 한다(WCAG 1.4.1).
 */

const KIND_LABEL: Readonly<Record<CoolPiiKind, string>> = {
  phone: '전화번호',
  rrn: '주민등록번호',
  email: '이메일',
  honorific: '이름(호칭으로 추정)',
  roster: '이름(명렬에 있음)',
};

interface PiiTextProps {
  readonly text: string;
  readonly spans: readonly CoolPiiSpan[];
  readonly className?: string;
}

export function PiiText({ text, spans, className = '' }: PiiTextProps) {
  if (spans.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ordered.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(<span key={`t${i}`}>{text.slice(cursor, span.start)}</span>);
    }
    parts.push(
      <mark
        key={`m${i}`}
        // bg-red-500 은 실제 색이라 투명도 수식이 동작한다.
        // (sp-* 토큰은 var() 라서 /15 같은 수식이 먹지 않는다 — 쓰면 안 된다.)
        className="bg-red-500/15 text-sp-error rounded px-0.5 underline decoration-dotted decoration-sp-error underline-offset-2"
        title={`${KIND_LABEL[span.kind]}로 보입니다`}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });

  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return (
    <span className={className}>
      {parts}
      <span className="sr-only">
        {` (개인정보로 보이는 부분 ${ordered.length}곳이 표시되어 있습니다)`}
      </span>
    </span>
  );
}
