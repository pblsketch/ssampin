/**
 * 교직원 연락처 엑셀 왕복 시험.
 *
 * 핵심은 두 가지다.
 *  1) 우리가 만든 양식을 우리가 다시 읽을 수 있는가 (양식과 해석기가 어긋나지 않는가)
 *  2) 엑셀이 전화번호의 앞 0을 지워 버린 파일도 살려 읽는가
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { StaffContact } from '@domain/entities/StaffContact';
import { parseStaffContactGrid, toStaffContacts } from '@domain/rules/staffContactImportRules';
import {
  exportStaffContactTemplate,
  exportStaffContacts,
  parseStaffContactsFromExcel,
} from './StaffContactExcel';

const opts = { makeId: (i: number) => `id-${i}`, now: '2026-08-21T09:00:00.000Z' };

/** 시험용 엑셀 파일을 즉석에서 만든다. */
async function buildWorkbook(
  sheets: { name: string; rows: (string | number)[][] }[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('exportStaffContactTemplate', () => {
  it('빈 양식을 다시 읽으면 등록될 사람이 없다 — 예시 줄이 걸러진다', async () => {
    const buffer = await exportStaffContactTemplate();
    const grid = await parseStaffContactsFromExcel(buffer);
    const result = parseStaffContactGrid(grid);

    expect(result.headerRowNumber).toBe(1);
    expect(result.summary.total).toBe(0);
  });

  it('양식의 머리글을 모두 알아본다 — 인식 못 한 열이 없다', async () => {
    const grid = await parseStaffContactsFromExcel(await exportStaffContactTemplate());
    const result = parseStaffContactGrid(grid);

    expect(result.ignoredHeaders).toEqual([]);
    expect(Object.keys(result.columns).sort()).toEqual([
      'department',
      'email',
      'homeroom',
      'memo',
      'mobile',
      'name',
      'officePhone',
      'position',
      'subject',
    ]);
  });

  it('작성 안내 시트가 함께 들어 있다', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportStaffContactTemplate());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['교직원 연락처', '작성 안내']);
  });
});

describe('exportStaffContacts 왕복', () => {
  const contacts: StaffContact[] = [
    {
      id: 'a',
      name: '김민호',
      position: '부장',
      department: '3학년부',
      subject: '수학',
      homeroom: '3-1',
      mobile: '010-1111-2222',
      officePhone: '1502',
      email: 'kim@school.kr',
      memo: '수요일 출장 잦음',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    { id: 'b', name: '박서준', mobile: '01033334444', createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('내보낸 파일을 다시 읽으면 내용이 그대로다', async () => {
    const grid = await parseStaffContactsFromExcel(await exportStaffContacts(contacts));
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made).toHaveLength(2);
    expect(made[0]).toMatchObject({
      name: '김민호',
      position: '부장',
      department: '3학년부',
      homeroom: '3-1',
      mobile: '010-1111-2222',
      officePhone: '1502',
      email: 'kim@school.kr',
      memo: '수요일 출장 잦음',
    });
    expect(made[1]).toMatchObject({ name: '박서준', mobile: '01033334444' });
  });

  it('휴대폰 앞자리 0이 살아남는다', async () => {
    const grid = await parseStaffContactsFromExcel(await exportStaffContacts(contacts));
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);
    expect(made[1]?.mobile?.startsWith('010')).toBe(true);
  });

  it('명부가 비어 있어도 머리글만 있는 파일이 나온다', async () => {
    const grid = await parseStaffContactsFromExcel(await exportStaffContacts([]));
    expect(parseStaffContactGrid(grid).summary.total).toBe(0);
  });
});

describe('parseStaffContactsFromExcel — 학교에서 쓰던 파일', () => {
  it('엑셀이 숫자로 바꿔 앞 0이 날아간 번호를 되살린다', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'Sheet1',
        // 1012345678 = 010-1234-5678 에서 0이 날아간 모습
        rows: [
          ['이름', '휴대폰'],
          ['김민호', 1012345678],
        ],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made[0]?.mobile).toBe('01012345678');
  });

  it('지역번호 9자리도 되살린다', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'Sheet1',
        rows: [
          ['이름', '휴대폰'],
          ['김민호', 311234567],
        ],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made[0]?.mobile).toBe('0311234567');
  });

  it('내선번호처럼 짧은 숫자는 건드리지 않는다', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'Sheet1',
        rows: [
          ['이름', '내선번호'],
          ['김민호', 1502],
        ],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made[0]?.officePhone).toBe('1502');
  });

  it('표지 시트가 앞에 있어도 이름 열이 있는 시트를 골라 읽는다', async () => {
    const buffer = await buildWorkbook([
      { name: '표지', rows: [['2026학년도 교직원 명부'], ['작성: 교무부']] },
      {
        name: '명부',
        rows: [
          ['성명', '소속부서', '연락처'],
          ['김민호', '정보부', '010-1111-2222'],
        ],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);
    const made = toStaffContacts(parseStaffContactGrid(grid).rows, opts);

    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ name: '김민호', department: '정보부' });
  });

  it('제목 줄이 머리글 위에 있어도 읽는다', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'Sheet1',
        rows: [['2026학년도 교직원 명부'], [], ['이름', '휴대폰'], ['김민호', '010-1111-2222']],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);
    const result = parseStaffContactGrid(grid);

    expect(result.headerRowNumber).toBe(3);
    expect(result.summary.importable).toBe(1);
  });

  it('이름 열이 어디에도 없으면 읽을 게 없다고 알린다', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'Sheet1',
        rows: [
          ['부서', '휴대폰'],
          ['정보부', '010-1111-2222'],
        ],
      },
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(parseStaffContactGrid(grid).headerRowNumber).toBe(-1);
  });
});
