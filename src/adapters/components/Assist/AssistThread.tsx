/**
 * 쌤핀 AI — 대화 영역
 *
 * ★숫자 카드가 AI 문장보다 **먼저** 뜬다.
 * 조회는 선생님 컴퓨터에서 끝나므로, 모델이 느려도 심지어 죽어도 답의 절반은 이미 보인다(P5).
 *
 * 말풍선을 쓰지 않는다 — **카드(앱 데이터) vs 평문(AI)** 의 대비로 구분한다.
 * 기존 고객지원 챗봇과 시각적으로 다른 물건임을 그렇게 드러낸다.
 */
import type { AssistTurn } from '@adapters/stores/useAssistStore';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';

/** 도구 id → 화면에 쓰는 한국어 이름 */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  get_attendance_summary: '출결 요약',
  count_students: '학생 수',
  list_classes: '담당 학급',
  get_records_stats: '기록 통계',
  get_my_todos: '할 일',
};

/** 필드 이름 → 화면에 쓰는 한국어 */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  date: '날짜',
  className: '학급',
  present: '출석',
  absent: '결석',
  late: '지각',
  early: '조퇴',
  classAbsence: '결과',
  count: '인원',
  period: '기간',
  total: '전체',
};

function formatValue(value: unknown): string {
  if (typeof value === 'number') return `${value}명`;
  if (typeof value === 'string') return value;
  return '';
}

/** 숫자 카드 — 앱이 조회한 값. 모델을 거치지 않은 사실이다. */
function DataCard({ tool, data }: { readonly tool: string; readonly data: ToolResultShape }) {
  const scalarEntries = Object.entries(data).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  );

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="rounded-full bg-sp-bg px-2 py-0.5 text-xs font-sp-medium text-sp-muted">
          앱에서 조회
        </span>
        <span className="text-xs text-sp-muted">{TOOL_LABEL[tool] ?? tool}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {scalarEntries.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-sp-muted">{FIELD_LABEL[key] ?? key}</dt>
            <dd className="text-sm font-sp-semibold text-sp-text">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 축소 사유별 한국어 한 줄. **오류처럼 보이지 않게** 담담하게 쓴다. */
const DEGRADED_MESSAGE: Readonly<Record<string, string>> = {
  budget: '이번 달 AI 사용량을 다 썼어요. 숫자는 그대로 보실 수 있어요.',
  unavailable: 'AI 요약은 지금 사용할 수 없어요. 숫자는 그대로 보실 수 있어요.',
  upstream: 'AI가 잠시 응답하지 않아요. 숫자는 그대로 보실 수 있어요.',
  offline: '인터넷이 끊겨 AI 요약을 못 받았어요. 숫자는 그대로 보실 수 있어요.',
};

export function AssistThread({ turns }: { readonly turns: readonly AssistTurn[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-2">
          {/* 사용자 질문 — 오른쪽 정렬, 최대 88% */}
          <div className="flex justify-end">
            <p className="max-w-[88%] rounded-lg bg-sp-card px-3 py-2 text-sm text-sp-text">
              {turn.question}
            </p>
          </div>

          {turn.cards.map((card, index) => (
            <DataCard key={`${turn.id}-${index}`} tool={card.tool} data={card.data} />
          ))}

          {/* ★"이름은 화면에 남고, 숫자만 밖으로 나간다"를 눈으로 확인시켜 주는 줄.
              가린 것과 통째로 뺀 것은 뜻이 달라서 따로 말한다. */}
          {(turn.maskedCount > 0 || turn.blankedCount > 0) && (
            <p className="text-xs text-sp-success">
              {turn.maskedCount > 0 && `이름·학번 ${turn.maskedCount}곳을 가리고 보냈어요. `}
              {turn.blankedCount > 0 && `연락처가 있어 ${turn.blankedCount}칸은 빼고 보냈어요. `}위
              카드는 그대로예요.
            </p>
          )}

          {turn.status === 'thinking' && (
            <p role="status" aria-live="polite" className="text-sm text-sp-muted">
              생각 중…
            </p>
          )}

          {turn.status === 'blocked' && (
            <div className="rounded-xl border-l-2 border-l-sp-warning bg-sp-card p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
                <span aria-hidden="true">⚠</span> 보내지 않았어요
              </p>
              <p className="text-sm text-sp-text">{turn.blockedMessage}</p>
            </div>
          )}

          {turn.answer.length > 0 && (
            <p className="text-sm leading-relaxed text-sp-text">{turn.answer}</p>
          )}

          {turn.degraded && (
            <p className="text-xs text-sp-muted">{DEGRADED_MESSAGE[turn.degraded]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
