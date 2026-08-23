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
 * 등록 도구 — **선생님 컴퓨터 안의 로컬 집계로 완결되는 것만**.
 *
 * 처음 5종(출결·인원·학급·기록·할일)으로 시작해, 브릿지 동등화 계획서
 * (`docs/01-plan/features/assist-bridge-parity.plan.md` §2 A그룹)에 따라
 * 급식·디데이·일정(슬라이스 1) → 시간표·진도·메모·노트·즐겨찾기·주간요약(슬라이스 2)을 더했다.
 *
 * 여기 없는 것은 "빠뜨린" 것이 아니라 **일부러 만들지 않은** 것이다 — 개별 학생 데이터를
 * 다루는 도구(명단·학생별 출결/기록)와 생기부 3종은 어느 Phase 에서도 등록하지 않는다.
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
    params: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD 조회일(생략 시 오늘)' },
      },
    },
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
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 이번 달 1일)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 오늘)' },
      },
    },
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
    params: {
      type: 'object',
      properties: {
        includeCompleted: {
          type: 'boolean',
          description: '끝낸 할 일도 포함할지(생략 시 false — 미완료만)',
        },
      },
    },
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
  // ── 브릿지 동등화 Phase 1 슬라이스 2 (계획서 §2 A그룹 잔여) ──
  {
    id: 'get_timetable',
    grade: 1,
    outbound: 'result',
    // 학생 정보가 없다. 과목·교실은 선생님이 손으로 고칠 수 있어 자유 입력으로 본다.
    description:
      '기간의 교사 본인 시간표를 돌려준다. 날짜·요일·교시(periodNo)·과목·교실. 교체·보강 같은 변동이 반영돼 있고, 빈 교시는 담기지 않는다.',
    resultFields: ['period', 'truncated', 'items'],
    nestedFields: { items: ['date', 'day', 'periodNo', 'subject', 'classroom'] },
    freeTextFields: ['subject', 'classroom'],
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 오늘)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 시작일+6일)' },
      },
    },
  },
  {
    id: 'get_progress',
    grade: 1,
    outbound: 'result',
    // 학생이 아니라 수업의 기록이다. 단원·차시·메모는 자유 입력이라 관문을 거친다.
    description:
      '기간의 수업 진도 기록을 돌려준다. 날짜·학급·교시(periodNo)·단원·차시·상태(planned/completed/skipped)·메모.',
    resultFields: ['period', 'total', 'truncated', 'items'],
    nestedFields: {
      items: ['date', 'className', 'periodNo', 'unit', 'lesson', 'status', 'note'],
    },
    freeTextFields: ['unit', 'lesson', 'note'],
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 이번 달 1일)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 오늘)' },
        className: { type: 'string', description: '학급 이름(생략 시 전체)' },
      },
    },
  },
  {
    id: 'get_memos',
    grade: 1,
    outbound: 'result',
    // ★내용까지 보낸다 — 오너 결정 ①(2026-08-23). 대신 content 를 자유 입력으로 선언해
    //   이름·연락처 관문(그물 ③)을 그대로 통과시킨다. 이 관문은 선택지가 아니다.
    description: '메모지의 내용을 돌려준다. 최근에 고친 것부터.',
    resultFields: ['total', 'truncated', 'items'],
    nestedFields: { items: ['content', 'updated'] },
    freeTextFields: ['content'],
    params: {
      type: 'object',
      properties: {
        includeArchived: {
          type: 'boolean',
          description: '보관함 메모도 포함할지(생략 시 false)',
        },
      },
    },
  },
  {
    id: 'get_note_list',
    grade: 1,
    outbound: 'result',
    // 본문은 반환하지 않는다(계획서 §2 확정) — 노트에는 학생 개별 사정이 문단째 들어간다.
    description:
      '노트 페이지 **목록**을 돌려준다. 노트책·구역·제목·고정 여부·수정일. 본문은 반환하지 않는다.',
    resultFields: ['total', 'truncated', 'items'],
    nestedFields: { items: ['notebook', 'section', 'title', 'pinned', 'updated'] },
    freeTextFields: ['notebook', 'section', 'title'],
    params: {
      type: 'object',
      properties: {
        includeArchived: {
          type: 'boolean',
          description: '보관한 노트책의 페이지도 포함할지(생략 시 false)',
        },
      },
    },
  },
  {
    id: 'get_bookmarks',
    grade: 1,
    outbound: 'result',
    // ★주소는 도메인만 — 오너 결정 ②(2026-08-23). 경로·질의에 학번이 박힌 링크가 흔하다.
    description: '즐겨찾기 목록을 돌려준다. 이름·묶음과 주소의 **도메인만** 반환한다.',
    resultFields: ['total', 'truncated', 'items'],
    nestedFields: { items: ['name', 'domain', 'group'] },
    freeTextFields: ['name', 'group'],
    params: {
      type: 'object',
      properties: {
        includeArchived: {
          type: 'boolean',
          description: '보관한 묶음도 포함할지(생략 시 false)',
        },
      },
    },
  },
  {
    id: 'get_week_overview',
    grade: 1,
    outbound: 'result',
    // 다른 요약들의 조합이다. 새로 세지 않으므로 등급도 구성 요소를 따른다.
    description:
      '한 주를 한눈에 — 날짜별 수업 교시 수·급식·일정·디데이와 미완료 할 일 수를 함께 돌려준다.',
    resultFields: ['period', 'todoUndone', 'truncated', 'days'],
    nestedFields: { days: ['date', 'day', 'lessons', 'meal', 'events', 'ddays'] },
    freeTextFields: ['meal', 'events', 'ddays'],
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
