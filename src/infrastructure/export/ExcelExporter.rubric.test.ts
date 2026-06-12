/**
 * 수행평가 루브릭 엑셀 내보내기 (FR-5) — 라운드트립 검증.
 * 생성한 버퍼를 ExcelJS로 다시 읽어 셀 값을 확인한다
 * ("동작한다"의 기준은 실제 파일 바이트 — 런타임 검증 원칙).
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { RubricExportRow } from '@domain/rules/rubricRules';
import { exportRubricToExcel } from './ExcelExporter';

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

const ROWS: RubricExportRow[] = [
  {
    number: 1,
    name: '성춘향',
    scores: [10, 5],
    total: 15,
    notes: ['', '근거 3개 제시'],
    remark: '',
  },
  {
    number: 2,
    name: '이몽룡',
    scores: [8, null],
    total: 8,
    notes: ['', ''],
    remark: '부분 채점',
  },
  {
    number: 3,
    name: '방자',
    scores: [null, null],
    total: null,
    notes: ['', ''],
    remark: '결시',
  },
];

const CRITERIA = ['주장의 명확성', '근거의 타당성'];

describe('exportRubricToExcel', () => {
  it('점수만(기본): 번호/이름/요소별 점수/합계/비고 열 구성 + 빈칸 보존', async () => {
    const buffer = await exportRubricToExcel({
      title: '설득하는 글쓰기',
      criterionNames: CRITERIA,
      rows: ROWS,
      includeNotes: false,
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('설득하는 글쓰기');
    expect(ws).toBeDefined();

    const header = ws!.getRow(1).values as Array<unknown>;
    expect(header.slice(1)).toEqual([
      '번호',
      '이름',
      '주장의 명확성',
      '근거의 타당성',
      '합계',
      '비고',
    ]);

    // 1번 완료 학생
    const row1 = ws!.getRow(2).values as Array<unknown>;
    expect(row1.slice(1)).toEqual([1, '성춘향', 10, 5, 15, '']);

    // 2번 부분 채점 — 미채점 요소는 빈칸 (0 아님)
    const row2 = ws!.getRow(3);
    expect(row2.getCell(3).value).toBe(8);
    expect(row2.getCell(4).value ?? '').toBe('');
    expect(row2.getCell(5).value).toBe(8);
    expect(row2.getCell(6).value).toBe('부분 채점');

    // 3번 결시 — 전부 빈칸 + 비고 '결시' (0점 강제 금지)
    const row3 = ws!.getRow(4);
    expect(row3.getCell(3).value ?? '').toBe('');
    expect(row3.getCell(4).value ?? '').toBe('');
    expect(row3.getCell(5).value ?? '').toBe('');
    expect(row3.getCell(6).value).toBe('결시');
  });

  it('메모 포함 옵션: 합계 뒤에 요소별 메모 열이 추가된다', async () => {
    const buffer = await exportRubricToExcel({
      title: '설득하는 글쓰기',
      criterionNames: CRITERIA,
      rows: ROWS,
      includeNotes: true,
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('설득하는 글쓰기')!;

    const header = ws.getRow(1).values as Array<unknown>;
    expect(header.slice(1)).toEqual([
      '번호',
      '이름',
      '주장의 명확성',
      '근거의 타당성',
      '합계',
      '주장의 명확성 메모',
      '근거의 타당성 메모',
      '비고',
    ]);

    const row1 = ws.getRow(2);
    expect(row1.getCell(7).value).toBe('근거 3개 제시');
    expect(row1.getCell(8).value ?? '').toBe('');
  });

  it('시트 이름 금지 문자는 제거되고 31자로 잘린다', async () => {
    const buffer = await exportRubricToExcel({
      title: '아주아주아주아주아주아주아주아주 긴 제목: 수행평가/1차*평가?',
      criterionNames: ['요소'],
      rows: [],
      includeNotes: false,
    });
    const wb = await parseWorkbook(buffer);
    expect(wb.worksheets).toHaveLength(1);
    const name = wb.worksheets[0]!.name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(/[\\/*?:[\]]/.test(name)).toBe(false);
  });
});
