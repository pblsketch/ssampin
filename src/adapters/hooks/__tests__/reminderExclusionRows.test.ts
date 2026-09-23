/**
 * ADR-135 — 설정 화면 '제외 학생' 행: 반 카드와 같은 번호, 이름 표시 설정, 기간이 지난 항목 정리.
 */
import { describe, it, expect } from 'vitest';
import { buildExclusionRows, buildFocusRows } from '../reminderExclusionRows';
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const students: Student[] = [
  { id: 'a', name: '김가람', studentNumber: 1 },
  { id: 'b', name: '이나래', studentNumber: 2 },
];

const classes = [
  {
    id: 'c1',
    name: '선택 국어',
    subject: '국어',
    students: [
      { number: 5, name: '박다온', grade: 2, classNum: 3 },
      { number: 5, name: '최라온', grade: 2, classNum: 4 },
    ],
  },
] as unknown as TeachingClass[];

const base = {
  homeroomTitle: '2학년 1반',
  students,
  classes,
  today: '2026-09-23',
};

describe('제외 학생 행', () => {
  it('담임반 먼저, 수업반은 반 카드와 같은 "반-번호"로', () => {
    const rows = buildExclusionRows({
      ...base,
      reminder: {
        nameExposure: 'full',
        excludedStudentIds: [],
        exclusions: [
          { key: 'subject:c1:2-4-5', until: '2026-10-06' },
          { key: 'b', until: '2026-10-22' },
        ],
      },
    });
    expect(rows.map((r) => [r.group, r.label, r.displayName, r.until])).toEqual([
      ['2학년 1반', '2', '이나래', '2026-10-22'],
      ['선택 국어', '4-5', '최라온', '2026-10-06'],
    ]);
  });

  it('기간이 지난 항목은 보이지 않는다', () => {
    const rows = buildExclusionRows({
      ...base,
      reminder: {
        nameExposure: 'full',
        excludedStudentIds: [],
        exclusions: [{ key: 'a', until: '2026-09-22' }],
      },
    });
    expect(rows).toHaveLength(0);
  });

  it('옛 기간 없는 빼기도 보여 주고, 다시 넣을 때까지로 읽는다', () => {
    const rows = buildExclusionRows({
      ...base,
      reminder: { nameExposure: 'full', excludedStudentIds: ['a'], exclusions: [] },
    });
    expect(rows[0]).toMatchObject({ key: 'a', label: '1', until: null, missing: false });
  });

  it("이름 표시 설정을 따른다 — '표시 안 함'이면 이름이 없다", () => {
    const initial = buildExclusionRows({
      ...base,
      reminder: { nameExposure: 'initial', excludedStudentIds: ['a'], exclusions: [] },
    });
    const none = buildExclusionRows({
      ...base,
      reminder: { nameExposure: 'none', excludedStudentIds: ['a'], exclusions: [] },
    });
    expect(initial[0]?.displayName).toBe('김○○');
    expect(none[0]?.displayName).toBe('');
  });

  it('명렬에서 사라진 학생·보관한 반도 행을 남겨 다시 넣을 수 있게 한다', () => {
    const rows = buildExclusionRows({
      ...base,
      reminder: {
        nameExposure: 'full',
        excludedStudentIds: [],
        exclusions: [
          { key: 'gone', until: '2026-10-01' },
          { key: 'subject:archived:1', until: '2026-10-01' },
        ],
      },
    });
    expect(rows.map((r) => r.missing)).toEqual([true, true]);
    expect(rows.map((r) => r.key).sort()).toEqual(['gone', 'subject:archived:1']);
  });
});

describe('관심 학생 행 (ADR-137)', () => {
  it('빼기와 같은 번호·순서, 기간 없음, 명렬에서 사라진 학생도 남긴다', () => {
    const rows = buildFocusRows({
      homeroomTitle: '2학년 1반',
      students,
      classes,
      reminder: {
        nameExposure: 'initial',
        focusedStudentIds: ['subject:c1:2-3-5', 'a', 'gone', 'subject:zz:1'],
      },
    });
    expect(rows.map((r) => [r.group, r.label, r.displayName, r.until, r.missing])).toEqual([
      ['2학년 1반', '1', '김○○', null, false],
      ['선택 국어', '3-5', '박○○', null, false],
      ['2학년 1반', '', '', null, true],
      ['', '', '', null, true],
    ]);
  });
});
