/**
 * 쌤핀 AI — 대화 영역
 *
 * ★숫자 카드가 AI 문장보다 **먼저** 뜬다.
 * 조회는 선생님 컴퓨터에서 끝나므로, 모델이 느려도 심지어 죽어도 답의 절반은 이미 보인다(P5).
 *
 * 말풍선을 쓰지 않는다 — **카드(앱 데이터) vs 평문(AI)** 의 대비로 구분한다.
 * 기존 고객지원 챗봇과 시각적으로 다른 물건임을 그렇게 드러낸다.
 */
import { useEffect, useRef, useState } from 'react';

import type { AssistTurn } from '@adapters/stores/useAssistStore';
import type { AssistWriteProposal } from '@domain/entities/AssistWrite';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';

/** 도구 id → 화면에 쓰는 한국어 이름 */
const TOOL_LABEL: Readonly<Record<string, string>> = {
  get_attendance_summary: '출결 요약',
  count_students: '학생 수',
  list_classes: '담당 학급',
  get_records_stats: '기록 통계',
  get_my_todos: '할 일',
  get_meals: '급식',
  get_ddays: '디데이',
  get_events: '일정',
  get_timetable: '시간표',
  get_progress: '진도',
  get_memos: '메모',
  get_note_list: '노트',
  get_bookmarks: '즐겨찾기',
  get_week_overview: '이번 주',
  get_homeroom_attendance_stats: '출결 (기간)',
  get_class_attendance_stats: '수업반 출결',
  get_grade_stats: '성적 분포',
  get_seating_stats: '자리 배치',
  get_assessment_stats: '채점표',
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
  todoUndone: '남은 할 일',
  rosterSize: '학급 인원',
  daysWithIssue: '이상 있던 날',
  lessons: '수업',
  layout: '배치',
  seatCount: '자리',
  assigned: '앉음',
  empty: '빈자리',
  groupCount: '모둠',
  average: '평균',
  highest: '최고',
  lowest: '최저',
  maxScore: '만점',
  graded: '채점 완료',
  partial: '채점 중',
  marked: '채점',
  fullScore: '만점',
  subject: '과목',
  kind: '종류',
};

/** 숫자 뒤에 붙일 단위. 기본은 '명'(사람 수 집계가 대부분이라서). */
const FIELD_UNIT: Readonly<Record<string, string>> = {
  undone: '개',
  todoUndone: '개',
  // `total` 은 기록·메모·노트·즐겨찾기의 **건수**다. 기본값 '명'을 그대로 두면
  // "기록 34명"처럼 사람 수인 척하는 숫자가 화면에 남는다.
  total: '건',
  lessons: '교시',
  daysWithIssue: '일',
  seatCount: '개',
  groupCount: '개',
  average: '점',
  highest: '점',
  lowest: '점',
  maxScore: '점',
  fullScore: '점',
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

/**
 * 목록 항목의 **본문**으로 쓸 필드 — 앞에 있는 것부터 찾아 처음 비지 않은 값을 쓴다.
 *
 * ★도구마다 본문에 해당하는 필드 이름이 다르다(할 일은 title, 급식은 dishes, 시간표는
 * subject…). 예전에는 `title` 하나만 그려서 **할 일 말고는 카드가 전부 백지**였다 —
 * "앱이 조회한 사실이 먼저"라는 약속이 도구를 늘릴 때마다 조용히 깨지는 구조였다.
 */
const LIST_TITLE_KEYS: readonly string[] = [
  'title',
  'name',
  'criterion',
  'subject',
  'unit',
  'content',
  'dishes',
  'events',
  'meal',
];

/** 항목 뒤에 작게 붙일 보조 정보. 역시 처음 비지 않은 것 하나만 쓴다. */
const LIST_TAIL_KEYS: readonly string[] = [
  'due',
  'updated',
  'domain',
  'classroom',
  'group',
  'notebook',
  'className',
  'mealType',
  'time',
];

function firstText(item: ListItem, keys: readonly string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

/** 앞뒤에 이미 쓴 필드 — 본문에서 또 보여주지 않는다. */
const LIST_SIDE_KEYS: ReadonlySet<string> = new Set(['date', ...LIST_TAIL_KEYS]);

/**
 * 글자 본문이 없는 목록 항목(출결 기간 집계 등)의 본문을 숫자로 만든다.
 *
 * ★없으면 "• 08-03" 만 남고 정작 몇 명이 결석했는지가 카드에서 사라진다. 집계 도구는
 * 애초에 글자 본문이 없으므로, 숫자를 본문으로 쓰지 않으면 카드가 백지가 된다.
 * 0 은 건너뛴다 — "지각 0 · 조퇴 0 · 결과 0"은 읽는 데 방해만 되고, 총계는 이미 위에 있다.
 */
function numericSummary(item: ListItem): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (parts.length >= 5) break;
    if (LIST_SIDE_KEYS.has(key)) continue;
    if (typeof value !== 'number' || value === 0) continue;
    parts.push(`${FIELD_LABEL[key] ?? key} ${value}${FIELD_UNIT[key] ?? ''}`);
  }
  return parts.join(' · ');
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
          {items.map((item, index) => {
            const lead = typeof item.date === 'string' ? item.date.slice(5) : '';
            const tail = firstText(item, LIST_TAIL_KEYS);
            return (
              <li key={index} className="flex items-baseline gap-2 text-sm">
                <span aria-hidden="true" className="shrink-0 text-sp-muted">
                  {item.done === true ? '✓' : '•'}
                </span>
                {lead.length > 0 && <span className="shrink-0 text-xs text-sp-muted">{lead}</span>}
                <span className="min-w-0 flex-1 break-words text-sp-text">
                  {firstText(item, LIST_TITLE_KEYS) || numericSummary(item)}
                </span>
                {tail.length > 0 && (
                  <span className="shrink-0 text-xs text-sp-muted">
                    {typeof item.due === 'string' && item.due === tail ? `~${tail.slice(5)}` : tail}
                  </span>
                )}
                {/* 색 단독 표기 금지 — 아이콘 + 한국어 라벨 + 굵기로 뜻을 전한다 */}
                {item.overdue === true && (
                  <span className="shrink-0 text-xs font-sp-semibold text-sp-text">⚠ 지남</span>
                )}
              </li>
            );
          })}
        </ul>
      ))}

      {scalarEntries.length === 0 && listEntries.length === 0 && (
        <p className="text-xs text-sp-muted">조회 결과가 없어요</p>
      )}
    </div>
  );
}

/**
 * 쓰기 **미리보기** 카드 (Phase 3).
 *
 * ★[실행]을 누르기 전에는 아무것도 바뀌지 않는다. 그래서 이 카드는 "무엇이 저장될지"를
 * 하나도 빠뜨리지 않고 보여줘야 한다 — 감추면 버튼은 확인이 아니라 요식이 된다.
 *
 * ★지우기·고치기에는 **대상의 원문**을 함께 띄운다(계획서 요구사항). 무엇을 잃는지
 * 모른 채 누르는 일이 없어야 한다. 그래서 삭제는 색이 아니라 **글자로** 경고한다.
 */
function ProposalCard({
  turnId,
  proposal,
  state,
  message,
  onRun,
}: {
  readonly turnId: string;
  readonly proposal: AssistWriteProposal;
  readonly state: string | undefined;
  readonly message: string | undefined;
  readonly onRun?: (turnId: string, proposal: AssistWriteProposal) => void;
}) {
  const isDelete = proposal.action === 'delete';
  const pending = state === 'pending';

  return (
    <div
      className={`rounded-xl border p-3 ${
        isDelete ? 'border-sp-warning bg-sp-card' : 'border-sp-border bg-sp-card'
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="rounded-full bg-sp-bg px-2 py-0.5 text-xs font-sp-medium text-sp-muted">
          {pending ? '아직 저장 안 함' : '제안'}
        </span>
        <span className="text-xs font-sp-semibold text-sp-text">{proposal.title}</span>
      </div>

      {proposal.target && (
        <div className="mb-2 rounded-lg bg-sp-bg px-2 py-1.5">
          <p className="text-xs text-sp-muted">{proposal.target.label}</p>
          <p className="break-words text-sm text-sp-text">{proposal.target.original}</p>
        </div>
      )}

      <dl className="flex flex-col gap-1">
        {proposal.fields.map((field) => (
          <div key={field.label} className="flex items-baseline gap-2">
            <dt className="shrink-0 text-xs text-sp-muted">{field.label}</dt>
            <dd className="min-w-0 flex-1 break-words text-sm text-sp-text">{field.value}</dd>
          </div>
        ))}
      </dl>

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRun?.(turnId, proposal)}
            className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg"
          >
            {isDelete ? '지우기' : '실행'}
          </button>
          <span className="text-xs text-sp-muted">
            {isDelete ? '누르면 위 내용이 사라져요' : '누르면 저장돼요'}
          </span>
        </div>
      )}

      {/* 실행 중 — 버튼을 없애 두 번 누르는 것을 막고, 멈춘 게 아니라는 것을 알린다 */}
      {state === 'running' && <p className="mt-2 text-sm text-sp-muted">저장하는 중…</p>}
      {state === 'done' && <p className="mt-2 text-sm text-sp-success">✓ {message}</p>}
      {state === 'failed' && <p className="mt-2 text-sm text-sp-text">⚠ {message}</p>}
      {/* 실행 없이 대화가 이어지면 제안은 소멸한다(계획서). 왜 버튼이 없는지 말해 준다. */}
      {state === 'expired' && (
        <p className="mt-2 text-xs text-sp-muted">
          다음 질문을 하셔서 이 제안은 취소됐어요. 필요하면 다시 말씀해 주세요.
        </p>
      )}
    </div>
  );
}

/** 한 장짜리 카드에서 학생 이름을 뽑아 제목으로 쓴다. 없으면 원래 제목으로 돌아간다. */
function studentHeading(item: AssistWriteProposal): string {
  return item.fields.find((f) => f.label === '학생')?.value ?? item.title;
}

type SplitItemState = {
  readonly kind: 'idle' | 'running' | 'done' | 'failed';
  readonly msg?: string;
};

/**
 * 말로 쓴 글을 학생별로 나눈 **미리보기 카드 묶음** (T1).
 *
 * ## 왜 한 장이 아니라 여러 장인가
 *
 * 여러 학생 이야기를 한 번에 저장하면, 한 명이 잘못 나뉘었을 때 되돌릴 방법이 통째로
 * 하나뿐이다. 학생마다 따로 [실행]을 두면 **맞는 것만 저장하고 틀린 것은 버릴 수 있다.**
 * 그래서 "모두 저장" 단추는 일부러 두지 않는다 — 한 장씩 확인하는 것이 이 기능의
 * 안전장치다(모델이 나눈 결과를 사람이 검산하는 자리).
 *
 * ## 저장한 카드를 지우지 않는 이유
 *
 * 저장한 카드가 사라지면 "방금 몇 명이 저장됐지?"를 확인할 방법이 없어진다. 그래서
 * 흐리게 두고 "저장했어요"로 바꾼다 — 목록의 길이가 변하지 않아 눈이 자리를 잃지 않는다.
 */
function ObservationSplitCards({
  items,
  expired,
  onRunOne,
}: {
  readonly items: readonly AssistWriteProposal[];
  readonly expired: boolean;
  readonly onRunOne: (proposal: AssistWriteProposal) => Promise<{ ok: boolean; message: string }>;
}) {
  const [states, setStates] = useState<Readonly<Record<number, SplitItemState>>>({});

  const run = (index: number, item: AssistWriteProposal): void => {
    // 누르는 즉시 running — 버튼이 사라져 두 번 눌리지 않는다(한 장짜리 카드와 같은 규칙).
    setStates((prev) => ({ ...prev, [index]: { kind: 'running' } }));
    void onRunOne(item)
      .then((r) =>
        setStates((prev) => ({
          ...prev,
          [index]: { kind: r.ok ? 'done' : 'failed', msg: r.message },
        })),
      )
      .catch(() =>
        setStates((prev) => ({
          ...prev,
          [index]: { kind: 'failed', msg: '저장하다가 문제가 생겼어요. 화면에서 직접 해주세요.' },
        })),
      );
  };

  const savedCount = Object.values(states).filter((s) => s.kind === 'done').length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-sp-muted">
        학생 {items.length}명으로 나눴어요. 맞는지 보시고 하나씩 저장해 주세요.
        {savedCount > 0 && ` (${savedCount}명 저장함)`}
      </p>

      {items.map((item, index) => {
        const st = states[index] ?? { kind: 'idle' as const };
        const done = st.kind === 'done';
        return (
          <div
            key={`${studentHeading(item)}-${index}`}
            className={`rounded-xl border border-sp-border bg-sp-card p-3 ${
              done ? 'opacity-60' : ''
            }`}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <span className="rounded-full bg-sp-bg px-2 py-0.5 text-xs font-sp-medium text-sp-muted">
                {done ? '저장함' : '아직 저장 안 함'}
              </span>
              <span className="text-xs font-sp-semibold text-sp-text">{studentHeading(item)}</span>
            </div>

            <dl className="flex flex-col gap-1">
              {item.fields
                .filter((f) => f.label !== '학생')
                .map((field) => (
                  <div key={field.label} className="flex items-baseline gap-2">
                    <dt className="shrink-0 text-xs text-sp-muted">{field.label}</dt>
                    <dd className="min-w-0 flex-1 break-words text-sm text-sp-text">
                      {field.value}
                    </dd>
                  </div>
                ))}
            </dl>

            {st.kind === 'idle' && !expired && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => run(index, item)}
                  className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg"
                >
                  실행
                </button>
                <span className="text-xs text-sp-muted">누르면 이 학생만 저장돼요</span>
              </div>
            )}

            {st.kind === 'running' && <p className="mt-2 text-sm text-sp-muted">저장하는 중…</p>}
            {st.kind === 'done' && <p className="mt-2 text-sm text-sp-success">✓ {st.msg}</p>}
            {st.kind === 'failed' && <p className="mt-2 text-sm text-sp-text">⚠ {st.msg}</p>}
            {st.kind === 'idle' && expired && (
              <p className="mt-2 text-xs text-sp-muted">
                다음 질문을 하셔서 이 제안은 취소됐어요. 필요하면 다시 말씀해 주세요.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 축소 사유별 한국어 한 줄. **오류처럼 보이지 않게** 담담하게 쓴다. */
const DEGRADED_MESSAGE: Readonly<Record<string, string>> = {
  // ★"이번 달"이 아니라 **하루**다(ssampin-assist 의 windowMs 는 24시간).
  //   월 단위로 말하면 선생님이 앞으로 일주일을 못 쓴다고 오해한다 — 실제로는
  //   가장 오래된 요청이 24시간을 넘기는 대로 조금씩 풀린다(2026-08-25 오너 신고).
  budget:
    '오늘 쓸 수 있는 AI 사용량을 다 썼어요. 내일 다시 물어봐 주세요. 숫자는 그대로 보실 수 있어요.',
  busy: '질문이 잠깐 몰렸어요. 1분쯤 뒤에 다시 물어봐 주세요.',
  unavailable: 'AI 요약은 지금 사용할 수 없어요. 숫자는 그대로 보실 수 있어요.',
  upstream: 'AI가 잠시 응답하지 않아요. 숫자는 그대로 보실 수 있어요.',
  offline: '인터넷이 끊겨 AI 요약을 못 받았어요. 숫자는 그대로 보실 수 있어요.',
  timeout: 'AI 응답이 늦어 기다리기를 멈췄어요. 숫자는 그대로 보실 수 있어요.',
  unreachable: 'AI 서버에 연결하지 못했어요. 숫자는 그대로 보실 수 있어요.',
  // ★실패가 아니다 — 답은 정상이고, 어느 AI 가 답했는지만 알려 준다.
  'own-ai-fallback': '내 AI 로 답하지 못해 쌤핀 AI 가 대신 답했어요.',
};

export function AssistThread({
  turns,
  onRunProposal,
  onRunOne,
}: {
  readonly turns: readonly AssistTurn[];
  readonly onRunProposal?: (turnId: string, proposal: AssistWriteProposal) => void;
  /**
   * 묶음 중 **한 건만** 저장한다(말로 쓴 글을 학생별로 나눈 카드용).
   *
   * 턴 전체의 상태를 건드리지 않는 것이 핵심이다 — `onRunProposal` 은 턴을 통째로
   * 'done' 으로 만들어서, 한 장을 저장하면 나머지 카드의 [실행]이 같이 사라진다.
   */
  readonly onRunOne?: (proposal: AssistWriteProposal) => Promise<{ ok: boolean; message: string }>;
}) {
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

          {/* 말로 쓴 글을 학생별로 나눈 경우에만 카드를 여러 장으로 편다.
              다른 묶음(할 일·일정)은 지금까지처럼 한 장으로 둔다 — 그쪽 동작을 바꾸지 않는다. */}
          {turn.proposal &&
          onRunOne &&
          turn.proposal.tool === 'add_observation' &&
          turn.proposal.batch &&
          turn.proposal.batch.length > 1 ? (
            <ObservationSplitCards
              items={turn.proposal.batch}
              expired={turn.proposalState === 'expired'}
              onRunOne={onRunOne}
            />
          ) : (
            turn.proposal && (
              <ProposalCard
                turnId={turn.id}
                proposal={turn.proposal}
                state={turn.proposalState}
                message={turn.proposalMessage}
                onRun={onRunProposal}
              />
            )
          )}

          {turn.degraded && (
            <p className="text-xs text-sp-muted">{DEGRADED_MESSAGE[turn.degraded]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
