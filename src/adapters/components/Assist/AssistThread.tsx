/**
 * 쌤핀 AI — 대화 영역
 *
 * ★숫자 카드가 AI 문장보다 **먼저** 뜬다.
 * 조회는 선생님 컴퓨터에서 끝나므로, 모델이 느려도 심지어 죽어도 답의 절반은 이미 보인다(P5).
 *
 * 말풍선을 쓰지 않는다 — **카드(앱 데이터) vs 평문(AI)** 의 대비로 구분한다.
 * 기존 고객지원 챗봇과 시각적으로 다른 물건임을 그렇게 드러낸다.
 */
import { useEffect, useRef } from 'react';

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
  undone: '미완료',
};

/** 숫자 뒤에 붙일 단위. 기본은 '명'(사람 수 집계가 대부분이라서). */
const FIELD_UNIT: Readonly<Record<string, string>> = {
  undone: '개',
};

function formatValue(key: string, value: unknown): string {
  if (typeof value === 'number') return `${value}${FIELD_UNIT[key] ?? '명'}`;
  if (typeof value === 'string') return value;
  return '';
}

/** 목록형 결과(할 일 등)의 한 항목. 화면 전용이라 느슨한 모양으로 받는다. */
interface ListItem {
  readonly [key: string]: unknown;
}

function isListOfRecords(value: unknown): value is readonly ListItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'object' && v !== null)
  );
}

/** 숫자 카드 — 앱이 조회한 값. 모델을 거치지 않은 사실이다. */
function DataCard({ tool, data }: { readonly tool: string; readonly data: ToolResultShape }) {
  const scalarEntries = Object.entries(data).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  );
  // 할 일처럼 목록으로 오는 결과. 예전에는 숫자·글자만 그려서 **할 일 카드가 텅 비었다**
  // — "앱이 조회한 사실이 먼저"라는 약속이 목록형에서만 깨져 있었다(2026-08-23 신고).
  const listEntries: (readonly [string, readonly ListItem[]])[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (isListOfRecords(value)) listEntries.push([key, value]);
  }

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
            <dd className="text-sm font-sp-semibold text-sp-text">{formatValue(key, value)}</dd>
          </div>
        ))}
      </dl>

      {listEntries.map(([key, items]) => (
        <ul key={key} className="mt-2 flex flex-col gap-1 border-t border-sp-border pt-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-baseline gap-2 text-sm">
              <span aria-hidden="true" className="shrink-0 text-sp-muted">
                {item.done === true ? '✓' : '•'}
              </span>
              <span className="min-w-0 flex-1 break-words text-sp-text">
                {typeof item.title === 'string' ? item.title : ''}
              </span>
              {typeof item.due === 'string' && (
                <span className="shrink-0 text-xs text-sp-muted">~{item.due.slice(5)}</span>
              )}
              {/* 색 단독 표기 금지 — 아이콘 + 한국어 라벨 + 굵기로 뜻을 전한다 */}
              {item.overdue === true && (
                <span className="shrink-0 text-xs font-sp-semibold text-sp-text">⚠ 지남</span>
              )}
            </li>
          ))}
        </ul>
      ))}

      {scalarEntries.length === 0 && listEntries.length === 0 && (
        <p className="text-xs text-sp-muted">조회 결과가 없어요</p>
      )}
    </div>
  );
}

/** 축소 사유별 한국어 한 줄. **오류처럼 보이지 않게** 담담하게 쓴다. */
const DEGRADED_MESSAGE: Readonly<Record<string, string>> = {
  budget: '이번 달 AI 사용량을 다 썼어요. 숫자는 그대로 보실 수 있어요.',
  unavailable: 'AI 요약은 지금 사용할 수 없어요. 숫자는 그대로 보실 수 있어요.',
  upstream: 'AI가 잠시 응답하지 않아요. 숫자는 그대로 보실 수 있어요.',
  offline: '인터넷이 끊겨 AI 요약을 못 받았어요. 숫자는 그대로 보실 수 있어요.',
  timeout: 'AI 응답이 늦어 기다리기를 멈췄어요. 숫자는 그대로 보실 수 있어요.',
  unreachable: 'AI 서버에 연결하지 못했어요. 숫자는 그대로 보실 수 있어요.',
};

export function AssistThread({ turns }: { readonly turns: readonly AssistTurn[] }) {
  // 새 답은 항상 맨 아래에 붙는다. 스크롤이 안 따라가면 답이 화면 밖에서 조용히 생긴다.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
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
