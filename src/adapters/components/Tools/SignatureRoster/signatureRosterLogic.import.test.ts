/**
 * 서명받기 — 임포트 그리드 파싱·열 매핑·학급 명렬 변환 단위 테스트.
 *
 * 핵심 가드:
 *  1. 붙여넣기/CSV → 그리드 → 매핑 적용이 커스텀 열까지 보존하는지 (열 편집 연동의 토대)
 *  2. '__new__' 대상이 새 열을 생성해 columns에 반영되는지 (열 편집 ↔ 임포트 양방향 연동)
 *  3. 수업반(TeachingClass) → 명단 변환이 활성 학생·소속·연번 규칙을 지키는지
 */
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@domain/entities/SignatureRoster';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import {
  IMPORT_TARGET_IGNORE,
  IMPORT_TARGET_NEW,
  applyImportMapping,
  classStudentsToMembers,
  parseRosterGrid,
  suggestImportTargets,
  teachingClassToMembers,
} from './signatureRosterLogic';

const COLUMNS: ColumnDef[] = [
  { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
  { key: 'affiliation', label: '소속', type: 'text', builtin: true, order: 1 },
  { key: 'name', label: '이름', type: 'text', builtin: true, order: 2 },
  { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 3 },
  { key: 'signedAt', label: '서명일시', type: 'datetime', builtin: true, order: 4 },
  { key: 'custom_rank', label: '직위', type: 'text', order: 5 },
];

describe('parseRosterGrid — 헤더 판정', () => {
  it('첫 줄이 입력 열 라벨과 일치하면 헤더로 분리한다', () => {
    const grid = parseRosterGrid('소속,이름,직위\n1반,홍길동,교사', COLUMNS);
    expect(grid.header).toEqual(['소속', '이름', '직위']);
    expect(grid.rows).toHaveLength(1);
    expect(grid.width).toBe(3);
  });

  it('이름/성명 토큰으로 시작하는 첫 줄도 헤더로 본다 (라벨 미일치여도)', () => {
    const noMatchColumns: ColumnDef[] = [
      { key: 'name', label: '성함', type: 'text', builtin: true, order: 0 },
    ];
    const grid = parseRosterGrid('이름,번호\n홍길동,1', noMatchColumns);
    expect(grid.header).toEqual(['이름', '번호']);
    expect(grid.rows).toHaveLength(1);
  });

  it('헤더가 없으면 전 행을 데이터로 본다 + BOM을 제거한다', () => {
    const text = '﻿홍길동,3-2\n김철수,3-1';
    const grid = parseRosterGrid(text, COLUMNS);
    expect(grid.header).toBeNull();
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows[0]?.[0]).toBe('홍길동');
  });

  it('빈 텍스트는 빈 그리드를 반환한다', () => {
    const grid = parseRosterGrid('  \n\n', COLUMNS);
    expect(grid.rows).toHaveLength(0);
    expect(grid.width).toBe(0);
  });
});

describe('suggestImportTargets — 기본 매핑 추천', () => {
  it('헤더 라벨이 일치하면 해당 열 키를 추천한다', () => {
    const grid = parseRosterGrid('직위,이름,소속\n교사,홍길동,1반', COLUMNS);
    expect(suggestImportTargets(grid, COLUMNS)).toEqual(['custom_rank', 'name', 'affiliation']);
  });

  it('미일치 헤더 라벨은 새 열로 추천한다', () => {
    const grid = parseRosterGrid('이름,연락처\n홍길동,010-1234-5678', COLUMNS);
    expect(suggestImportTargets(grid, COLUMNS)).toEqual(['name', IMPORT_TARGET_NEW]);
  });

  it('헤더 없으면 첫 칸=이름·둘째 칸=소속·이후=커스텀 열 순서를 추천한다', () => {
    const grid = parseRosterGrid('홍길동,3-2,교사,여분', COLUMNS);
    expect(suggestImportTargets(grid, COLUMNS)).toEqual([
      'name',
      'affiliation',
      'custom_rank',
      IMPORT_TARGET_IGNORE,
    ]);
  });
});

describe('applyImportMapping — 매핑 적용', () => {
  it('이름·소속·커스텀 열을 매핑대로 채우고 연번을 자동 부여한다', () => {
    const grid = parseRosterGrid('직위,이름,소속\n교사,홍길동,1반\n부장교사,김영희,2반', COLUMNS);
    const targets = suggestImportTargets(grid, COLUMNS);
    const result = applyImportMapping(grid, targets, COLUMNS);
    expect(result.members).toHaveLength(2);
    expect(result.members[0]?.name).toBe('홍길동');
    expect(result.members[0]?.affiliation).toBe('1반');
    expect(result.members[0]?.fields.custom_rank).toBe('교사');
    expect(result.members[0]?.fields.no).toBe('1');
    expect(result.members[1]?.fields.no).toBe('2');
    // 새 열이 없으면 columns는 동일 구성 유지.
    expect(result.columns.map((c) => c.key)).toEqual(COLUMNS.map((c) => c.key));
  });

  it("'__new__' 대상은 헤더 라벨로 새 텍스트 열을 만들어 columns에 추가한다", () => {
    const grid = parseRosterGrid('이름,연락처\n홍길동,010-1111-2222', COLUMNS);
    const targets = ['name', IMPORT_TARGET_NEW];
    const result = applyImportMapping(grid, targets, COLUMNS);
    const added = result.columns.find((c) => c.label === '연락처');
    expect(added).toBeDefined();
    expect(added?.type).toBe('text');
    // 새 열의 order는 기존 최대 order보다 뒤.
    expect(added!.order).toBeGreaterThan(Math.max(...COLUMNS.map((c) => c.order)));
    // 멤버 fields에 새 열 키로 값이 들어간다.
    expect(result.members[0]?.fields[added!.key]).toBe('010-1111-2222');
  });

  it("'__ignore__' 칸은 가져오지 않는다", () => {
    const grid = parseRosterGrid('홍길동,비밀메모', COLUMNS);
    const result = applyImportMapping(grid, ['name', IMPORT_TARGET_IGNORE], COLUMNS);
    expect(result.members[0]?.name).toBe('홍길동');
    expect(Object.values(result.members[0]?.fields ?? {})).not.toContain('비밀메모');
  });

  it('removeUnmappedInputColumns: 매핑 안 된 입력 열(소속·직위)을 정리하되 비입력 열은 유지한다', () => {
    // '부서·이름'만 있는 양식 — 소속·직위는 이번 임포트에 안 쓰임.
    const grid = parseRosterGrid('부서,이름\n교무부,홍길동', COLUMNS);
    const targets = suggestImportTargets(grid, COLUMNS); // ['__new__', 'name']
    const result = applyImportMapping(grid, targets, COLUMNS, {
      removeUnmappedInputColumns: true,
    });
    const keys = result.columns.map((c) => c.key);
    // 매핑 안 된 입력 열은 제거.
    expect(keys).not.toContain('affiliation');
    expect(keys).not.toContain('custom_rank');
    // 이름·연번·서명·서명일시(비입력/보호 열)와 새로 만든 '부서' 열은 유지.
    expect(keys).toContain('name');
    expect(keys).toContain('no');
    expect(keys).toContain('signature');
    expect(keys).toContain('signedAt');
    expect(result.columns.some((c) => c.label === '부서')).toBe(true);
    expect(result.members[0]?.name).toBe('홍길동');
  });

  it('removeUnmappedInputColumns 미지정 시 기존 열을 그대로 유지한다 (기본 동작)', () => {
    const grid = parseRosterGrid('부서,이름\n교무부,홍길동', COLUMNS);
    const targets = suggestImportTargets(grid, COLUMNS);
    const result = applyImportMapping(grid, targets, COLUMNS);
    const keys = result.columns.map((c) => c.key);
    expect(keys).toContain('affiliation');
    expect(keys).toContain('custom_rank');
  });

  it('이름 매핑이 없으면 첫 칸을 이름으로 폴백하고, 이름 빈 행은 제외한다', () => {
    const grid = parseRosterGrid('홍길동,1반\n,2반', COLUMNS);
    const result = applyImportMapping(grid, [IMPORT_TARGET_IGNORE, 'affiliation'], COLUMNS);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.name).toBe('홍길동');
    expect(result.members[0]?.affiliation).toBe('1반');
  });
});

describe('classStudentsToMembers — 담임반 변환', () => {
  it('학번을 연번으로, 지정 소속을 모든 멤버에 채운다', () => {
    const members = classStudentsToMembers(
      [{ name: '홍길동', studentNumber: 10201 }, { name: '김영희' }],
      '1-2',
    );
    expect(members).toHaveLength(2);
    expect(members[0]?.fields.no).toBe('10201');
    expect(members[1]?.fields.no).toBe('2'); // 학번 없으면 순번
    expect(members.every((m) => m.affiliation === '1-2')).toBe(true);
  });
});

describe('teachingClassToMembers — 수업반 변환', () => {
  const baseClass: TeachingClass = {
    id: 'tc-1',
    name: '2-3',
    subject: '과학',
    students: [
      { number: 1, name: '홍길동' },
      { number: 2, name: '김영희', status: 'transferred' }, // 전출 — 제외 대상
      { number: 3, name: '', grade: 2, classNum: 5 }, // 이름 미입력 — 번호 표기
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('활성 학생만 포함하고 출석번호를 연번으로 쓴다', () => {
    const members = teachingClassToMembers(baseClass);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.fields.no)).toEqual(['1', '3']);
    expect(members.some((m) => m.name === '김영희')).toBe(false);
  });

  it('학생별 학년·반이 있으면 "학년-반"을, 없으면 수업반 이름을 소속으로 쓴다', () => {
    const members = teachingClassToMembers(baseClass);
    expect(members[0]?.affiliation).toBe('2-3'); // grade/classNum 없음 → 수업반 이름
    expect(members[1]?.affiliation).toBe('2-5'); // grade=2, classNum=5
  });

  it('이름 미입력 학생은 "N번"으로 표기한다', () => {
    const members = teachingClassToMembers(baseClass);
    expect(members[1]?.name).toBe('3번');
  });
});
