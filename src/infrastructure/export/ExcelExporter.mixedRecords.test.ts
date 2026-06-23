/**
 * exportMixedRecordsToExcel 라운드트립 테스트
 *
 * 생성된 .xlsx 버퍼를 ExcelJS로 재독해 행수·헤더·첫/마지막 행 값을 검증한다.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportMixedRecordsToExcel } from './ExcelExporter';
import type { MixedRecordFlatRow } from './ExcelExporter';

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

const SAMPLE_ROWS: MixedRecordFlatRow[] = [
  {
    date: '2026-03-10',
    category: '출결',
    studentNumber: 5,
    studentName: '홍길동',
    periodLabel: '3교시',
    statusOrTags: '결석',
    reason: '질병',
    content: '결석 확인서 제출',
  },
  {
    date: '2026-03-11',
    category: '특기사항',
    studentNumber: 7,
    studentName: '김철수',
    periodLabel: '',
    statusOrTags: '교과역량, 학습태도',
    reason: '',
    content: '수업 참여도가 높고 발표를 자발적으로 함',
  },
  {
    date: '2026-03-12',
    category: '출결',
    studentNumber: 2,
    studentName: '이영희',
    periodLabel: '조회',
    statusOrTags: '지각',
    reason: '',
    content: '',
  },
];

describe('exportMixedRecordsToExcel', () => {
  it('ArrayBuffer를 반환한다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('헤더 행이 올바른 한국어 컬럼명을 갖는다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    expect(ws).toBeDefined();

    const headerValues = ws!.getRow(1).values as unknown[];
    // ExcelJS는 1-indexed이므로 index 0은 undefined
    expect(headerValues.slice(1)).toEqual([
      '날짜',
      '구분',
      '번호',
      '이름',
      '교시',
      '상태/태그',
      '사유',
      '내용',
    ]);
  });

  it('데이터 행수가 입력 행수와 일치한다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    // 헤더(1행) + 데이터(3행) = 4행
    expect(ws!.rowCount).toBe(4);
  });

  it('첫 번째 데이터 행이 출결 행 값과 일치한다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    const row2 = ws!.getRow(2).values as unknown[];
    expect(row2[1]).toBe('2026-03-10'); // 날짜
    expect(row2[2]).toBe('출결'); // 구분
    expect(row2[3]).toBe(5); // 번호
    expect(row2[4]).toBe('홍길동'); // 이름
    expect(row2[5]).toBe('3교시'); // 교시
    expect(row2[6]).toBe('결석'); // 상태/태그
    expect(row2[7]).toBe('질병'); // 사유
    expect(row2[8]).toBe('결석 확인서 제출'); // 내용
  });

  it('마지막 데이터 행이 올바르게 기록된다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    const lastRow = ws!.getRow(4).values as unknown[];
    expect(lastRow[1]).toBe('2026-03-12');
    expect(lastRow[2]).toBe('출결');
    expect(lastRow[6]).toBe('지각');
  });

  it('특기사항 행: 태그와 내용이 올바르게 기록된다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    const obsRow = ws!.getRow(3).values as unknown[];
    expect(obsRow[2]).toBe('특기사항');
    expect(obsRow[6]).toBe('교과역량, 학습태도');
    expect(obsRow[8]).toBe('수업 참여도가 높고 발표를 자발적으로 함');
  });

  it('meta 옵션으로 시트 이름이 설정된다', async () => {
    const buffer = await exportMixedRecordsToExcel(SAMPLE_ROWS, {
      className: '2학년 수학',
      periodLabel: '2026-03',
    });
    const wb = await parseWorkbook(buffer);
    expect(wb.worksheets[0]!.name).toBe('2학년 수학 2026-03');
  });

  it('빈 배열로 호출하면 헤더만 있는 파일을 반환한다', async () => {
    const buffer = await exportMixedRecordsToExcel([]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.worksheets[0];
    expect(ws!.rowCount).toBe(1); // 헤더만
  });
});
