import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { loadSheetGrid } from './sheetGrid';
import { parseTranscriptExcel } from './NeisTranscriptExcelParser';
import { parseGradeExcel } from './NeisGradeExcelParser';

function htmlBuffer(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}

/** 나이스 성적 조회 [엑셀]이 흔히 주는 'HTML 표를 .xls로 저장'한 전과목 일람표 모사. */
const NEIS_TRANSCRIPT_HTML = `
<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>
<table border="1">
  <tr><td colspan="10">2026학년도 1학기 전과목 성적 일람표 (1학년 3반)</td></tr>
  <tr>
    <td rowspan="2">번호</td><td rowspan="2">성명</td>
    <td colspan="4">국어</td><td colspan="4">수학</td>
  </tr>
  <tr>
    <td>원점수/과목평균(표준편차)</td><td>성취도(수강자수)</td><td>석차(동석차수)</td><td>석차등급</td>
    <td>원점수/과목평균(표준편차)</td><td>성취도(수강자수)</td><td>석차(동석차수)</td><td>석차등급</td>
  </tr>
  <tr><td>1</td><td>김서준</td><td>95/72.5(12.4)</td><td>A(248)</td><td>11/1</td><td>2</td><td>92/64.8(15.1)</td><td>A(248)</td><td>23/1</td><td>2</td></tr>
  <tr><td>2</td><td>이도윤</td><td>88/72.5(12.4)</td><td>B(248)</td><td>32/2</td><td>3</td><td>76/64.8(15.1)</td><td>C(248)</td><td>61/1</td><td>4</td></tr>
</table>
</body></html>`;

describe('loadSheetGrid', () => {
  it('진짜 .xlsx를 격자+시트명으로 읽는다', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('1학년 3반');
    ws.addRow(['번호', '성명']);
    ws.addRow([1, '홍길동']);
    const buf = await wb.xlsx.writeBuffer();
    const grid = await loadSheetGrid(buf as ArrayBuffer);
    expect(grid.sheetName).toBe('1학년 3반');
    expect(grid.rows[0]).toEqual(['번호', '성명']);
    expect(grid.rows[1]).toEqual([1, '홍길동']);
  });

  it('.xlsx가 아니면 HTML 표 폴백으로 읽는다(시트명 빈값)', async () => {
    const grid = await loadSheetGrid(htmlBuffer(NEIS_TRANSCRIPT_HTML));
    expect(grid.sheetName).toBe('');
    expect(grid.rows.length).toBeGreaterThan(0);
    expect(grid.rows[1]).toContain('번호');
  });

  it('표도 .xlsx도 아니면 원래 오류를 던진다', async () => {
    await expect(loadSheetGrid(htmlBuffer('그냥 텍스트 파일'))).rejects.toThrow();
  });
});

describe('parseTranscriptExcel — 나이스 HTML(.xls) 폴백 종단', () => {
  it('HTML 표로 저장된 전과목 일람표에서 학생 성적을 인식한다', async () => {
    const result = await parseTranscriptExcel(htmlBuffer(NEIS_TRANSCRIPT_HTML));
    expect(result.layout).not.toBeNull();
    expect(result.term).toBe('2026 1학기');
    expect(result.students).toHaveLength(2);

    const a = result.students[0]!;
    expect(a.studentName).toBe('김서준');
    const kor = a.subjects.find((s) => s.subject === '국어')!;
    expect(kor.rawScore).toBe(95);
    expect(kor.achievement).toBe('A');
    expect(kor.rankGrade).toBe(2);
    const math = a.subjects.find((s) => s.subject === '수학')!;
    expect(math.rankGrade).toBe(2);
  });
});

describe('parseGradeExcel — 나이스 HTML(.xls) 폴백 종단', () => {
  it('HTML 표(번호/이름/점수)에서 점수 행을 인식한다', async () => {
    const html = `
      <table>
        <tr><td>번호</td><td>성명</td><td>원점수</td></tr>
        <tr><td>1</td><td>홍길동</td><td>90</td></tr>
        <tr><td>2</td><td>김영희</td><td>85</td></tr>
      </table>`;
    const result = await parseGradeExcel(htmlBuffer(html));
    expect(result.columns).not.toBeNull();
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({ number: 1, name: '홍길동', score: 90 });
    expect(result.records[1]).toEqual({ number: 2, name: '김영희', score: 85 });
  });
});
