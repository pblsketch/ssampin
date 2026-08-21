/**
 * 쌤핀 AI — 「나갈 문장」 줄 (이 패널의 시그니처)
 *
 * 입력창 **위**에 고정돼 있고, 타이핑하는 동안 실시간으로 다시 쓰인다.
 *
 * ★막지 않는다. 보여 줄 뿐이다.
 * 민감할 수 있는 표현이 걸리면 색이 바뀌고 밑줄이 그어지지만, `Enter` 는 그대로 동작한다.
 * "그래도 보내기"가 **기본 동작**이다 — 회색으로 숨기면 그게 사실상 차단이다.
 *
 * 설계: docs/02-design/features/ssampin-ai.input-guard.design.md §2
 */
import type { AssistInputFinding, AssistInputScreening } from '@domain/rules/screenAssistInput';

interface Props {
  readonly text: string;
  readonly screening: AssistInputScreening;
  readonly onRemoveFinding: (finding: AssistInputFinding) => void;
}

/** 걸린 구간에 밑줄을 긋는다. `<mark>` 라 스크린 리더도 읽는다. */
function Highlighted({
  text,
  findings,
}: {
  readonly text: string;
  readonly findings: readonly AssistInputFinding[];
}) {
  if (findings.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  findings.forEach((finding, index) => {
    if (finding.start < cursor) return; // 겹치면 앞선 것만 표시
    if (finding.start > cursor) parts.push(text.slice(cursor, finding.start));
    parts.push(
      <mark
        key={`${finding.start}-${index}`}
        aria-label={`주의: ${finding.label}`}
        className="bg-transparent text-sp-text underline decoration-wavy decoration-sp-warning underline-offset-2"
      >
        {text.slice(finding.start, finding.end)}
      </mark>,
    );
    cursor = finding.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function OutboundLine({ text, screening, onRemoveFinding }: Props) {
  const warned = screening.severity !== null;
  const first = screening.findings[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'rounded-lg bg-sp-bg px-3 py-2 text-xs',
        'border-l-2',
        warned ? 'border-l-sp-warning' : 'border-l-sp-border',
      ].join(' ')}
    >
      <div className="flex items-start gap-1.5">
        {/* 색 단독으로 뜻을 전하지 않는다 — 아이콘 + 라벨을 함께 쓴다 */}
        <span aria-hidden="true" className="shrink-0 font-sp-semibold text-sp-muted">
          {warned ? '⚠' : '↗'}
        </span>
        <span className="shrink-0 font-sp-medium text-sp-muted">나갈 문장</span>
        <span className="min-w-0 flex-1 break-words text-sp-text">
          {text.length === 0 ? (
            <span className="text-sp-muted">아직 아무것도 나가지 않아요</span>
          ) : (
            <Highlighted text={text} findings={screening.findings} />
          )}
        </span>
      </div>

      {warned && first && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sp-text">
            <span className="font-sp-semibold">{first.label}</span>가 들어 있어요. AI에 보내면
            학습에 쓰일 수 있고 되돌릴 수 없어요.
          </span>
          <button
            type="button"
            onClick={() => onRemoveFinding(first)}
            className="rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-sp-text hover:bg-sp-surface"
          >
            이 부분 지우기
          </button>
        </div>
      )}
    </div>
  );
}
