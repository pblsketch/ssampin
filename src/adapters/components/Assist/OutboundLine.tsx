/**
 * 쌤핀 AI — 「나갈 문장」 줄 (이 패널의 시그니처)
 *
 * 입력창 **위**에 고정돼 있고, 타이핑하는 동안 실시간으로 다시 쓰인다.
 *
 * ★막지 않는다. 보여 줄 뿐이다.
 * 민감할 수 있는 표현이 걸리면 색이 바뀌고 밑줄이 그어지지만, `Enter` 는 그대로 동작한다.
 * "그래도 보내기"가 **기본 동작**이다 — 회색으로 숨기면 그게 사실상 차단이다.
 *
 * ★2026-08-25 — 이 줄은 이름값을 못 하고 있었다.
 * 「나갈 문장」이라고 써 놓고 **선생님이 친 원문**을 그렸는데, 실제로 나가는 문장은
 * 학생 이름이 별칭으로 치환된 것이다. 이 저장소는 "화면과 방침은 약속하는데 코드는
 * 안 하고 있었다"는 사고를 이미 겪었다(`redactOutbound.ts` 머리말). 그래서 이름을
 * 바꿔 약속을 내리는 대신 **코드가 이름을 따라가게** 했다.
 *
 * ★다만 **달라졌을 때만** 두 줄이 된다. 이름이 안 들어간 대부분의 질문에서는 원문과
 * 나갈 문장이 같으므로 화면이 예전과 한 글자도 다르지 않다 — 세로 공간을 한 픽셀도
 * 더 쓰지 않고, 같은 문장이 두 번 뜨는 일도 없다. 두 줄이 되는 그 드문 순간이야말로
 * 선생님이 "가림막이 진짜 돈다"를 눈으로 확인해야 하는 순간이다.
 *
 * ★이름표는 **언제나 실제로 나가는 쪽**을 가리킨다. 한 줄일 때는 그 줄이 「나갈 문장」이고,
 * 둘로 갈리면 위가 「쓴 문장」·아래가 「나갈 문장」이다. 어느 순간에도 거짓말하지 않는다.
 *
 * 설계: docs/02-design/features/ssampin-ai.input-guard.design.md §2
 *      + 2026-08-25 디자인 에이전트 협업 결정(.omc/progress.txt)
 */
import { useMemo } from 'react';

import type { AssistInputFinding, AssistInputScreening } from '@domain/rules/screenAssistInput';
import { questionHasBlockingPii, redactQuestion } from '@domain/rules/redactOutbound';
import type { KeywordGroup } from '@domain/privacy/types';

interface Props {
  readonly text: string;
  readonly screening: AssistInputScreening;
  /**
   * 학생 명단. domain 은 스토어를 import 하지 않으므로 바깥에서 넘긴다 —
   * `ask` 가 같은 명단을 받는 것과 같은 이유다.
   */
  readonly roster: readonly KeywordGroup[];
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

/**
 * 별칭(`［이름1］`)만 칩으로 띄운다.
 *
 * ★위치(offset)를 **한 번도 쓰지 않는다.** 별칭은 전각 대괄호로 스스로를 구분하므로
 * 문자열을 쪼개는 것만으로 충분하다. 원문 위치를 다시 계산하는 순간 회귀가 시작된다 —
 * 별칭은 원문보다 길어서(`박서연` 3자 → `［이름1］` 6자) 반드시 어긋난다.
 */
const ALIAS_SPLIT = /(［[^］]+］)/;

function MaskedText({ text }: { readonly text: string }) {
  return (
    <>
      {text.split(ALIAS_SPLIT).map((part, index) =>
        index % 2 === 1 ? (
          <span
            key={`${index}-${part}`}
            className="rounded border border-sp-border bg-sp-card px-1 font-sp-medium text-sp-text"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** 지금 이 문장이 어떤 상태인가. 화면이 갈라지는 기준이다. */
type Outbound =
  | { readonly kind: 'empty' }
  /** 가릴 것이 없다 — 원문이 곧 나갈 문장이다(가장 흔하다) */
  | { readonly kind: 'same' }
  | { readonly kind: 'masked'; readonly masked: string }
  /** 연락처·주민번호 — 요청 자체가 나가지 않는다 */
  | { readonly kind: 'blocked' };

/** 라벨 칸. 두 줄의 본문 시작 위치를 맞춘다 — 어긋나면 「전·후 대조」로 안 읽힌다. */
function RowLabel({ icon, label }: { readonly icon: string; readonly label: string }) {
  return (
    <span className="flex w-20 shrink-0 items-center gap-1">
      <span aria-hidden="true" className="font-sp-semibold text-sp-muted">
        {icon}
      </span>
      <span className="font-sp-medium text-sp-muted">{label}</span>
    </span>
  );
}

export function OutboundLine({ text, screening, roster, onRemoveFinding }: Props) {
  const warned = screening.severity !== null;
  const first = screening.findings[0];

  /**
   * ★여기서는 마스킹 세션을 **물리지 않는다**(`redactQuestion` 의 3번째 인자 없음).
   *
   * 미리보기가 실제 전송과 같은 번호를 내는 것은 우연이 아니다. `ask` 는 카드보다
   * **질문을 먼저** 가리므로(useAssistStore.ts — `redactQuestion` 호출이 카드 루프보다
   * 앞선다) 새 세션도 `［이름1］` 부터 똑같이 센다. 그 순서가 뒤집히면 이 줄이 조용히
   * 틀린 번호를 보여준다 — 타입 검사도 린트도 아무 말 안 하므로 테스트로 못 박았다
   * (`assistOutboundPreview.test.ts`).
   *
   * 반대로 실제 세션을 물리면 타이핑하는 내내 번호가 올라간다(［이름1］→［이름7］).
   */
  const outbound = useMemo<Outbound>(() => {
    if (text.length === 0) return { kind: 'empty' };
    // ★연락처 검사가 먼저다. 안 그러면 "나간다고 써 놓고 안 나가는" 반대편 거짓말이 된다.
    if (questionHasBlockingPii(text)) return { kind: 'blocked' };
    const { masked } = redactQuestion(text, roster);
    return masked === text ? { kind: 'same' } : { kind: 'masked', masked };
  }, [text, roster]);

  const split = outbound.kind === 'masked' || outbound.kind === 'blocked';

  /**
   * ★스크린 리더 낭독 폭주 방지 — 소리로 알리는 것은 **문장이 아니라 상태 요약**이다.
   *
   * 예전에는 컨테이너 전체에 `aria-live` 가 걸려 있어 **글자 하나 칠 때마다 문장 전체가
   * 다시 낭독**됐다. 두 줄이 되면 그 문제가 두 배가 된다. 요약은 상태가 실제로 바뀔 때만
   * 달라지므로(문자열이 같으면 다시 읽지 않는다) 낭독이 전환 순간 1회로 줄어든다.
   * 걸린 개수를 넣지 않은 것도 같은 이유다 — 넣으면 이름 하나 칠 때마다 문자열이 바뀐다.
   */
  const live = [
    outbound.kind === 'blocked' ? '연락처나 주민번호가 있어 이 질문은 보내지 않습니다.' : '',
    outbound.kind === 'masked' ? '학생 이름을 가려서 보냅니다.' : '',
    warned && first ? `주의: ${first.label}가 들어 있습니다.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={[
        'rounded-lg bg-sp-bg px-3 py-2 text-xs',
        'border-l-2',
        warned ? 'border-l-sp-warning' : 'border-l-sp-border',
      ].join(' ')}
    >
      {/* ★소리로 알리는 영역은 이 요약 노드 하나뿐이다. 아래 문장 줄에는 aria-live 를 두지 않는다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>

      {/* ① 선생님이 친 문장 — 물결 밑줄은 **여기에만** 긋는다(위치가 원문 기준이므로) */}
      <div className="flex items-start gap-1.5">
        {/* 색 단독으로 뜻을 전하지 않는다 — 아이콘 + 라벨을 함께 쓴다 */}
        <RowLabel icon={warned ? '⚠' : split ? '·' : '↗'} label={split ? '쓴 문장' : '나갈 문장'} />
        <span className="min-w-0 flex-1 break-words text-sp-text">
          {outbound.kind === 'empty' ? (
            <span className="text-sp-muted">입력하면 나갈 문장이 여기 미리 보여요</span>
          ) : (
            <Highlighted text={text} findings={screening.findings} />
          )}
        </span>
      </div>

      {/* ② 실제로 나가는 문장 — **달라졌을 때만** 뜬다. 같으면 ①이 곧 나갈 문장이다. */}
      {outbound.kind === 'masked' && (
        <div className="mt-2 flex items-start gap-1.5 border-t border-sp-border pt-2">
          <RowLabel icon="↗" label="나갈 문장" />
          <span className="min-w-0 flex-1 break-words text-sp-text">
            <MaskedText text={outbound.masked} />
          </span>
        </div>
      )}

      {/* ②' 연락처·주민번호 — 실제로 `ask` 가 여기서 끊는다(요청이 나가지 않는다) */}
      {outbound.kind === 'blocked' && (
        <div className="mt-2 flex items-start gap-1.5 border-t border-sp-border pt-2">
          <RowLabel icon="⨯" label="안 나가요" />
          <span className="min-w-0 flex-1 break-words text-sp-text">
            연락처·주민번호는 AI에 보내지 않아요. 그 부분을 빼면 보낼 수 있어요.
          </span>
        </div>
      )}

      {/* ③ 경고 안내 — 예전 그대로. 두 줄 아래에 공통으로 붙는다. */}
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
