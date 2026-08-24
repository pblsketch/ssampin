/**
 * 교직원 연락처 엑셀 읽기 — 앞자리 0 복원 범위 테스트.
 *
 * 엑셀이 숫자로 바꿔 버린 전화번호(1012345678)는 0을 되살려야 하지만,
 * 그 복원이 **휴대폰·내선번호 열에만** 적용되는지를 못 박는다 (2026-08-24 UltraQA P2).
 * 예전에는 모든 열에 적용돼 메모·담임학급의 9~10자리 정수에도 0이 붙었다.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseStaffContactsFromExcel } from '../StaffContactExcel';

/** 행 배열로 시트 한 장짜리 엑셀 파일을 만든다. 숫자를 주면 숫자 셀로 저장된다. */
async function buildExcel(rows: readonly (readonly (string | number)[])[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('교직원 연락처');
  for (const row of rows) {
    ws.addRow([...row]);
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

const HEADER = ['이름', '담임학급', '휴대폰', '내선번호', '메모'] as const;

describe('앞자리 0 복원 — 전화번호 열에만 적용', () => {
  it('휴대폰(10자리)·내선번호(9자리) 숫자 셀은 0을 되살린다', async () => {
    const buffer = await buildExcel([HEADER, ['김철수', '3-1', 1012345678, 311234567, '']]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[1]?.[2]).toBe('01012345678');
    expect(grid[1]?.[3]).toBe('0311234567');
  });

  it('메모·담임학급의 9~10자리 정수에는 0을 붙이지 않는다', async () => {
    // 메모에 사번, 담임학급 칸에 잘못 들어간 큰 숫자 — 전화번호가 아니다.
    const buffer = await buildExcel([HEADER, ['김철수', 123456789, '', '', 1012345678]]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[1]?.[1]).toBe('123456789');
    expect(grid[1]?.[4]).toBe('1012345678');
  });

  it('인식하지 못한 머리글의 열은 복원하지 않는다', async () => {
    const buffer = await buildExcel([
      ['이름', '휴대폰', '계좌번호'],
      ['김철수', 1012345678, 9876543210],
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[1]?.[1]).toBe('01012345678');
    expect(grid[1]?.[2]).toBe('9876543210');
  });

  it('전화번호 열이라도 글자 셀과 8자리 이하 숫자는 건드리지 않는다', async () => {
    const buffer = await buildExcel([HEADER, ['김철수', '', '010-1234-5678', 12345678, '']]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[1]?.[2]).toBe('010-1234-5678');
    expect(grid[1]?.[3]).toBe('12345678');
  });

  it('머리글 위의 제목 줄 숫자는 복원하지 않는다', async () => {
    // 제목 줄에 연도·일련번호 같은 큰 숫자가 있어도 데이터가 아니다.
    const buffer = await buildExcel([
      ['교직원 비상연락망', 2026081234, ''],
      HEADER,
      ['김철수', '3-1', 1012345678, '', ''],
    ]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[0]?.[1]).toBe('2026081234');
    expect(grid[2]?.[2]).toBe('01012345678');
  });

  it('머리글을 못 찾은 파일은 아무 칸도 복원하지 않는다', async () => {
    // 어차피 가져오기 대상이 아니지만, 표 내용이 바뀌지 않는 것도 확인한다.
    const buffer = await buildExcel([['제목 없는 표', 1012345678]]);
    const grid = await parseStaffContactsFromExcel(buffer);

    expect(grid[0]?.[1]).toBe('1012345678');
  });
});
