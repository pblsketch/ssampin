/**
 * 쌤핀 AI — 도구 레지스트리 (egress 4중 그물 ④의 검사 대상)
 *
 * 순수 데이터. 외부 의존성 import 금지(entities 의 타입만 가져온다).
 *
 * ★여기 등록된 것만 모델에게 보인다.
 * 2등급(개인이 드러나는 것)·3등급(민감정보) 도구는 **만들지 않는다** — 등록 누락이 아니라
 * 애초에 존재하지 않게 해서, 실수로 켜질 여지를 없앤다(ADR-061 결정 7).
 *
 * ★`nestedFields` 를 반드시 채운다. 최상위 키만 적으면 `{ items: store.todos }` 를 넘길 때
 * `subTasks`·`googleTaskId` 가 통째로 나간다 — depth 1 에서 그물 ②가 뚫린다.
 *
 * 설계 근거: docs/01-plan/features/in-app-chatbot-zen.plan.md §4.2 / §4.2.1 / §4.2.2
 */
import type { AssistToolDef, AssistToolId } from '../entities/AssistTool';

/**
 * Phase 1 등록 도구 — **로컬 집계로 완결되는 5종**.
 *
 * 계획서 §4.2 의 1등급 목록은 12종이지만, 나머지 7종은 외부 호출(`get_app_help`)이나
 * 자매 계획 소관(`polish_sentence`), 또는 아직 데이터 원본이 없는 것들이라
 * Phase 1(외부 통신 0) 범위 밖이다. 등급 판정은 이미 §4.2 에서 끝나 있고,
 * 여기서는 **지금 안전하게 만들 수 있는 것만** 등록한다.
 */
export const ASSIST_TOOLS: readonly AssistToolDef[] = [
  {
    id: 'get_attendance_summary',
    grade: 1,
    outbound: 'result',
    description: '학급의 하루 출결을 인원 수로만 요약한다. 학생 이름·학번·사유는 반환하지 않는다.',
    // ⚠️ 원래 스키마에 있던 `sick` 은 뺐다. 이 앱에서 질병은 status 가 아니라 reason 이라
    // 집계할 수 없었고, 0 을 고정으로 내보내면 모델이 "질병 결석 0명"이라고 사실과 다르게 답한다.
    // 대신 실제로 세고 있던 `classAbsence`(결과)를 내보낸다.
    resultFields: ['date', 'className', 'present', 'absent', 'late', 'early', 'classAbsence'],
    freeTextFields: [],
  },
  {
    id: 'count_students',
    grade: 1,
    outbound: 'result',
    description: '학급 인원 수를 센다. 명단은 반환하지 않는다.',
    resultFields: ['className', 'count'],
    freeTextFields: [],
    params: {
      type: 'object',
      properties: {
        className: { type: 'string', description: '수업반 이름(생략 시 담임 학급)' },
      },
    },
  },
  {
    id: 'list_classes',
    grade: 1,
    outbound: 'result',
    description: '교사가 담당하는 학급 목록을 돌려준다. 학급 이름은 개인정보가 아니다.',
    resultFields: ['classes'],
    nestedFields: { classes: ['id', 'name', 'grade', 'classNum'] },
    freeTextFields: [],
    // id 는 UUID 다. 패턴 검사를 켜 두면 0.24% 확률로 전화번호로 오인돼 이 도구가 영구히 막힌다.
    opaqueFields: ['id'],
  },
  {
    id: 'get_records_stats',
    grade: 1,
    outbound: 'result',
    description: '관찰 기록을 카테고리별 건수로만 집계한다. 본문과 학생 식별자는 반환하지 않는다.',
    resultFields: ['className', 'period', 'total', 'byCategory'],
    nestedFields: { byCategory: ['category', 'count'] },
    freeTextFields: [],
  },
  {
    id: 'get_my_todos',
    grade: 1,
    outbound: 'result',
    // ⚠️ 교사 본인 데이터라 1등급이지만, 제목은 선생님이 자유롭게 적는다.
    // "김지훈 상담 전화" 처럼 학생 실명이 들어갈 수 있어 전송 직전 관문이 필수다.
    description: '교사 본인의 할 일 목록을 돌려준다. 제목은 자유 입력이라 별도 검사가 필요하다.',
    // undone(미완료 건수)·overdue(기한 지남)는 앱이 계산한 집계/불리언이라 1등급 그대로다.
    resultFields: ['items', 'undone'],
    nestedFields: { items: ['title', 'due', 'done', 'overdue'] },
    freeTextFields: ['title'],
  },
  // ── 브릿지 동등화 Phase 1 (계획서 assist-bridge-parity §2 A그룹) ──
  {
    id: 'get_meals',
    grade: 1,
    outbound: 'result',
    // 나이스 공시 데이터라 학생 정보가 없다. 다만 수동 입력(CSV) 경로가 있어
    // 메뉴 문자열은 자유 입력으로 취급한다 — 무엇이 적혀 있을지 보장할 수 없다.
    description: '기간의 급식 식단을 돌려준다. 날짜·식사종류·메뉴·열량.',
    resultFields: ['period', 'items'],
    nestedFields: { items: ['date', 'mealType', 'dishes', 'calorie'] },
    freeTextFields: ['dishes'],
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 오늘)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 시작일+6일)' },
      },
    },
  },
  {
    id: 'get_ddays',
    grade: 1,
    outbound: 'result',
    // daysLeft 는 앱이 계산한 사실이다 — 모델의 날짜 추측 금지(할 일 overdue 와 같은 원칙).
    description:
      '디데이 목록을 돌려준다. 제목·날짜·남은 일수(daysLeft: 양수=앞으로, 음수=지남)·고정 여부.',
    resultFields: ['items'],
    nestedFields: { items: ['title', 'date', 'daysLeft', 'pinned'] },
    freeTextFields: ['title'],
  },
  {
    id: 'get_events',
    grade: 1,
    outbound: 'result',
    // 설명(description)은 보내지 않는다 — 상담 메모 등 긴 자유 글이 들어가는 자리다.
    description: '기간의 일정을 돌려준다. 날짜·제목·시간·장소. 반복 일정은 날짜별로 펼쳐져 있다.',
    resultFields: ['period', 'truncated', 'items'],
    nestedFields: { items: ['date', 'title', 'time', 'location'] },
    freeTextFields: ['title', 'location'],
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 오늘)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 시작일+6일)' },
      },
    },
  },
];

const TOOL_BY_ID: ReadonlyMap<AssistToolId, AssistToolDef> = new Map(
  ASSIST_TOOLS.map((tool) => [tool.id, tool]),
);

/** 등록된 도구를 찾는다. 없으면 undefined — 모델이 지어낸 도구 이름을 걸러내는 자리다. */
export function findAssistTool(id: AssistToolId): AssistToolDef | undefined {
  return TOOL_BY_ID.get(id);
}

/** 등록된 모든 도구 id */
export function assistToolIds(): readonly AssistToolId[] {
  return ASSIST_TOOLS.map((tool) => tool.id);
}

/**
 * 레지스트리를 모델 도구 선택용 스키마(OpenAI function 형식)로 바꾼다.
 *
 * ★설명은 레지스트리의 것을 그대로 쓴다 — 두 벌로 관리하면 어긋난다.
 * 서버(`assistRequest.ts`)는 이 형식(type/function/name/description/parameters)만 통과시킨다.
 */
export function toModelToolSchemas(): readonly {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}[] {
  return ASSIST_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.id,
      description: tool.description,
      parameters: tool.params ?? { type: 'object', properties: {} },
    },
  }));
}
