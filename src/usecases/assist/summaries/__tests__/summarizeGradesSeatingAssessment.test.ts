/**
 * 쌤핀 AI — 성적·자리 배치·루브릭 집계 (브릿지 동등화 Phase 2)
 *
 * ★셋 다 **원래 개별 학생 데이터**를 다루는 자리다. 그래서 여기서 지키는 것은
 * "숫자가 맞는가"보다 먼저 **"누가"가 새지 않는가**이다. 화이트리스트로 지우는 것이
 * 아니라 요약 함수가 애초에 담지 않아야 한다 — 지우는 방식은 원본에 필드가 하나
 * 늘어날 때 조용히 뚫린다.
 */
import { describe, expect, it } from 'vitest';

import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import { summarizeAssessment } from '../summarizeAssessment';
import { summarizeGrades } from '../summarizeGrades';
import { summarizeSeating } from '../summarizeSeating';

const NAMES = { c1: '3학년 2반', c2: '2학년 5반' };

const PLANS = [
  {
    id: 'a1',
    teachingClassId: 'c1',
    semester: '2',
    subject: '수학',
    title: '2학기 1차 지필',
    kind: 'written-exam',
    fullScore: 100,
  },
  {
    id: 'a2',
    teachingClassId: 'c2',
    semester: '1',
    subject: '수학',
    title: '탐구 보고서',
    kind: 'performance',
    fullScore: 20,
  },
];

const SCORES = [
  { assessmentId: 'a1', score: 95 },
  { assessmentId: 'a1', score: 85 },
  { assessmentId: 'a1', score: 62 },
  { assessmentId: 'a1', score: null },
  { assessmentId: 'a1', score: 40, absenceCode: 'recognized' },
  { assessmentId: 'a2', score: 19 },
];

describe('summarizeGrades', () => {
  it('평균·최고·최저를 낸다 (소수 한 자리)', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES });
    const first = out.items[0];

    expect(first?.count).toBe(3);
    expect(first?.average).toBe(80.7);
    expect(first?.highest).toBe(95);
    expect(first?.lowest).toBe(62);
  });

  it('★결시·미입력은 평균에서 뺀다 — 0점으로 세면 반 평균이 무너진다', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES });
    // 95·85·62 만 셌다. 점수가 빈 1건 + 결시 1건은 absent 로 따로 보고한다.
    expect(out.items[0]?.absent).toBe(2);
    expect(out.items[0]?.average).toBe(80.7);
  });

  it('성취도는 고정분할(90/80/70/60)로 가른다', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES });
    expect(out.items[0]?.distribution).toBe('A 1 · B 1 · C 0 · D 1 · E 0');
  });

  it('★만점이 100이 아니면 환산해서 판정한다 — 20점 만점의 19점은 A다', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES, className: '2학년 5반' });
    expect(out.items[0]?.distribution).toBe('A 1 · B 0 · C 0 · D 0 · E 0');
  });

  it('★학생 식별자가 결과에 없다', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES });
    expect(JSON.stringify(out)).not.toContain('studentKey');
  });

  it('학급·학기로 좁힐 수 있다', () => {
    expect(summarizeGrades(PLANS, SCORES, { classNames: NAMES, semester: '1' }).total).toBe(1);
    expect(
      summarizeGrades(PLANS, SCORES, { classNames: NAMES, className: '3학년 2반' }).total,
    ).toBe(1);
  });

  it('점수가 하나도 없는 평가는 평균이 null 이다 — 0 이 아니라', () => {
    const out = summarizeGrades(PLANS, [], { classNames: NAMES });
    expect(out.items[0]?.average).toBeNull();
    expect(out.items[0]?.count).toBe(0);
  });

  it('지필/수행을 한국어로 바꿔 보낸다', () => {
    const out = summarizeGrades(PLANS, SCORES, { classNames: NAMES });
    expect(out.items.map((i) => i.kind)).toEqual(['지필', '수행']);
  });
});

describe('summarizeSeating', () => {
  it('격자 — 자리 수·앉은 인원·빈자리를 센다', () => {
    const out = summarizeSeating(
      {
        rows: 2,
        cols: 3,
        seats: [
          ['s1', 's2', null],
          ['s3', null, null],
        ],
        layout: 'grid',
        pairMode: true,
      },
      { className: '우리 반' },
    );

    expect(out.layout).toBe('격자');
    expect(out.seatCount).toBe(6);
    expect(out.assigned).toBe(3);
    expect(out.empty).toBe(3);
    expect(out.pairMode).toBe(true);
  });

  it('모둠 — 모둠 수와 든 인원을 센다', () => {
    const out = summarizeSeating(
      {
        rows: 0,
        cols: 0,
        seats: [],
        layout: 'group',
        groups: [{ studentIds: ['s1', 's2'] }, { studentIds: ['s3'] }],
      },
      { className: '우리 반' },
    );

    expect(out.layout).toBe('모둠');
    expect(out.groupCount).toBe(2);
    expect(out.assigned).toBe(3);
    expect(out.empty).toBe(0);
  });

  it('자유 배치 — 책상 수와 앉은 책상을 센다', () => {
    const out = summarizeSeating(
      {
        rows: 0,
        cols: 0,
        seats: [],
        layout: 'freestyle',
        freestyleDesks: [{ studentId: 's1' }, { studentId: null }, { studentId: 's2' }],
      },
      { className: '우리 반' },
    );

    expect(out.layout).toBe('자유 배치');
    expect(out.seatCount).toBe(3);
    expect(out.assigned).toBe(2);
  });

  it('★좌석표가 결과에 없다 — "몇 번 자리에 누가"는 영구 제외다', () => {
    const out = summarizeSeating(
      { rows: 1, cols: 2, seats: [['s1', 's2']], layout: 'grid' },
      { className: '우리 반' },
    );
    const text = JSON.stringify(out);

    expect(text).not.toContain('s1');
    expect(text).not.toContain('seats');
  });

  it('배치가 비어 있어도 죽지 않는다', () => {
    const out = summarizeSeating({ rows: 0, cols: 0, seats: [] }, { className: '우리 반' });
    expect(out.seatCount).toBe(0);
    expect(out.empty).toBe(0);
  });
});

const RUBRIC: Rubric = {
  id: 'r1',
  classId: 'c1',
  title: '토론 평가',
  criteria: [
    {
      id: 'k1',
      name: '주장의 명확성',
      order: 0,
      levels: [
        { id: 'l1', name: '탁월함', score: 4 },
        { id: 'l2', name: '잘함', score: 3 },
      ],
    },
    {
      id: 'k2',
      name: '근거의 타당성',
      order: 1,
      levels: [
        { id: 'l3', name: '탁월함', score: 4 },
        { id: 'l4', name: '보통', score: 2 },
      ],
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const GRADINGS: readonly RubricGrading[] = [
  {
    id: 'g1',
    rubricId: 'r1',
    classId: 'c1',
    studentId: 'stu-1',
    status: 'graded',
    marks: { k1: 'l1', k2: 'l3' },
    criterionNotes: { k1: '김지훈은 주장이 또렷했다' },
    overallFeedback: '김지훈 학생 총평',
    gradedAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'g2',
    rubricId: 'r1',
    classId: 'c1',
    studentId: 'stu-2',
    status: 'partial',
    marks: { k1: 'l2' },
    criterionNotes: {},
    gradedAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'g3',
    rubricId: 'r1',
    classId: 'c1',
    studentId: 'stu-3',
    status: 'absent',
    marks: {},
    criterionNotes: {},
    gradedAt: '2026-08-20T00:00:00Z',
  },
];

describe('summarizeAssessment', () => {
  it('채점표별 진행 상황과 평균을 낸다', () => {
    const out = summarizeAssessment([RUBRIC], GRADINGS, { classNames: NAMES });
    const sheet = out.sheets[0];

    expect(sheet?.title).toBe('토론 평가');
    expect(sheet?.students).toBe(3);
    expect(sheet?.graded).toBe(1);
    expect(sheet?.partial).toBe(1);
    expect(sheet?.absent).toBe(1);
    expect(sheet?.maxScore).toBe(8);
    // 결시는 빠지고 8점·3점 두 건의 평균
    expect(sheet?.average).toBe(5.5);
  });

  it('요소마다 수준 분포를 낸다 — "어디서 막혔나"를 보는 자리', () => {
    const out = summarizeAssessment([RUBRIC], GRADINGS, { classNames: NAMES });

    expect(out.criteria.map((c) => [c.criterion, c.marked, c.distribution])).toEqual([
      ['주장의 명확성', 2, '탁월함 1 · 잘함 1'],
      ['근거의 타당성', 1, '탁월함 1 · 보통 0'],
    ]);
  });

  it('★학생별 총평·요소 메모가 결과에 없다 — 영구 제외(학생별 기록 내용)', () => {
    const out = summarizeAssessment([RUBRIC], GRADINGS, { classNames: NAMES });
    const text = JSON.stringify(out);

    expect(text).not.toContain('김지훈');
    expect(text).not.toContain('총평');
    expect(text).not.toContain('stu-1');
  });

  it('학급으로 좁힐 수 있다', () => {
    expect(
      summarizeAssessment([RUBRIC], GRADINGS, { classNames: NAMES, className: '2학년 5반' }).total,
    ).toBe(0);
  });

  it('채점 기록이 없어도 죽지 않는다', () => {
    const out = summarizeAssessment([RUBRIC], [], { classNames: NAMES });
    expect(out.sheets[0]?.average).toBeNull();
    expect(out.criteria[0]?.marked).toBe(0);
  });
});
