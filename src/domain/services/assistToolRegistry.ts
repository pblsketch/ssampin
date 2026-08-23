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
 * 급식·디데이·일정(슬라이스 1) → 시간표·진도·메모·노트·즐겨찾기·주간요약(슬라이스 2)
 * → 출결 기간·수업반 출결·성적 분포·자리 배치·채점표(Phase 2 집계)를 더했다.
 *
 * 여기 없는 것은 "빠뜨린" 것이 아니라 **일부러 만들지 않은** 것이다 — 개별 학생 데이터를
 * 다루는 도구(명단·학생별 출결/기록)와 생기부 3종은 어느 Phase 에서도 등록하지 않는다.
 */
const READ_TOOLS: readonly AssistToolDef[] = [
  {
    id: 'get_attendance_summary',
    grade: 1,
    outbound: 'result',
    // ★설명이 세 갈래를 갈라 준다. "학급의 하루 출결"로만 적었을 때 실서버에서
    //   "3학년 2반 수업 출결 이번 달"이 이 도구로 들어왔다(2026-08-23 실측).
    //   담임/수업반과 하루/기간을 **설명 안에서 서로 가리키게** 해서 갈라낸다.
    description:
      '**담임 학급(우리 반) 한 반**의 **하루** 출결을 인원 수로만 요약한다. 학생 이름·학번·사유는 반환하지 않는다. 여러 날을 묶어 보려면 get_homeroom_attendance_stats, 내가 가르치는 교과 수업반은 get_class_attendance_stats 를 쓴다.',
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
    // byMonth 는 기간이 두 달 이상일 때만 붙는다. 없으면 재구성에서 그냥 빠진다.
    resultFields: ['className', 'period', 'total', 'byCategory', 'byMonth'],
    nestedFields: { byCategory: ['category', 'count'], byMonth: ['month', 'count'] },
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
  // ── 브릿지 동등화 Phase 2 (계획서 §2 B그룹 — 집계로 커버하는 읽기) ──
  //
  // ★여기서부터는 **원래 개별 학생 데이터인 것**을 다룬다. 그래서 규칙이 하나 더 붙는다:
  //   요약 함수가 학생 식별자를 **인자 타입에서부터 받지 않거나**, 받더라도 결과에 담지
  //   않는다. 화이트리스트로 지우는 것이 아니라 애초에 만들지 않는다.
  {
    // ★이름이 `get_attendance_stats` 였을 때 실서버에서 **수업반 질문을 빨아들였다**
    //   (2026-08-23 실측). 이름이 총칭이라 "출결 통계 = 이것"으로 읽힌 것이다.
    //   브릿지의 `get_homeroom_attendance` / `get_attendance_records` 처럼
    //   **이름 자체가 범위를 말하게** 해서 짝을 맞춘다. 설명 문구보다 이름이 세다.
    id: 'get_homeroom_attendance_stats',
    grade: 1,
    outbound: 'result',
    description:
      '**담임 학급(우리 반) 한 반**의 출결을 **여러 날에 걸쳐** 집계한다. 내가 수업으로 들어가는 반들은 여기 포함되지 않는다. 결석·지각·조퇴·결과의 기간 합계와 이상이 있었던 날짜별 인원 수. 출석 인원은 세지 않는다(수업일 수를 앱이 모른다). 하루만 볼 때는 get_attendance_summary, 내가 가르치는 교과 수업반은 get_class_attendance_stats 를 쓴다.',
    resultFields: [
      'className',
      'period',
      'rosterSize',
      'absent',
      'late',
      'early',
      'classAbsence',
      'daysWithIssue',
      'truncated',
      'days',
    ],
    nestedFields: { days: ['date', 'absent', 'late', 'early', 'classAbsence'] },
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
    id: 'get_class_attendance_stats',
    grade: 1,
    outbound: 'result',
    // 수업반 명부에는 학생 번호·학년·반이 들어 있다. 요약 함수가 상태 말고는 받지 않는다.
    description:
      '**내가 가르치는 교과 수업반**(담임 학급이 아닌 반. 예: "3학년 2반 수업")의 출결을 날짜별로 집계한다. 수업 교시별로 적은 출결을 날짜로 묶어 인원을 센다. **여러 반을 한 번에** 볼 수 있다 — 반 이름을 주면 그 반만, 안 주면 담당 수업반 전체. 담임 학급(우리 반)은 get_attendance_summary·get_homeroom_attendance_stats 를 쓴다. 학생 번호·이름은 반환하지 않는다.',
    resultFields: [
      'period',
      'className',
      'present',
      'absent',
      'late',
      'early',
      'classAbsence',
      'lessons',
      'truncated',
      'days',
    ],
    nestedFields: {
      days: ['date', 'className', 'lessons', 'present', 'absent', 'late', 'early', 'classAbsence'],
    },
    freeTextFields: [],
    params: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 시작일(생략 시 이번 달 1일)' },
        to: { type: 'string', description: 'YYYY-MM-DD 종료일(생략 시 오늘)' },
        className: { type: 'string', description: '수업반 이름(생략 시 전체)' },
      },
    },
  },
  {
    id: 'get_grade_stats',
    grade: 1,
    outbound: 'result',
    // 평가 제목·과목명은 선생님이 직접 적는다 — 자유 입력으로 본다.
    description:
      '평가(지필·수행)별 성적 분포를 돌려준다. 인원·평균·최고·최저와 성취도 A~E 구간별 인원 수(고정분할 90/80/70/60). 학생별 점수는 반환하지 않는다.',
    resultFields: ['total', 'truncated', 'items'],
    nestedFields: {
      items: [
        'className',
        'subject',
        'title',
        'kind',
        'fullScore',
        'count',
        'absent',
        'average',
        'highest',
        'lowest',
        'distribution',
      ],
    },
    freeTextFields: ['title', 'subject'],
    params: {
      type: 'object',
      properties: {
        className: { type: 'string', description: '수업반 이름(생략 시 전체)' },
        semester: { type: 'string', description: "'1' 또는 '2'(생략 시 전체)" },
      },
    },
  },
  {
    id: 'get_seating_stats',
    grade: 1,
    outbound: 'result',
    // ★좌석표 자체는 영구히 안 나간다 — "몇 번 자리에 누가"는 통째로 개별 학생 데이터다.
    description:
      '담임 학급 자리 배치를 숫자로만 요약한다. 배치 방식·줄칸·자리 수·앉은 인원·빈자리·모둠 수. 좌석표(누가 어디 앉는지)는 반환하지 않는다 — 그건 앱의 자리 배치 화면에서 본다.',
    resultFields: [
      'className',
      'layout',
      'rows',
      'cols',
      'seatCount',
      'assigned',
      'empty',
      'groupCount',
      'pairMode',
    ],
    freeTextFields: [],
  },
  {
    id: 'get_assessment_stats',
    grade: 1,
    outbound: 'result',
    // 채점표 제목·요소 이름·수준 이름은 전부 선생님이 지은 것이다 — 자유 입력.
    description:
      '루브릭(채점표) 진행 상황과 요소별 수준 분포를 돌려준다. 채점표별 인원·완료·결시·평균과, 평가 요소마다 어느 수준에 몇 명인지. 학생별 점수·총평은 반환하지 않는다.',
    resultFields: ['total', 'truncated', 'sheets', 'criteria'],
    nestedFields: {
      sheets: [
        'className',
        'title',
        'students',
        'graded',
        'partial',
        'absent',
        'maxScore',
        'average',
      ],
      criteria: ['rubric', 'criterion', 'marked', 'distribution'],
    },
    freeTextFields: ['title', 'rubric', 'criterion', 'distribution'],
    params: {
      type: 'object',
      properties: {
        className: { type: 'string', description: '수업반 이름(생략 시 전체)' },
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

/**
 * 쓰기 도구 한 종. **표에서 찍어낸다.**
 *
 * ★`resultFields: []` 가 여기 한 번만 적혀 있다는 것이 핵심이다. 22개마다 손으로 적으면
 * 언젠가 하나에 결과 필드가 들어가고, 그 도구만 조용히 모델에게 무언가를 돌려주게 된다.
 * 찍어내면 **그런 도구를 만들 수 없다.**
 *
 * `outbound: 'args'` 는 "나가는 것은 결과가 아니라 인자"라는 뜻이다(AssistTool.ts).
 * 다만 이 앱에서는 그 인자마저 모델이 스스로 지어낸 것이라 새로 나가는 정보가 없다 —
 * 제안은 화면에만 뜨고, 저장은 선생님이 [실행]을 눌러야 일어난다.
 */
function writeTool(
  id: string,
  description: string,
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[],
): AssistToolDef {
  return {
    id,
    grade: 1,
    outbound: 'args',
    description,
    resultFields: [],
    freeTextFields: [],
    params: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

const S = (description: string): Readonly<Record<string, unknown>> => ({
  type: 'string',
  description,
});
const N = (description: string): Readonly<Record<string, unknown>> => ({
  type: 'integer',
  description,
});
const B = (description: string): Readonly<Record<string, unknown>> => ({
  type: 'boolean',
  description,
});

/** 고칠·지울 대상을 가리키는 말. **모델은 내부 식별자를 모른다**(보여준 적이 없다). */
const MATCH = S('대상을 가리키는 말(제목·내용의 일부). 앱이 딱 한 건을 찾으면 그것을 고른다');

/**
 * ── 쓰기 도구 22종 (계획서 §2 C그룹) ──
 *
 * ★**모델은 이 도구들을 실행하지 못한다.** 고르면 앱이 미리보기 카드를 띄우고,
 * 선생님이 [실행]을 눌러야 저장된다.
 *
 * ★설명은 **하려는 일부터** 적는다("할 일을 지운다"). 처음에는 구현을 그대로 옮겨
 * "…하자고 제안한다"로 썼는데, 실서버에서 **삭제 요청 4건이 전부 조회 도구로 갔다**
 * (0/4, 2026-08-23 실측). 모델은 하려는 일과 설명을 맞춰 보는데, 우리가 적어 둔 것은
 * 하려는 일이 아니라 우리 쪽 사정이었다. 안전 장치("확인 버튼을 누른 뒤에")는 그다음에
 * 한 마디로 붙인다 — 모델이 "저장했습니다"라고 앞질러 말하지 않게.
 *
 * 제외(계획서 §2·§6): 출결 입력 · 관찰 추가 · 루브릭 채점 · 생기부 초안 저장.
 * 학생 데이터에 닿는 쓰기는 **만들지 않는다** — 등록 누락이 아니라 존재하지 않는다.
 */
const WRITE_TOOLS: readonly AssistToolDef[] = [
  // ── 할 일 (4) ──
  writeTool(
    'create_todo',
    '할 일을 새로 만든다. 선생님이 확인 버튼을 누른 뒤에 저장된다.',
    {
      text: S('할 일 내용'),
      dueDate: S('YYYY-MM-DD 마감일'),
      time: S('HH:mm 시각'),
      priority: S('중요도: high | medium | low | none'),
    },
    ['text'],
  ),
  writeTool(
    'update_todo',
    '이미 있는 할 일의 내용·마감·중요도를 고친다. 확인 버튼을 누른 뒤에 바뀐다.',
    {
      match: MATCH,
      text: S('바꿀 내용'),
      dueDate: S('YYYY-MM-DD 마감일'),
      time: S('HH:mm 시각'),
      priority: S('중요도: high | medium | low | none'),
    },
    ['match'],
  ),
  writeTool(
    'complete_todo',
    '할 일을 끝낸 것으로 표시한다(체크). undo=true 면 다시 안 끝낸 것으로 되돌린다. 확인 버튼을 누른 뒤에 바뀐다.',
    { match: MATCH, undo: B('true 면 완료를 취소한다') },
    ['match'],
  ),
  writeTool(
    'delete_todo',
    '할 일을 **지운다(삭제한다)**. 어떤 할 일인지 match 로 가리킨다. 목록만 보고 싶으면 get_my_todos 를 쓴다. 확인 버튼을 누른 뒤에 지워진다.',
    { match: MATCH },
    ['match'],
  ),

  // ── 일정 (3) ──
  writeTool(
    'create_event',
    '일정을 새로 만든다(등록한다). 확인 버튼을 누른 뒤에 저장된다.',
    {
      title: S('일정 제목'),
      date: S('YYYY-MM-DD 날짜'),
      endDate: S('YYYY-MM-DD 종료일(여러 날 걸칠 때만)'),
      time: S('HH:mm 시각'),
      location: S('장소'),
    },
    ['title', 'date'],
  ),
  writeTool(
    'update_event',
    '이미 있는 일정의 제목·날짜·시각·장소를 고친다(변경한다). 확인 버튼을 누른 뒤에 바뀐다.',
    {
      match: MATCH,
      title: S('바꿀 제목'),
      date: S('YYYY-MM-DD 날짜'),
      time: S('HH:mm 시각'),
      location: S('장소'),
    },
    ['match'],
  ),
  writeTool(
    'delete_event',
    '일정을 **지운다(삭제한다·취소한다)**. 목록만 보고 싶으면 get_events 를 쓴다. 확인 버튼을 누른 뒤에 지워진다.',
    { match: MATCH },
    ['match'],
  ),

  // ── 메모 (3) ──
  writeTool(
    'create_memo',
    '메모지를 새로 붙인다(적는다·남긴다). 확인 버튼을 누른 뒤에 저장된다.',
    { content: S('메모 내용'), color: S('색: yellow | pink | green | blue') },
    ['content'],
  ),
  writeTool(
    'update_memo',
    '이미 있는 메모의 내용을 바꾼다(고친다). 확인 버튼을 누른 뒤에 바뀐다.',
    { match: MATCH, content: S('바꿀 내용') },
    ['match', 'content'],
  ),
  writeTool(
    'delete_memo',
    '메모를 **지운다(삭제한다)**. 내용만 보고 싶으면 get_memos 를 쓴다. 확인 버튼을 누른 뒤에 지워진다.',
    { match: MATCH },
    ['match'],
  ),

  // ── 진도 (3) ──
  writeTool(
    'create_progress',
    '수업 진도를 적는다(기록한다·넣는다). 같은 반·날짜·교시에 이미 있으면 만들지 않는다. 확인 버튼을 누른 뒤에 저장된다.',
    {
      className: S('수업반 이름'),
      date: S('YYYY-MM-DD 날짜(생략 시 오늘)'),
      period: N('교시(1~12)'),
      unit: S('단원'),
      lesson: S('차시'),
      note: S('메모'),
      status: S('상태: planned | completed | skipped (생략 시 completed)'),
    },
    ['className', 'period', 'unit'],
  ),
  writeTool(
    'update_progress',
    '이미 적어 둔 진도를 고친다(수정한다). 반·날짜·교시로 대상을 가리킨다. 확인 버튼을 누른 뒤에 바뀐다.',
    {
      className: S('수업반 이름'),
      date: S('YYYY-MM-DD 날짜'),
      period: N('교시(1~12)'),
      unit: S('바꿀 단원'),
      lesson: S('바꿀 차시'),
      note: S('바꿀 메모'),
      status: S('상태: planned | completed | skipped'),
    },
    ['className', 'date', 'period'],
  ),
  writeTool(
    'delete_progress',
    '적어 둔 진도를 **지운다(삭제한다)**. 반·날짜·교시로 대상을 가리킨다. 확인 버튼을 누른 뒤에 지워진다.',
    { className: S('수업반 이름'), date: S('YYYY-MM-DD 날짜'), period: N('교시(1~12)') },
    ['className', 'date', 'period'],
  ),

  // ── 즐겨찾기 (4) ──
  writeTool(
    'create_bookmark',
    '즐겨찾기를 추가한다(등록한다·저장한다). 확인 버튼을 누른 뒤에 저장된다.',
    { name: S('이름'), url: S('주소'), group: S('묶음 이름(생략 시 첫 묶음)') },
    ['name', 'url'],
  ),
  writeTool(
    'update_bookmark',
    '즐겨찾기의 이름이나 주소를 고친다(바꾼다). 확인 버튼을 누른 뒤에 바뀐다.',
    { match: MATCH, name: S('바꿀 이름'), url: S('바꿀 주소') },
    ['match'],
  ),
  writeTool(
    'delete_bookmark',
    '즐겨찾기를 **지운다(삭제한다)**. 목록만 보고 싶으면 get_bookmarks 를 쓴다. 확인 버튼을 누른 뒤에 지워진다.',
    { match: MATCH },
    ['match'],
  ),
  writeTool(
    'create_bookmark_group',
    '즐겨찾기 묶음(폴더)을 만든다. 확인 버튼을 누른 뒤에 저장된다.',
    { name: S('묶음 이름'), emoji: S('아이콘 이모지') },
    ['name'],
  ),

  // ── 노트 (5) ──
  writeTool(
    'create_notebook',
    '노트책을 만든다(새로 판다). 확인 버튼을 누른 뒤에 저장된다.',
    { title: S('노트책 이름') },
    ['title'],
  ),
  writeTool(
    'create_note_section',
    '노트책 안에 구역(섹션)을 만든다. 확인 버튼을 누른 뒤에 저장된다.',
    { notebook: S('노트책 이름'), title: S('구역 이름') },
    ['notebook', 'title'],
  ),
  writeTool(
    'create_note_page',
    '노트 구역 안에 페이지를 만든다. 본문은 만들지 않고 제목만 정한다. 확인 버튼을 누른 뒤에 저장된다.',
    {
      section: S('구역 이름'),
      title: S('페이지 제목'),
      notebook: S('노트책 이름(구역 이름이 여러 노트책에 겹칠 때)'),
    },
    ['section', 'title'],
  ),
  writeTool(
    'rename_note_page',
    '노트 페이지의 제목을 바꾼다(이름을 고친다). 확인 버튼을 누른 뒤에 바뀐다.',
    { match: MATCH, title: S('바꿀 제목') },
    ['match', 'title'],
  ),
  writeTool(
    'delete_note_page',
    '노트 페이지를 **지운다(삭제한다)**. 페이지 안의 글도 함께 사라진다. 목록만 보고 싶으면 get_note_list 를 쓴다. 확인 버튼을 누른 뒤에 지워진다.',
    { match: MATCH },
    ['match'],
  ),
];

/** 읽기 19종 + 쓰기 22종. 여기 있는 것만 모델에게 보인다. */
export const ASSIST_TOOLS: readonly AssistToolDef[] = [...READ_TOOLS, ...WRITE_TOOLS];

/** 결과를 돌려주는(읽기) 도구만. 재구성·관문 계약 테스트가 도는 대상이다 */
export const ASSIST_READ_TOOLS: readonly AssistToolDef[] = READ_TOOLS;

/** 모델이 실행할 수 없는(쓰기) 도구만 */
export const ASSIST_WRITE_TOOLS: readonly AssistToolDef[] = WRITE_TOOLS;

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
