import { describe, it, expect } from 'vitest';
import type { Rubric, RubricGrading } from '../entities/Rubric';
import {
  MAX_RUBRICS_PER_CLASS,
  DEFAULT_LEVEL_PRESETS,
  createDefaultLevels,
  cloneLevels,
  countClassRubrics,
  canAddRubric,
  validateRubric,
  calculateTotal,
  calculateMaxScore,
  deriveGradingStatus,
  findGradingsForRubric,
  calculateStructureChangeImpact,
  sanitizeGradingsForRubric,
  copyRubricToClass,
  createEmptyGrading,
  toggleMark,
  setAbsentStatus,
  setCriterionNote,
  setOverallFeedback,
  findGrading,
  buildRubricExportRows,
  planRubricCopy,
  buildRubricFeedbackDocs,
} from './rubricRules';

/** 테스트용 순차 id 생성기 */
function makeIdGen(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** 요소 2개(수준 구성이 서로 다름 — D7) 표준 픽스처 */
function makeRubric(overrides?: Partial<Rubric>): Rubric {
  return {
    id: 'rubric-1',
    classId: 'class-1',
    title: '설득하는 글쓰기',
    criteria: [
      {
        id: 'crit-1',
        name: '주장의 명확성',
        order: 0,
        levels: [
          { id: 'lv-1a', name: '탁월함', score: 10 },
          { id: 'lv-1b', name: '잘함', score: 8 },
          { id: 'lv-1c', name: '보통', score: 6 },
        ],
      },
      {
        id: 'crit-2',
        name: '근거의 타당성',
        order: 1,
        levels: [
          { id: 'lv-2a', name: '우수', score: 5, description: '근거 3개 이상' },
          { id: 'lv-2b', name: '미흡', score: 2 },
        ],
      },
    ],
    createdAt: '2026-06-12T00:00:00.000Z',
    updatedAt: '2026-06-12T00:00:00.000Z',
    ...overrides,
  };
}

function makeGrading(overrides?: Partial<RubricGrading>): RubricGrading {
  return {
    id: 'grading-1',
    rubricId: 'rubric-1',
    classId: 'class-1',
    studentId: '1-1-1',
    status: 'partial',
    marks: {},
    criterionNotes: {},
    gradedAt: '2026-06-12T00:00:00.000Z',
    ...overrides,
  };
}

/* ──────────────── 생성 헬퍼 ──────────────── */

describe('createDefaultLevels / cloneLevels', () => {
  it('기본 수준 4개 (탁월함 10 / 잘함 8 / 보통 6 / 노력 필요 4)를 생성한다', () => {
    const levels = createDefaultLevels(makeIdGen());
    expect(levels).toHaveLength(4);
    expect(levels.map((l) => l.name)).toEqual(DEFAULT_LEVEL_PRESETS.map((p) => p.name));
    expect(levels.map((l) => l.score)).toEqual([10, 8, 6, 4]);
    // id는 모두 고유
    expect(new Set(levels.map((l) => l.id)).size).toBe(4);
  });

  it('cloneLevels는 이름·배점·설명을 복제하되 id는 새로 발급한다', () => {
    const source = [
      { id: 'a', name: '상', score: 5, description: '설명' },
      { id: 'b', name: '하', score: 1 },
    ];
    const cloned = cloneLevels(source, makeIdGen('new'));
    expect(cloned).toHaveLength(2);
    expect(cloned[0]).toMatchObject({ name: '상', score: 5, description: '설명' });
    expect(cloned[1]).toMatchObject({ name: '하', score: 1 });
    expect(cloned[1]).not.toHaveProperty('description');
    expect(cloned.map((l) => l.id)).toEqual(['new-1', 'new-2']);
  });
});

/* ──────────────── 한도 가드 (D4) ──────────────── */

describe('루브릭 한도 — 수업반당 10개', () => {
  it('9개일 때는 추가 가능, 10개가 되면 추가 불가', () => {
    const nine = Array.from({ length: 9 }, (_, i) => makeRubric({ id: `r-${i}` }));
    expect(canAddRubric(nine, 'class-1')).toBe(true);

    const ten = [...nine, makeRubric({ id: 'r-9' })];
    expect(ten).toHaveLength(MAX_RUBRICS_PER_CLASS);
    expect(canAddRubric(ten, 'class-1')).toBe(false);
  });

  it('다른 수업반의 루브릭은 한도 계산에 포함하지 않는다', () => {
    const rubrics = Array.from({ length: 10 }, (_, i) =>
      makeRubric({ id: `r-${i}`, classId: 'class-other' }),
    );
    expect(countClassRubrics(rubrics, 'class-1')).toBe(0);
    expect(canAddRubric(rubrics, 'class-1')).toBe(true);
  });
});

/* ──────────────── 검증 ──────────────── */

describe('validateRubric', () => {
  it('정상 루브릭은 이슈가 없다', () => {
    expect(validateRubric(makeRubric())).toEqual([]);
  });

  it('제목 공백이면 이슈를 반환한다', () => {
    const issues = validateRubric(makeRubric({ title: '   ' }));
    expect(issues.some((i) => i.message.includes('제목'))).toBe(true);
  });

  it('평가 요소 0개면 이슈를 반환한다', () => {
    const issues = validateRubric({ title: '제목', criteria: [] });
    expect(issues.some((i) => i.message.includes('평가 요소를 1개 이상'))).toBe(true);
  });

  it('평가 요소 11개면 한도 초과 이슈를 반환한다', () => {
    const criteria = Array.from({ length: 11 }, (_, i) => ({
      name: `요소${i}`,
      levels: [
        { id: 'a', name: '상', score: 2 },
        { id: 'b', name: '하', score: 1 },
      ],
    }));
    const issues = validateRubric({ title: '제목', criteria });
    expect(issues.some((i) => i.message.includes('최대 10개'))).toBe(true);
  });

  it('수준 1개면 최소 한도(2개) 이슈를 반환한다', () => {
    const issues = validateRubric({
      title: '제목',
      criteria: [{ name: '요소', levels: [{ id: 'a', name: '상', score: 1 }] }],
    });
    expect(issues.some((i) => i.message.includes('2개 이상'))).toBe(true);
  });

  it('수준 7개면 최대 한도(6개) 이슈를 반환한다', () => {
    const levels = Array.from({ length: 7 }, (_, i) => ({
      id: `lv-${i}`,
      name: `수준${i}`,
      score: i,
    }));
    const issues = validateRubric({ title: '제목', criteria: [{ name: '요소', levels }] });
    expect(issues.some((i) => i.message.includes('최대 6개'))).toBe(true);
  });

  it('요소 이름 공백·수준 이름 공백·음수 배점을 각각 잡는다', () => {
    const issues = validateRubric({
      title: '제목',
      criteria: [
        {
          name: '  ',
          levels: [
            { id: 'a', name: '', score: 3 },
            { id: 'b', name: '하', score: -1 },
          ],
        },
      ],
    });
    expect(issues.some((i) => i.message.includes('요소의 이름'))).toBe(true);
    expect(issues.some((i) => i.message.includes('수준 이름'))).toBe(true);
    expect(issues.some((i) => i.message.includes('0 이상의 숫자'))).toBe(true);
  });

  it('배점이 NaN이면 이슈를 반환한다', () => {
    const issues = validateRubric({
      title: '제목',
      criteria: [
        {
          name: '요소',
          levels: [
            { id: 'a', name: '상', score: Number.NaN },
            { id: 'b', name: '하', score: 1 },
          ],
        },
      ],
    });
    expect(issues.some((i) => i.message.includes('0 이상의 숫자'))).toBe(true);
  });
});

/* ──────────────── 합계 (D1) ──────────────── */

describe('calculateTotal — 단순 합계만', () => {
  it('체크된 수준의 배점을 더한다 (요소별 배점이 달라도, D7)', () => {
    const rubric = makeRubric();
    const grading = makeGrading({ marks: { 'crit-1': 'lv-1b', 'crit-2': 'lv-2a' } });
    expect(calculateTotal(rubric, grading)).toBe(8 + 5);
  });

  it('미채점 요소는 합계에서 제외한다 (부분 채점)', () => {
    const rubric = makeRubric();
    const grading = makeGrading({ marks: { 'crit-1': 'lv-1a' } });
    expect(calculateTotal(rubric, grading)).toBe(10);
  });

  it('결시(absent)는 null을 반환한다 — 합계 산출 제외 (D8)', () => {
    const rubric = makeRubric();
    const grading = makeGrading({
      status: 'absent',
      marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' },
    });
    expect(calculateTotal(rubric, grading)).toBeNull();
  });

  it('삭제된 요소/수준을 가리키는 체크는 무시한다', () => {
    const rubric = makeRubric();
    const grading = makeGrading({
      marks: { 'crit-1': 'lv-삭제됨', 'crit-삭제됨': 'lv-2a', 'crit-2': 'lv-2b' },
    });
    expect(calculateTotal(rubric, grading)).toBe(2);
  });

  it('calculateMaxScore는 요소별 최고 배점의 합이다', () => {
    expect(calculateMaxScore(makeRubric())).toBe(10 + 5);
  });
});

/* ──────────────── 상태 유도 ──────────────── */

describe('deriveGradingStatus', () => {
  it('모든 요소가 유효하게 체크되면 graded', () => {
    const rubric = makeRubric();
    const grading = makeGrading({ marks: { 'crit-1': 'lv-1c', 'crit-2': 'lv-2b' } });
    expect(deriveGradingStatus(rubric, grading)).toBe('graded');
  });

  it('일부만 체크되면 partial', () => {
    const rubric = makeRubric();
    expect(deriveGradingStatus(rubric, makeGrading({ marks: { 'crit-1': 'lv-1a' } }))).toBe(
      'partial',
    );
  });

  it('체크가 삭제된 수준을 가리키면 그 요소는 미채점으로 보아 partial', () => {
    const rubric = makeRubric();
    const grading = makeGrading({ marks: { 'crit-1': 'lv-없음', 'crit-2': 'lv-2a' } });
    expect(deriveGradingStatus(rubric, grading)).toBe('partial');
  });

  it('absent는 marks와 무관하게 absent 보존', () => {
    const rubric = makeRubric();
    const grading = makeGrading({
      status: 'absent',
      marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' },
    });
    expect(deriveGradingStatus(rubric, grading)).toBe('absent');
  });
});

/* ──────────────── 구조 변경 가드 (FR-2) ──────────────── */

describe('calculateStructureChangeImpact', () => {
  it('요소 삭제 시 그 요소를 체크한 기록 수와 요소 이름을 보고한다', () => {
    const before = makeRubric();
    const after = { criteria: [before.criteria[0]!] }; // crit-2 삭제
    const gradings = [
      makeGrading({ id: 'g1', marks: { 'crit-2': 'lv-2a' } }),
      makeGrading({ id: 'g2', marks: { 'crit-1': 'lv-1a' } }), // crit-2 미체크 → 영향 없음
      makeGrading({ id: 'g3', rubricId: 'other', marks: { 'crit-2': 'lv-2a' } }), // 다른 루브릭
    ];
    const impact = calculateStructureChangeImpact(before, after, gradings);
    expect(impact.affectedGradingCount).toBe(1);
    expect(impact.removedCriterionNames).toEqual(['근거의 타당성']);
    expect(impact.criteriaWithRemovedLevels).toEqual([]);
  });

  it('수준 삭제 시 그 수준을 체크한 기록만 영향에 포함한다', () => {
    const before = makeRubric();
    const after = {
      criteria: [
        {
          ...before.criteria[0]!,
          levels: before.criteria[0]!.levels.filter((l) => l.id !== 'lv-1a'),
        },
        before.criteria[1]!,
      ],
    };
    const gradings = [
      makeGrading({ id: 'g1', marks: { 'crit-1': 'lv-1a' } }), // 삭제된 수준 체크 → 영향
      makeGrading({ id: 'g2', marks: { 'crit-1': 'lv-1b' } }), // 남은 수준 체크 → 무영향
    ];
    const impact = calculateStructureChangeImpact(before, after, gradings);
    expect(impact.affectedGradingCount).toBe(1);
    expect(impact.criteriaWithRemovedLevels).toEqual(['주장의 명확성']);
  });

  it('요소/수준 추가만 있으면 영향 0', () => {
    const before = makeRubric();
    const after = {
      criteria: [
        ...before.criteria,
        {
          id: 'crit-new',
          name: '표현',
          order: 2,
          levels: [
            { id: 'lv-n1', name: '상', score: 3 },
            { id: 'lv-n2', name: '하', score: 1 },
          ],
        },
      ],
    };
    const gradings = [makeGrading({ marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' } })];
    const impact = calculateStructureChangeImpact(before, after, gradings);
    expect(impact.affectedGradingCount).toBe(0);
    expect(impact.removedCriterionNames).toEqual([]);
    expect(impact.criteriaWithRemovedLevels).toEqual([]);
  });
});

describe('sanitizeGradingsForRubric', () => {
  it('삭제된 요소/수준을 가리키는 체크·메모를 제거하고 상태를 재계산한다', () => {
    const rubric = makeRubric({
      criteria: [makeRubric().criteria[0]!], // crit-2 삭제된 상태
    });
    const gradings = [
      makeGrading({
        id: 'g1',
        status: 'graded',
        marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' },
        criterionNotes: { 'crit-1': '좋음', 'crit-2': '출처 부정확' },
      }),
    ];
    const result = sanitizeGradingsForRubric(rubric, gradings);
    expect(result[0]!.marks).toEqual({ 'crit-1': 'lv-1a' });
    expect(result[0]!.criterionNotes).toEqual({ 'crit-1': '좋음' });
    // crit-1만 남았고 체크되어 있으므로 graded
    expect(result[0]!.status).toBe('graded');
  });

  it('결시 상태는 정합화 후에도 보존한다', () => {
    const rubric = makeRubric();
    const gradings = [makeGrading({ status: 'absent', marks: { 'crit-1': 'lv-삭제됨' } })];
    const result = sanitizeGradingsForRubric(rubric, gradings);
    expect(result[0]!.status).toBe('absent');
  });

  it('다른 루브릭의 기록은 건드리지 않는다', () => {
    const rubric = makeRubric();
    const other = makeGrading({ id: 'g2', rubricId: 'other', marks: { x: 'y' } });
    const result = sanitizeGradingsForRubric(rubric, [other]);
    expect(result[0]).toBe(other);
  });
});

/* ──────────────── 채점 기록 갱신 (FR-3, Phase 2) ──────────────── */

const NOW = '2026-06-13T01:00:00.000Z';

describe('createEmptyGrading / findGrading', () => {
  it('빈 기록은 partial 상태로 시작한다', () => {
    const grading = createEmptyGrading('g1', 'rubric-1', 'class-1', '1-1-1', NOW);
    expect(grading.status).toBe('partial');
    expect(grading.marks).toEqual({});
    expect(grading.criterionNotes).toEqual({});
  });

  it('findGrading은 (rubricId, studentId) 조합으로 1건을 찾는다', () => {
    const gradings = [
      makeGrading({ id: 'g1', studentId: '1-1-1' }),
      makeGrading({ id: 'g2', studentId: '1-1-2' }),
      makeGrading({ id: 'g3', rubricId: 'other', studentId: '1-1-1' }),
    ];
    expect(findGrading(gradings, 'rubric-1', '1-1-2')?.id).toBe('g2');
    expect(findGrading(gradings, 'rubric-1', '1-1-9')).toBeUndefined();
  });
});

describe('toggleMark — 수준 클릭 즉시 저장의 핵심 규칙', () => {
  it('미체크 요소를 클릭하면 체크되고, 전부 체크되면 graded가 된다', () => {
    const rubric = makeRubric();
    let grading = createEmptyGrading('g1', 'rubric-1', 'class-1', '1-1-1', NOW);
    grading = toggleMark(rubric, grading, 'crit-1', 'lv-1b', NOW);
    expect(grading.marks).toEqual({ 'crit-1': 'lv-1b' });
    expect(grading.status).toBe('partial');

    grading = toggleMark(rubric, grading, 'crit-2', 'lv-2a', NOW);
    expect(grading.status).toBe('graded');
    expect(calculateTotal(rubric, grading)).toBe(8 + 5);
  });

  it('같은 수준을 다시 클릭하면 체크 해제되고 partial로 돌아간다', () => {
    const rubric = makeRubric();
    let grading = makeGrading({
      status: 'graded',
      marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' },
    });
    grading = toggleMark(rubric, grading, 'crit-2', 'lv-2a', NOW);
    expect(grading.marks).toEqual({ 'crit-1': 'lv-1a' });
    expect(grading.status).toBe('partial');
  });

  it('다른 수준을 클릭하면 교체된다', () => {
    const rubric = makeRubric();
    let grading = makeGrading({ marks: { 'crit-1': 'lv-1a' } });
    grading = toggleMark(rubric, grading, 'crit-1', 'lv-1c', NOW);
    expect(grading.marks).toEqual({ 'crit-1': 'lv-1c' });
  });
});

describe('setAbsentStatus — 결시 (D8)', () => {
  it('결시 표시 시 기존 체크는 보존하되 합계는 null', () => {
    const rubric = makeRubric();
    const grading = setAbsentStatus(
      rubric,
      makeGrading({ status: 'graded', marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' } }),
      true,
      NOW,
    );
    expect(grading.status).toBe('absent');
    expect(grading.marks).toEqual({ 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' });
    expect(calculateTotal(rubric, grading)).toBeNull();
  });

  it('결시 해제 시 marks로부터 상태를 재유도한다 (전부 체크 → graded)', () => {
    const rubric = makeRubric();
    const grading = setAbsentStatus(
      rubric,
      makeGrading({ status: 'absent', marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' } }),
      false,
      NOW,
    );
    expect(grading.status).toBe('graded');
    expect(calculateTotal(rubric, grading)).toBe(15);
  });

  it('결시 해제 시 일부만 체크면 partial', () => {
    const rubric = makeRubric();
    const grading = setAbsentStatus(
      rubric,
      makeGrading({ status: 'absent', marks: { 'crit-1': 'lv-1a' } }),
      false,
      NOW,
    );
    expect(grading.status).toBe('partial');
  });
});

describe('setCriterionNote / setOverallFeedback', () => {
  it('메모를 설정하고, 빈 문자열이면 제거한다', () => {
    let grading = makeGrading();
    grading = setCriterionNote(grading, 'crit-1', '근거 출처가 부정확함', NOW);
    expect(grading.criterionNotes).toEqual({ 'crit-1': '근거 출처가 부정확함' });

    grading = setCriterionNote(grading, 'crit-1', '   ', NOW);
    expect(grading.criterionNotes).toEqual({});
  });

  it('총평을 설정하고, 빈 문자열이면 필드 자체를 제거한다 (D6)', () => {
    let grading = makeGrading();
    grading = setOverallFeedback(grading, '논리 전개가 좋아졌어요.', NOW);
    expect(grading.overallFeedback).toBe('논리 전개가 좋아졌어요.');

    grading = setOverallFeedback(grading, '', NOW);
    expect(grading).not.toHaveProperty('overallFeedback');
  });
});

/* ──────────────── 엑셀 내보내기 행 구성 (FR-5, Phase 3) ──────────────── */

describe('buildRubricExportRows', () => {
  const STUDENTS = [
    { key: '1-1-2', number: 2, name: '이몽룡' },
    { key: '1-1-1', number: 1, name: '성춘향' },
    { key: '1-1-3', number: 3, name: '방자' },
    { key: '1-1-4', number: 4, name: '향단' },
  ];

  it('번호 오름차순 + 완료/부분/결시/미채점을 정확히 구분한다', () => {
    const rubric = makeRubric();
    const gradings = [
      // 1번: 완료
      makeGrading({
        id: 'g1',
        studentId: '1-1-1',
        status: 'graded',
        marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2b' },
      }),
      // 2번: 부분 채점
      makeGrading({ id: 'g2', studentId: '1-1-2', marks: { 'crit-1': 'lv-1b' } }),
      // 3번: 결시 (체크가 있어도 빈칸)
      makeGrading({
        id: 'g3',
        studentId: '1-1-3',
        status: 'absent',
        marks: { 'crit-1': 'lv-1a' },
      }),
      // 4번: 기록 없음 (미채점)
    ];
    const rows = buildRubricExportRows(rubric, gradings, STUDENTS);

    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4]);

    expect(rows[0]).toMatchObject({ scores: [10, 2], total: 12, remark: '' });
    expect(rows[1]).toMatchObject({ scores: [8, null], total: 8, remark: '부분 채점' });
    expect(rows[2]).toMatchObject({ scores: [null, null], total: null, remark: '결시' });
    expect(rows[3]).toMatchObject({ scores: [null, null], total: null, remark: '' });
  });

  it('미채점·결시는 0점이 아니라 null(빈칸)이다 — 0점 강제 금지', () => {
    const rubric = makeRubric();
    const rows = buildRubricExportRows(rubric, [], STUDENTS.slice(0, 1));
    expect(rows[0]!.scores.every((s) => s === null)).toBe(true);
    expect(rows[0]!.total).toBeNull();
    expect(rows[0]!.scores.some((s) => s === 0)).toBe(false);
  });

  it('요소별 메모를 요소 순서대로 담는다 (없으면 빈 문자열)', () => {
    const rubric = makeRubric();
    const gradings = [
      makeGrading({
        studentId: '1-1-1',
        criterionNotes: { 'crit-2': '출처 부정확' },
      }),
    ];
    const rows = buildRubricExportRows(
      rubric,
      gradings,
      STUDENTS.slice(1, 2).concat(STUDENTS.slice(0, 1)),
    );
    const row1 = rows.find((r) => r.number === 1)!;
    expect(row1.notes).toEqual(['', '출처 부정확']);
  });

  it('기록은 있지만 메모만 있고 체크가 없으면 합계는 빈칸·비고도 빈칸', () => {
    const rubric = makeRubric();
    const gradings = [makeGrading({ studentId: '1-1-1', criterionNotes: { 'crit-1': '메모만' } })];
    const rows = buildRubricExportRows(rubric, gradings, STUDENTS.slice(1, 2));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.total).toBeNull();
    expect(rows[0]!.remark).toBe('');
    expect(rows[0]!.notes[0]).toBe('메모만');
  });
});

/* ──────────────── 피드백 문서 데이터 (FR-6, Phase 4) ──────────────── */

describe('buildRubricFeedbackDocs', () => {
  const STUDENT = { key: '1-1-1', number: 1, name: '성춘향' };

  it('체크된 수준에 checked 표시 + 메모·총평·합계를 담는다', () => {
    const rubric = makeRubric();
    const gradings = [
      makeGrading({
        studentId: '1-1-1',
        status: 'graded',
        marks: { 'crit-1': 'lv-1b', 'crit-2': 'lv-2a' },
        criterionNotes: { 'crit-2': '출처 보강 필요' },
        overallFeedback: '논리 전개가 좋아졌어요.',
      }),
    ];
    const docs = buildRubricFeedbackDocs(rubric, gradings, [STUDENT], true);
    expect(docs).toHaveLength(1);
    const doc = docs[0]!;

    expect(doc.blocks[0]!.levels.map((l) => l.checked)).toEqual([false, true, false]);
    expect(doc.blocks[1]!.levels.map((l) => l.checked)).toEqual([true, false]);
    expect(doc.blocks[1]!.note).toBe('출처 보강 필요');
    expect(doc.blocks[1]!.levels[0]!.description).toBe('근거 3개 이상');
    expect(doc.overallFeedback).toBe('논리 전개가 좋아졌어요.');
    expect(doc.total).toBe(8 + 5);
    expect(doc.maxScore).toBe(15);
  });

  it('점수 포함 토글 OFF — 배점·합계·만점이 데이터에서 완전히 제거된다', () => {
    const rubric = makeRubric();
    const gradings = [
      makeGrading({
        studentId: '1-1-1',
        status: 'graded',
        marks: { 'crit-1': 'lv-1a', 'crit-2': 'lv-2a' },
      }),
    ];
    const docs = buildRubricFeedbackDocs(rubric, gradings, [STUDENT], false);
    const doc = docs[0]!;

    // 점수 숫자가 어떤 형태로도 남지 않아야 한다 (점수 숨김 출력 스냅샷 — 계획서 §10)
    expect(doc.total).toBeNull();
    expect(doc.maxScore).toBeNull();
    expect(doc.blocks.flatMap((b) => b.levels).every((l) => l.score === null)).toBe(true);
    // 체크 표시·수준 이름은 그대로 유지
    expect(doc.blocks[0]!.levels.some((l) => l.checked)).toBe(true);
  });

  it('결시 학생 — isAbsent + 체크 없음 + 합계 null (D8)', () => {
    const rubric = makeRubric();
    const gradings = [
      makeGrading({ studentId: '1-1-1', status: 'absent', marks: { 'crit-1': 'lv-1a' } }),
    ];
    const docs = buildRubricFeedbackDocs(rubric, gradings, [STUDENT], true);
    const doc = docs[0]!;
    expect(doc.isAbsent).toBe(true);
    expect(doc.blocks.flatMap((b) => b.levels).every((l) => !l.checked)).toBe(true);
    expect(doc.total).toBeNull();
  });

  it('대상 선택은 students 배열로 결정 — 전달한 학생만, 번호 오름차순으로 생성', () => {
    const rubric = makeRubric();
    const docs = buildRubricFeedbackDocs(
      rubric,
      [],
      [
        { key: '1-1-3', number: 3, name: '방자' },
        { key: '1-1-1', number: 1, name: '성춘향' },
      ],
      true,
    );
    expect(docs.map((d) => d.studentNumber)).toEqual([1, 3]);
    // 기록 없는 학생: 체크 없음 + 합계 null(빈칸) — 0점 강제 금지
    expect(docs[0]!.total).toBeNull();
  });
});

/* ──────────────── 다중 반 복사 계획 (FR-4) ──────────────── */

describe('planRubricCopy', () => {
  it('한도 미만 반은 허용, 이미 10개인 반은 건너뛴다', () => {
    const full = Array.from({ length: 10 }, (_, i) =>
      makeRubric({ id: `f-${i}`, classId: 'class-full' }),
    );
    const some = Array.from({ length: 3 }, (_, i) =>
      makeRubric({ id: `s-${i}`, classId: 'class-some' }),
    );
    const plan = planRubricCopy([...full, ...some], ['class-full', 'class-some', 'class-empty']);
    expect(plan.allowedClassIds).toEqual(['class-some', 'class-empty']);
    expect(plan.skippedClassIds).toEqual(['class-full']);
  });

  it('같은 호출 안에서도 누적 한도를 지킨다 (9개 반에 같은 반을 두 번 지정하면 두 번째는 가능, 10개째 이후는 불가)', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      makeRubric({ id: `n-${i}`, classId: 'class-nine' }),
    );
    const plan = planRubricCopy(nine, ['class-nine', 'class-nine']);
    expect(plan.allowedClassIds).toEqual(['class-nine']);
    expect(plan.skippedClassIds).toEqual(['class-nine']);
  });
});

/* ──────────────── 복사 독립성 (D2) ──────────────── */

describe('copyRubricToClass — 독립 복사본', () => {
  it('구조(요소·수준·점수·설명)는 복제, id는 전부 새로 발급한다', () => {
    const source = makeRubric({ description: '1차 수행' });
    const copy = copyRubricToClass(
      source,
      'class-2',
      makeIdGen('copy'),
      '2026-06-13T00:00:00.000Z',
    );

    expect(copy.classId).toBe('class-2');
    expect(copy.title).toBe(source.title);
    expect(copy.description).toBe('1차 수행');
    expect(copy.createdAt).toBe('2026-06-13T00:00:00.000Z');

    expect(copy.criteria).toHaveLength(2);
    expect(copy.criteria.map((c) => c.name)).toEqual(source.criteria.map((c) => c.name));
    expect(copy.criteria[1]!.levels[0]!.description).toBe('근거 3개 이상');

    // id 독립성: 원본과 겹치는 id가 하나도 없어야 함
    const sourceIds = new Set([
      source.id,
      ...source.criteria.flatMap((c) => [c.id, ...c.levels.map((l) => l.id)]),
    ]);
    const copyIds = [
      copy.id,
      ...copy.criteria.flatMap((c) => [c.id, ...c.levels.map((l) => l.id)]),
    ];
    expect(copyIds.every((id) => !sourceIds.has(id))).toBe(true);
  });

  it('복사 후 원본을 수정해도 복사본은 영향이 없다 (구조 공유 없음)', () => {
    const source = makeRubric();
    const copy = copyRubricToClass(
      source,
      'class-2',
      makeIdGen('copy'),
      '2026-06-13T00:00:00.000Z',
    );
    // 원본 객체가 동결되지 않더라도 참조 공유가 없어야 함
    expect(copy.criteria[0]).not.toBe(source.criteria[0]);
    expect(copy.criteria[0]!.levels[0]).not.toBe(source.criteria[0]!.levels[0]);
  });

  it('findGradingsForRubric — 복사본에는 채점 기록이 따라가지 않는다', () => {
    const source = makeRubric();
    const gradings = [makeGrading({ marks: { 'crit-1': 'lv-1a' } })];
    const copy = copyRubricToClass(
      source,
      'class-2',
      makeIdGen('copy'),
      '2026-06-13T00:00:00.000Z',
    );
    expect(findGradingsForRubric(gradings, copy.id)).toEqual([]);
  });
});
