/**
 * 수업반 출결 내보내기 — 번호만 저장된 옛 항목(AI 연결로 넣은 것)도 화면과 같은 규칙으로
 * 그 학생에게 이어져 나오는지 실제 워크북을 다시 읽어 확인한다.
 *
 * 화면(통계·조회·입력)과 내보내기가 서로 다른 규칙으로 학생을 찾으면, 화면에서는 결석 1인데
 * 엑셀에서는 0 이 된다.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportAttendanceToExcel } from '../ExcelExporter';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';

/** 여러 학급에서 모인 수업반 — 2번이 둘, 7번은 한 명. */
const roster: TeachingClassStudent[] = [
  { number: 2, name: '도유산', grade: 2, classNum: 1 },
  { number: 2, name: '민서율', grade: 2, classNum: 3 },
  { number: 7, name: '한지후', grade: 2, classNum: 3 },
];

const records: AttendanceRecord[] = [
  {
    classId: 'tc-1',
    date: '2026-11-02',
    period: 3,
    students: [
      { number: 7, status: 'absent', reason: '질병' }, // 번호만 — 7번은 한 명뿐
      { number: 2, status: 'late' }, // 번호만 — 2번은 둘이라 못 정한다
    ],
  },
];

async function loadRows(sheetSuffix: string): Promise<unknown[][]> {
  const buffer = await exportAttendanceToExcel(records, roster, 'A반');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  const sheet = workbook.getWorksheet(`A반 ${sheetSuffix}`);
  if (!sheet) throw new Error(`sheet "A반 ${sheetSuffix}" not found`);
  const rows: unknown[][] = [];
  sheet.eachRow((row) => {
    // exceljs 의 row.values 는 1부터 시작한다(0번 칸은 비어 있다).
    rows.push(Array.from(row.values as unknown as unknown[]).slice(1));
  });
  return rows;
}

describe('exportAttendanceToExcel — 번호만 저장된 옛 항목', () => {
  it('출결 현황: 번호가 명단에 한 명뿐이면 그 학생의 결석으로 나온다', async () => {
    const rows = await loadRows('출결 현황');
    // [번호, 이름, 11/2, 출석, 결석, 지각, 조퇴, 결과]
    const jihu = rows.find((r) => r[1] === '한지후');
    expect(jihu?.[2]).toBe('결석');
    expect(jihu?.[4]).toBe(1);

    // 2번은 둘이라 누구에게도 세지 않는다(짐작으로 지각을 붙이지 않는다).
    for (const name of ['도유산', '민서율']) {
      const row = rows.find((r) => r[1] === name);
      expect(row?.[5]).toBe(0);
    }
  });

  it('통계 요약: 같은 규칙으로 센다', async () => {
    const rows = await loadRows('통계 요약');
    // [번호, 이름, 총 수업일, 출석, 결석, 지각, 조퇴, 결과, 출석률]
    const jihu = rows.find((r) => r[1] === '한지후');
    expect(jihu?.[2]).toBe(1);
    expect(jihu?.[4]).toBe(1);
  });

  it('전체 기록: 이은 항목은 이름이 채워지고, 못 이은 항목도 행으로는 남는다', async () => {
    const rows = await loadRows('전체 기록');
    // [날짜, 교시, 번호, 이름, 상태, 사유, 메모]
    const seven = rows.find((r) => r[2] === 7);
    expect(seven?.[3]).toBe('한지후');
    expect(seven?.[4]).toBe('결석');

    const two = rows.find((r) => r[2] === 2);
    expect(two).toBeDefined();
    expect(two?.[3] ?? '').toBe('');
    expect(two?.[4]).toBe('지각');
  });
});
