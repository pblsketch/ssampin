import { describe, it, expect } from 'vitest';
import type { StaffContact } from '@domain/entities/StaffContact';
import {
  detectStaffField,
  findStaffHeaderRow,
  detectStaffColumns,
  parseStaffContactGrid,
  toStaffContacts,
  mergeStaffContacts,
  STAFF_IMPORT_HEADERS,
  STAFF_IMPORT_FIELD_ORDER,
} from '../staffContactImportRules';

const NOW = '2026-08-21T09:00:00.000Z';
const opts = { makeId: (i: number) => `new-${i}`, now: NOW };

/** 표준 양식 머리글 한 줄 */
const HEADER = STAFF_IMPORT_FIELD_ORDER.map((f) => STAFF_IMPORT_HEADERS[f]);

describe('detectStaffField', () => {
  it('표준 머리글을 알아본다', () => {
    expect(detectStaffField('이름')).toBe('name');
    expect(detectStaffField('내선번호')).toBe('officePhone');
  });

  it('학교마다 다른 표현도 받아 준다', () => {
    expect(detectStaffField('성명')).toBe('name');
    expect(detectStaffField('연락처')).toBe('mobile');
    expect(detectStaffField('휴대전화')).toBe('mobile');
    expect(detectStaffField('소속부서')).toBe('department');
    expect(detectStaffField('비고')).toBe('memo');
    expect(detectStaffField('담당 교과')).toBe('subject');
    expect(detectStaffField('교과목')).toBe('subject');
    expect(detectStaffField('메일')).toBe('email');
  });

  it('가운데 공백이 있어도 알아본다', () => {
    expect(detectStaffField('휴 대 폰')).toBe('mobile');
  });

  it('모르는 머리글은 null', () => {
    expect(detectStaffField('혈액형')).toBeNull();
    expect(detectStaffField('')).toBeNull();
  });
});

describe('findStaffHeaderRow', () => {
  it('이름 열이 있는 행을 머리글로 본다', () => {
    const grid = [['2026학년도 교직원 명부'], [''], HEADER, ['김민호']];
    expect(findStaffHeaderRow(grid)).toBe(2);
  });

  it('이름 열이 없으면 -1', () => {
    expect(
      findStaffHeaderRow([
        ['부서', '휴대폰'],
        ['정보부', '010'],
      ]),
    ).toBe(-1);
  });

  it('빈 표는 -1', () => {
    expect(findStaffHeaderRow([])).toBe(-1);
  });
});

describe('detectStaffColumns', () => {
  it('머리글 순서가 뒤바뀌어도 열 위치를 맞춘다', () => {
    const { columns } = detectStaffColumns(['휴대폰', '이름', '부서']);
    expect(columns).toEqual({ mobile: 0, name: 1, department: 2 });
  });

  it('같은 항목이 두 번 나오면 앞쪽 열을 쓴다', () => {
    const { columns } = detectStaffColumns(['이름', '성명']);
    expect(columns.name).toBe(0);
  });

  it('모르는 머리글은 무시 목록으로 돌려준다', () => {
    const { ignoredHeaders } = detectStaffColumns(['이름', '혈액형', '취미']);
    expect(ignoredHeaders).toEqual(['혈액형', '취미']);
  });
});

describe('parseStaffContactGrid', () => {
  it('표준 양식을 그대로 읽는다', () => {
    const grid = [
      HEADER,
      ['김민호', '부장', '3학년부', '수학', '3-1', '010-1111-2222', '1502', 'a@b.kr', '메모'],
    ];
    const result = parseStaffContactGrid(grid);

    expect(result.headerRowNumber).toBe(1);
    expect(result.summary).toEqual({ total: 1, importable: 1, errorRows: 0, warningRows: 0 });
    expect(result.rows[0]?.values.name).toBe('김민호');
    expect(result.rows[0]?.values.officePhone).toBe('1502');
  });

  it('머리글 위에 제목 줄이 있어도 찾아낸다', () => {
    const grid = [
      ['2026학년도 교직원 명부'],
      [],
      HEADER,
      ['김민호', '', '', '', '', '01011112222'],
    ];
    const result = parseStaffContactGrid(grid);
    expect(result.headerRowNumber).toBe(3);
    expect(result.rows[0]?.rowNumber).toBe(4);
  });

  it('이름이 비면 오류로 잡고 등록 대상에서 뺀다', () => {
    const grid = [HEADER, ['', '교사', '정보부']];
    const result = parseStaffContactGrid(grid);

    expect(result.rows[0]?.importable).toBe(false);
    expect(result.summary.errorRows).toBe(1);
    expect(result.rows[0]?.issues[0]?.message).toContain('이름');
  });

  it('중간의 빈 줄은 세지 않는다', () => {
    const grid = [HEADER, ['김민호', '', '', '', '', '01011112222'], ['', '', ''], ['   ']];
    expect(parseStaffContactGrid(grid).summary.total).toBe(1);
  });

  it('연락 수단이 하나도 없으면 경고하되 등록은 허용한다', () => {
    const grid = [HEADER, ['김민호', '교사']];
    const result = parseStaffContactGrid(grid);

    expect(result.rows[0]?.importable).toBe(true);
    expect(result.summary.warningRows).toBe(1);
    expect(result.rows[0]?.issues.map((i) => i.message)).toContain(
      '휴대폰·내선·이메일이 모두 비어 있습니다',
    );
  });

  it('전화번호 자릿수가 이상하면 경고한다', () => {
    const grid = [HEADER, ['김민호', '', '', '', '', '010111122223333']];
    const result = parseStaffContactGrid(grid);
    expect(result.rows[0]?.importable).toBe(true);
    expect(result.rows[0]?.issues.some((i) => i.message.includes('자릿수'))).toBe(true);
  });

  it('내선 3자리는 정상으로 본다', () => {
    const grid = [HEADER, ['김민호', '', '', '', '', '', '150']];
    const result = parseStaffContactGrid(grid);
    expect(result.rows[0]?.issues.some((i) => i.field === 'officePhone')).toBe(false);
  });

  it('이메일 형식이 아니면 경고한다', () => {
    const grid = [HEADER, ['김민호', '', '', '', '', '01011112222', '', '골뱅이없음']];
    const result = parseStaffContactGrid(grid);
    expect(result.rows[0]?.issues.some((i) => i.field === 'email')).toBe(true);
  });

  it('파일 안에 같은 사람이 두 번 있으면 뒤엣것에 경고를 붙인다', () => {
    const grid = [
      HEADER,
      ['김민호', '', '', '', '', '010-1111-2222'],
      ['김민호', '', '', '', '', '01011112222'],
    ];
    const result = parseStaffContactGrid(grid);

    expect(result.rows[0]?.issues).toHaveLength(0);
    expect(result.rows[1]?.issues.map((i) => i.message)).toContain(
      '파일 안에 같은 사람이 또 있습니다',
    );
  });

  it('양식의 예시 줄은 지우지 않아도 등록되지 않는다', () => {
    const grid = [
      HEADER,
      ['(예시) 홍길동', '부장', '3학년부', '수학', '3-1', '010-0000-0000', '1502'],
      ['김민호', '교사', '정보부', '', '', '01011112222'],
    ];
    const result = parseStaffContactGrid(grid);

    expect(result.summary.total).toBe(1);
    expect(result.rows.map((r) => r.values.name)).toEqual(['김민호']);
  });

  it('머리글을 못 찾으면 빈 결과를 돌려준다', () => {
    const result = parseStaffContactGrid([
      ['부서', '휴대폰'],
      ['정보부', '010'],
    ]);
    expect(result.headerRowNumber).toBe(-1);
    expect(result.rows).toEqual([]);
  });
});

describe('toStaffContacts', () => {
  it('오류 행은 건너뛰고 정상 행만 연락처로 만든다', () => {
    const grid = [HEADER, ['김민호', '부장', '3학년부'], ['', '교사']];
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({
      id: 'new-0',
      name: '김민호',
      position: '부장',
      createdAt: NOW,
    });
  });

  it('빈 칸은 아예 저장하지 않는다', () => {
    const grid = [HEADER, ['김민호', '', '', '', '', '01011112222']];
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made[0]).not.toHaveProperty('position');
    expect(made[0]?.mobile).toBe('01011112222');
  });
});

describe('mergeStaffContacts', () => {
  const existing: StaffContact[] = [
    {
      id: 'old-1',
      name: '김민호',
      mobile: '010-1111-2222',
      department: '3학년부',
      favorite: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    { id: 'old-2', name: '박서준', mobile: '01033334444', createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('replace는 기존 목록을 통째로 갈아치운다', () => {
    const incoming: StaffContact[] = [{ id: 'new-0', name: '이하늘', createdAt: NOW }];
    expect(mergeStaffContacts(existing, incoming, 'replace', NOW)).toEqual(incoming);
  });

  it('merge는 새 사람을 뒤에 더한다', () => {
    const incoming: StaffContact[] = [{ id: 'new-0', name: '이하늘', createdAt: NOW }];
    const merged = mergeStaffContacts(existing, incoming, 'merge', NOW);

    expect(merged.map((c) => c.name)).toEqual(['김민호', '박서준', '이하늘']);
  });

  it('merge에서 같은 사람은 내용만 갱신하고 id·즐겨찾기는 지킨다', () => {
    const incoming: StaffContact[] = [
      { id: 'new-0', name: '김민호', mobile: '01011112222', department: '정보부', createdAt: NOW },
    ];
    const merged = mergeStaffContacts(existing, incoming, 'merge', NOW);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: 'old-1',
      department: '정보부',
      favorite: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: NOW,
    });
  });

  it('하이픈 차이는 같은 사람으로 본다', () => {
    const incoming: StaffContact[] = [
      { id: 'new-0', name: '박서준', mobile: '010-3333-4444', createdAt: NOW },
    ];
    expect(mergeStaffContacts(existing, incoming, 'merge', NOW)).toHaveLength(2);
  });

  it('이름이 같아도 휴대폰이 다르면 다른 사람으로 본다 — 동명이인 보호', () => {
    const incoming: StaffContact[] = [
      { id: 'new-0', name: '김민호', mobile: '01099998888', createdAt: NOW },
    ];
    const merged = mergeStaffContacts(existing, incoming, 'merge', NOW);

    expect(merged).toHaveLength(3);
    expect(merged.filter((c) => c.name === '김민호')).toHaveLength(2);
  });

  it('원본 배열을 건드리지 않는다', () => {
    mergeStaffContacts(existing, [{ id: 'new-0', name: '이하늘', createdAt: NOW }], 'merge', NOW);
    expect(existing).toHaveLength(2);
  });
});
