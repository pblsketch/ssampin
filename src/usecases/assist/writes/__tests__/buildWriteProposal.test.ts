/**
 * 쌤핀 AI 쓰기 — 도구 22종의 제안 조립기 (브릿지 동등화 Phase 3)
 *
 * ★여기서 확인하는 것은 두 가지다.
 *   ① **미리보기가 값을 감추지 않는가** — 감추면 [실행] 버튼은 확인이 아니라 요식이 된다.
 *   ② **애매하면 되묻는가** — 쓰기에는 "전체를 보여주는 폴백"이 없다. 아무거나 고르면
 *      선생님은 무엇을 잃었는지도 모른 채 잃는다.
 */
import { describe, expect, it } from 'vitest';

import { isWriteProposal } from '@domain/entities/AssistWrite';
import type { AssistWriteOutcome, AssistWriteProposal } from '@domain/entities/AssistWrite';
import { buildWriteProposal, writeToolNames } from '../buildWriteProposal';
import type { WriteSources } from '../writeSources';

const SRC: WriteSources = {
  today: '2026-08-23',
  periodTimes: [],
  // 출결 제안이 "누구인지"를 정할 때 보는 명단. **모델에게는 나가지 않는다.**
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [
      { id: 'stu-1', name: '김지훈', studentNumber: 1 },
      { id: 'stu-15', name: '박서연', studentNumber: 15 },
      { id: 'stu-99', name: '번호없는학생' },
    ],
    teaching: [
      {
        classId: 'c1',
        className: '3학년 2반',
        students: [
          { number: 7, name: '최민호', key: '7' },
          { number: 8, name: '이수현', key: '8' },
        ],
      },
    ],
  },
  todos: [
    { id: 't1', text: '장보기', completed: false, dueDate: '2026-08-25' },
    { id: 't2', text: '수행평가 채점', completed: true },
    { id: 't3', text: '학년 회의 자료', completed: false },
  ],
  events: [
    { id: 'e1', title: '학부모 총회', date: '2026-08-25', time: '14:00', location: '시청각실' },
    { id: 'e2', title: '체육대회', date: '2026-09-10' },
  ],
  memos: [
    { id: 'm1', content: '회의 자료 준비하기' },
    { id: 'm2', content: '2학기 수행평가 일정' },
  ],
  progress: [
    {
      id: 'pr1',
      classId: 'c1',
      date: '2026-08-24',
      period: 3,
      unit: '2단원 함수',
      lesson: '1차시',
      status: 'completed',
      note: '',
    },
  ],
  classes: [
    { id: 'c1', name: '3학년 2반' },
    { id: 'c2', name: '2학년 5반' },
  ],
  bookmarks: [
    { id: 'b1', name: '나이스', url: 'https://neis.go.kr', groupId: 'g1' },
    { id: 'b2', name: '에듀파인', url: 'https://klef.go.kr', groupId: 'g1' },
  ],
  bookmarkGroups: [{ id: 'g1', name: '업무' }],
  notebooks: [
    { id: 'nb1', title: '3학년 수학' },
    { id: 'nb2', title: '학급 운영' },
  ],
  noteSections: [
    { id: 's1', notebookId: 'nb1', title: '수업 준비' },
    { id: 's2', notebookId: 'nb2', title: '수업 준비' },
  ],
  notePages: [{ id: 'p1', sectionId: 's1', title: '2단원 지도안' }],
  attendance: [],
  rubrics: [
    {
      id: 'rb1',
      classId: 'c1',
      title: '토론 평가',
      criteria: [
        {
          id: 'cr1',
          name: '주장의 명확성',
          levels: [
            { id: 'lv1', name: '잘함' },
            { id: 'lv2', name: '보통' },
          ],
        },
      ],
    },
  ],
};

function propose(tool: string, args: object): AssistWriteOutcome {
  return buildWriteProposal(tool, JSON.stringify(args), SRC);
}

/** 제안이 나와야 하는 자리. 아니면 테스트를 여기서 세운다 */
function ok(outcome: AssistWriteOutcome): AssistWriteProposal {
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  return outcome;
}

/** 거절이 나와야 하는 자리 */
function rejected(outcome: AssistWriteOutcome): string {
  if (isWriteProposal(outcome)) throw new Error(`거절이어야 하는데 제안이 나왔다: ${outcome.tool}`);
  return outcome.reason;
}

function valueOf(proposal: AssistWriteProposal, label: string): string | undefined {
  return proposal.fields.find((f) => f.label === label)?.value;
}

describe('★도구 표 — 25종이 빠짐없이 있다', () => {
  it('할일4 · 일정3 · 메모3 · 진도3 · 즐겨찾기4 · 노트5 · 출결1 · 관찰1 · 채점1', () => {
    expect(writeToolNames()).toHaveLength(25);
    // 학생에 닿는 쓰기는 이름으로 못 박는다 — 슬그머니 늘어나면 여기가 먼저 터진다.
    expect(
      writeToolNames()
        .filter((n) => /attendance|observation|rubric|record/.test(n))
        .sort(),
    ).toEqual(['add_observation', 'set_attendance', 'set_rubric_mark']);
  });

  it('표에 없는 이름은 제안이 만들어지지 않는다 — 모델이 지어낸 도구', () => {
    expect(rejected(propose('delete_everything', {}))).toContain('알아듣지 못했어요');
  });

  it('★깨진 인자로는 저장하지 않는다 — 읽기와 달리 기본값으로 밀어붙이지 않는다', () => {
    const outcome = buildWriteProposal('create_todo', '{{{not json', SRC);
    expect(rejected(outcome)).toContain('알아듣지 못해서');
  });
});

describe('할 일 (4)', () => {
  it('create_todo — 파싱된 값이 모두 미리보기에 뜬다', () => {
    const p = ok(
      propose('create_todo', {
        text: '결재 올리기',
        dueDate: '2026-08-26',
        time: '09:00',
        priority: 'high',
      }),
    );

    expect(p.action).toBe('create');
    expect(valueOf(p, '내용')).toBe('결재 올리기');
    expect(valueOf(p, '마감')).toBe('2026-08-26');
    expect(valueOf(p, '시각')).toBe('09:00');
    expect(valueOf(p, '중요도')).toBe('높음');
  });

  it('create_todo — 내용이 없으면 만들지 않는다', () => {
    expect(rejected(propose('create_todo', { dueDate: '2026-08-26' }))).toContain('할 일 내용');
  });

  it('create_todo — 이상한 날짜·중요도는 버린다(저장되지 않는다)', () => {
    const p = ok(propose('create_todo', { text: 'x', dueDate: '내일', priority: '아주높음' }));
    expect(p.values.dueDate).toBeUndefined();
    expect(p.values.priority).toBeUndefined();
  });

  it('update_todo — 지금 내용을 원문으로 보여준다', () => {
    const p = ok(propose('update_todo', { match: '장보기', text: '장보기(우유)' }));
    expect(p.target?.original).toBe('장보기');
    expect(valueOf(p, '내용')).toBe('장보기(우유)');
    expect(p.targetId).toBe('t1');
  });

  it('update_todo — 바꿀 것이 없으면 하지 않는다', () => {
    expect(rejected(propose('update_todo', { match: '장보기' }))).toContain('무엇을 바꿀지');
  });

  it('complete_todo — 이미 끝낸 것은 다시 완료하지 않는다', () => {
    expect(rejected(propose('complete_todo', { match: '수행평가' }))).toContain('이미 끝낸');
  });

  it('complete_todo — undo 로 되돌릴 수 있다', () => {
    const p = ok(propose('complete_todo', { match: '수행평가', undo: true }));
    expect(p.title).toBe('할 일 되돌리기');
    expect(p.targetId).toBe('t2');
  });

  it('★delete_todo — 지울 것의 원문을 보여준다 (계획서 요구사항)', () => {
    const p = ok(propose('delete_todo', { match: '장보기' }));
    expect(p.action).toBe('delete');
    expect(p.target?.original).toBe('장보기');
    expect(valueOf(p, '마감')).toBe('2026-08-25');
  });

  it('★없는 것을 가리키면 지우지 않는다', () => {
    expect(rejected(propose('delete_todo', { match: '빨래' }))).toContain('찾지 못했어요');
  });

  it('★후보가 여럿이면 고르지 않고 되묻는다 — 아무거나 지우는 것이 최악이다', () => {
    const reason = rejected(propose('delete_todo', { match: '' }));
    expect(reason.length).toBeGreaterThan(0);

    const many = buildWriteProposal('delete_todo', JSON.stringify({ match: '자료' }), {
      ...SRC,
      todos: [
        { id: 'x1', text: '학년 회의 자료', completed: false },
        { id: 'x2', text: '수업 자료 정리', completed: false },
      ],
    });
    expect(rejected(many)).toContain('여러 개');
  });
});

describe('일정 (3)', () => {
  it('create_event — 기간 일정은 시작~끝으로 보여준다', () => {
    const p = ok(
      propose('create_event', {
        title: '수학여행',
        date: '2026-10-05',
        endDate: '2026-10-07',
        location: '경주',
      }),
    );
    expect(valueOf(p, '날짜')).toBe('2026-10-05 ~ 2026-10-07');
    expect(valueOf(p, '장소')).toBe('경주');
  });

  it('create_event — 끝이 시작보다 앞이면 만들지 않는다', () => {
    expect(
      rejected(propose('create_event', { title: 'x', date: '2026-10-07', endDate: '2026-10-05' })),
    ).toContain('앞이라');
  });

  it('create_event — 날짜가 없으면 만들지 않는다', () => {
    expect(rejected(propose('create_event', { title: '회식' }))).toContain('날짜');
  });

  it('update_event — 원문에 날짜가 함께 붙는다(같은 제목 구분용)', () => {
    const p = ok(propose('update_event', { match: '총회', time: '15:00' }));
    expect(p.target?.original).toBe('2026-08-25 학부모 총회');
    expect(p.targetId).toBe('e1');
  });

  it('delete_event — 지울 일정의 날짜·시각·장소를 보여준다', () => {
    const p = ok(propose('delete_event', { match: '학부모 총회' }));
    expect(p.target?.original).toContain('학부모 총회');
    expect(valueOf(p, '장소')).toBe('시청각실');
  });
});

describe('메모 (3)', () => {
  it('create_memo — 색을 한국어로 보여준다', () => {
    const p = ok(propose('create_memo', { content: '내일 회의', color: 'pink' }));
    expect(valueOf(p, '색')).toBe('분홍');
    expect(p.values.content).toBe('내일 회의');
  });

  it('create_memo — 긴 내용은 미리보기만 줄이고 저장은 전문 그대로다', () => {
    const long = '가'.repeat(200);
    const p = ok(propose('create_memo', { content: long }));
    expect(valueOf(p, '내용')?.length).toBeLessThan(long.length);
    expect(p.values.content).toBe(long);
  });

  it('update_memo — 바꿀 내용이 없으면 하지 않는다', () => {
    expect(rejected(propose('update_memo', { match: '회의' }))).toContain('바꿀 메모 내용');
  });

  it('★delete_memo — 제목이 없으므로 내용을 원문으로 보여준다', () => {
    const p = ok(propose('delete_memo', { match: '회의 자료' }));
    expect(p.target?.original).toBe('회의 자료 준비하기');
  });
});

describe('진도 (3)', () => {
  it('create_progress — 반·날짜·교시·단원이 모두 뜬다', () => {
    const p = ok(
      propose('create_progress', {
        className: '2학년 5반',
        date: '2026-08-25',
        period: 2,
        unit: '3단원 도형',
      }),
    );

    expect(valueOf(p, '수업반')).toBe('2학년 5반');
    expect(valueOf(p, '교시')).toBe('2교시');
    expect(valueOf(p, '상태')).toBe('완료');
    expect(p.values.classId).toBe('c2');
  });

  it('create_progress — 날짜를 안 주면 오늘로 본다', () => {
    const p = ok(propose('create_progress', { className: '2학년 5반', period: 1, unit: 'x' }));
    expect(valueOf(p, '날짜')).toBe('2026-08-23');
  });

  it('★같은 반·날짜·교시에 이미 있으면 새로 만들지 않는다', () => {
    const reason = rejected(
      propose('create_progress', {
        className: '3학년 2반',
        date: '2026-08-24',
        period: 3,
        unit: '딴 단원',
      }),
    );
    expect(reason).toContain('이미');
    expect(reason).toContain('2단원 함수');
  });

  it('교시 범위를 벗어나면 만들지 않는다 — 0교시·99교시가 저장되지 않게', () => {
    expect(
      rejected(propose('create_progress', { className: '3학년 2반', period: 0, unit: 'x' })),
    ).toContain('몇 교시');
    expect(
      rejected(propose('create_progress', { className: '3학년 2반', period: 99, unit: 'x' })),
    ).toContain('몇 교시');
  });

  it('update_progress — 반·날짜·교시로 대상을 찾고 원문을 보여준다', () => {
    const p = ok(
      propose('update_progress', {
        className: '3학년 2반',
        date: '2026-08-24',
        period: 3,
        unit: '3단원',
      }),
    );
    expect(p.target?.original).toContain('2단원 함수');
    expect(p.targetId).toBe('pr1');
  });

  it('delete_progress — 없는 자리를 가리키면 지우지 않는다', () => {
    expect(
      rejected(
        propose('delete_progress', { className: '3학년 2반', date: '2026-08-25', period: 3 }),
      ),
    ).toContain('진도가 없어요');
  });

  it('없는 수업반 이름이면 하지 않는다 — 모델이 지어낸 반', () => {
    expect(
      rejected(propose('create_progress', { className: '9학년 9반', period: 1, unit: 'x' })),
    ).toContain('찾지 못했어요');
  });
});

describe('즐겨찾기 (4)', () => {
  it('★create_bookmark — 주소를 그대로 보여준다(무엇이 저장될지 감추지 않는다)', () => {
    const p = ok(
      propose('create_bookmark', { name: '학교알리미', url: 'https://schoolinfo.go.kr/x?y=1' }),
    );
    expect(valueOf(p, '주소')).toBe('https://schoolinfo.go.kr/x?y=1');
    expect(valueOf(p, '묶음')).toBe('업무');
  });

  it('create_bookmark — 없는 묶음을 대면 만들지 않는다', () => {
    expect(
      rejected(propose('create_bookmark', { name: 'x', url: 'https://x.kr', group: '없는묶음' })),
    ).toContain('찾지 못했어요');
  });

  it('update_bookmark — 지금 이름과 주소를 원문으로 보여준다', () => {
    const p = ok(propose('update_bookmark', { match: '나이스', url: 'https://neis.go.kr/new' }));
    expect(p.target?.original).toBe('나이스 (https://neis.go.kr)');
  });

  it('delete_bookmark — 지울 것의 이름과 주소를 보여준다', () => {
    const p = ok(propose('delete_bookmark', { match: '에듀파인' }));
    expect(p.target?.original).toContain('klef.go.kr');
  });

  it('create_bookmark_group — 이미 있으면 만들지 않는다', () => {
    expect(rejected(propose('create_bookmark_group', { name: '업무' }))).toContain('이미 있어요');
  });
});

describe('노트 (5)', () => {
  it('create_notebook — 같은 이름이 이미 있으면 만들지 않는다', () => {
    expect(rejected(propose('create_notebook', { title: '3학년 수학' }))).toContain('이미 있어요');
    expect(ok(propose('create_notebook', { title: '3학년 과학' })).values.title).toBe('3학년 과학');
  });

  it('create_note_section — 어느 노트책인지 함께 보여준다', () => {
    const p = ok(propose('create_note_section', { notebook: '학급 운영', title: '2학기' }));
    expect(valueOf(p, '노트책')).toBe('학급 운영');
    expect(p.values.notebookId).toBe('nb2');
  });

  it('★구역 이름이 여러 노트책에 겹치면 되묻는다', () => {
    // '수업 준비' 는 두 노트책에 다 있다.
    expect(rejected(propose('create_note_page', { section: '수업 준비', title: 'x' }))).toContain(
      '여러 개',
    );
  });

  it('노트책을 함께 주면 그 안에서만 찾는다', () => {
    const p = ok(
      propose('create_note_page', { notebook: '학급 운영', section: '수업 준비', title: '3월' }),
    );
    expect(p.values.sectionId).toBe('s2');
    expect(valueOf(p, '노트책')).toBe('학급 운영');
  });

  it('rename_note_page — 지금 제목을 원문으로 보여준다', () => {
    const p = ok(propose('rename_note_page', { match: '2단원', title: '2단원 수업안' }));
    expect(p.target?.original).toBe('2단원 지도안');
    expect(p.targetId).toBe('p1');
  });

  it('★delete_note_page — 어디의 무엇인지와 함께 "글도 사라진다"를 알린다', () => {
    const p = ok(propose('delete_note_page', { match: '2단원 지도안' }));
    expect(p.target?.original).toBe('2단원 지도안');
    expect(valueOf(p, '노트책')).toBe('3학년 수학');
    expect(valueOf(p, '구역')).toBe('수업 준비');
    expect(valueOf(p, '주의')).toContain('사라져요');
  });
});

describe('★모든 제안은 사람이 확인할 수 있는 모양이다', () => {
  const SAMPLES: readonly (readonly [string, object])[] = [
    ['create_todo', { text: 'a' }],
    ['update_todo', { match: '장보기', text: 'b' }],
    ['complete_todo', { match: '장보기' }],
    ['delete_todo', { match: '장보기' }],
    ['create_event', { title: 'a', date: '2026-09-01' }],
    ['update_event', { match: '총회', title: 'b' }],
    ['delete_event', { match: '총회' }],
    ['create_memo', { content: 'a' }],
    ['update_memo', { match: '회의 자료', content: 'b' }],
    ['delete_memo', { match: '회의 자료' }],
    ['create_progress', { className: '2학년 5반', period: 1, unit: 'a' }],
    ['update_progress', { className: '3학년 2반', date: '2026-08-24', period: 3, unit: 'b' }],
    ['delete_progress', { className: '3학년 2반', date: '2026-08-24', period: 3 }],
    ['create_bookmark', { name: 'a', url: 'https://a.kr' }],
    ['update_bookmark', { match: '나이스', name: 'b' }],
    ['delete_bookmark', { match: '나이스' }],
    ['create_bookmark_group', { name: '새 묶음' }],
    ['create_notebook', { title: '새 노트책' }],
    ['create_note_section', { notebook: '학급 운영', title: 'a' }],
    ['create_note_page', { notebook: '학급 운영', section: '수업 준비', title: 'a' }],
    ['rename_note_page', { match: '2단원', title: 'b' }],
    ['delete_note_page', { match: '2단원' }],
    ['set_attendance', { student: '15번', status: '결석', period: 3 }],
    [
      'add_observation',
      { student: '7번', content: '발표를 또렷하게 했다', className: '3학년 2반' },
    ],
    [
      'set_rubric_mark',
      { student: '7번', rubric: '토론 평가', criterion: '주장의 명확성', level: '잘함' },
    ],
  ];

  it('25종 전부 제안이 만들어진다', () => {
    expect(SAMPLES).toHaveLength(25);
    expect(SAMPLES.map(([tool]) => tool).sort()).toEqual([...writeToolNames()].sort());
  });

  it.each([...SAMPLES])('%s — 제목이 있고, 고치기·지우기에는 원문이 붙는다', (tool, args) => {
    const p = ok(propose(tool, args));

    expect(p.title.length).toBeGreaterThan(0);
    expect(p.tool).toBe(tool);
    if (p.action === 'create') {
      // 만들기는 대상이 없다 — 새로 생기는 것이라 "원문"이 존재하지 않는다.
      expect(p.target).toBeUndefined();
      expect(p.fields.length).toBeGreaterThan(0);
    } else {
      expect(p.target?.original.length, `${tool} 에 원문이 없다`).toBeGreaterThan(0);
      expect(p.targetId, `${tool} 에 대상 식별자가 없다`).toBeTruthy();
    }
  });

  it('★어떤 제안에도 식별자가 화면 문구로 새지 않는다', () => {
    for (const [tool, args] of SAMPLES) {
      const p = ok(propose(tool, args));
      const shown = [
        p.title,
        ...p.fields.map((f) => `${f.label}${f.value}`),
        p.target?.original ?? '',
      ].join(' ');
      for (const id of ['t1', 't2', 'e1', 'm1', 'pr1', 'b1', 'nb1', 's1', 'p1']) {
        expect(shown.includes(id), `${tool} 미리보기에 내부 식별자 ${id} 가 보인다`).toBe(false);
      }
    }
  });
});
