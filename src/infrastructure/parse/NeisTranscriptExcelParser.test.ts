import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseTranscriptExcel } from './NeisTranscriptExcelParser';
import { parseGradeExcel } from './NeisGradeExcelParser';
import {
  nearMissSubjects,
  studentTranscriptSummary,
  weakSubjects,
} from '@domain/services/transcriptAnalysis';

const header = ['번호', '성명', '교과목', '국어(4)', '수학(3)'];
const ledger = [
  ['2026학년도 1학기', '1학년 2반'],
  header,
  [1, '가상학생가', '원점수', 91, 62],
  ['', '', '성취 도', 'A(120)', 'D(120)'],
  ['', '', '석차등급', 1, 4],
  [2, '가상학생나', '성취도', 'B', 'C'],
  ['', '', '원점수', 84, 73],
  ['', '', '석차등급', 2, 3],
  ['', '', '과목평균', 72.5, 68.4],
  ['', '', '성취도별 분포비율', 'A:20', 'D:15'],
];
async function workbook(
  rows: unknown[][],
  options: { merged?: boolean; cover?: boolean; extra?: boolean } = {},
) {
  const wb = new ExcelJS.Workbook();
  if (options.cover) wb.addWorksheet('안내').addRow(['다음 시트에 성적']);
  const ws = wb.addWorksheet('성적');
  ws.addRows(rows);
  if (options.merged) {
    ws.mergeCells('A3:A5');
    ws.mergeCells('B3:B5');
  }
  if (options.extra) wb.addWorksheet('다른 성적').addRows(ledger);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('전과목 성적 입력 호환성', () => {
  it.each([false, true])(
    '학생별 여러 행을 합치고 통계 행을 학생으로 읽지 않는다 (병합=%s)',
    async (merged) => {
      const result = await parseTranscriptExcel(await workbook(ledger, { merged }));
      expect(result.students).toHaveLength(2);
      expect(result.problem).toBeUndefined();
      expect(result.classLabel).toBe('1학년 2반');
      expect(result.term).toBe('2026 1학기');
      const student = result.students[0]!;
      expect(student.subjects).toHaveLength(2);
      expect(student.subjects[0]).toMatchObject({
        subject: '국어',
        rawScore: 91,
        achievement: 'A',
        totalStudents: 120,
        subjectMean: 72.5,
        rankGrade: 1,
      });
      expect(studentTranscriptSummary(student)).toMatchObject({
        subjectCount: 2,
        avgRankGrade: 2.5,
      });
      expect(weakSubjects(student).map((row) => row.subject)).toEqual(['수학']);
      expect(nearMissSubjects(student, 'rank5')).toEqual([]);
      expect(result.students[1]!.subjects[0]).toMatchObject({
        rawScore: 84,
        achievement: 'B',
        rankGrade: 2,
      });
    },
  );
  it('HTML형 xls의 세로 병합을 읽는다', async () => {
    const html =
      '<table><tr><td>번호</td><td>성명</td><td>교과목</td><td>국어(4)</td></tr><tr><td rowspan="3">1</td><td rowspan="3">가상학생</td><td>원점수</td><td>90</td></tr><tr><td>성취도</td><td>A</td></tr><tr><td>석차등급</td><td>1</td></tr></table>';
    const result = await parseTranscriptExcel(new TextEncoder().encode(html).buffer);
    expect(result.students).toHaveLength(1);
    expect(result.students[0]!.subjects[0]).toMatchObject({
      rawScore: 90,
      achievement: 'A',
      rankGrade: 1,
    });
  });
  it('반복된 표의 과목을 합치며 같은 과목을 중복 집계하지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([
        ...ledger,
        header,
        [1, '가상학생가', '원점수', 91, 62],
        ['번호', '성명', '교과목', '영어(3)'],
        [1, '가상학생가', '성취도', 'B'],
      ]),
    );
    expect(result.students).toHaveLength(2);
    expect(result.students[0]!.subjects.map((row) => row.subject)).toEqual([
      '국어',
      '수학',
      '영어',
    ]);
    expect(result.students[0]!.subjects[0]!.achievement).toBe('A');
  });
  it.each([
    [header, [1, '다른학생', '원점수', 91, 62]],
    [header, [1, '가상학생가', '원점수', 99, 62]],
    [['2학년 3반'], header, [1, '가상학생가', '원점수', 91, 62]],
    [['2026학년도 2학기'], header, [1, '가상학생가', '원점수', 91, 62]],
  ])('서로 다른 학생·과목 값·학급·학기가 충돌하면 일부만 반환하지 않는다', async (...extra) => {
    const result = await parseTranscriptExcel(await workbook([...ledger, ...extra]));
    expect(result.students).toEqual([]);
    expect(result.problem).toBeTruthy();
  });
  it('원점수 의미가 명시되지 않은 합계는 원문으로 보존하고 등급을 만들어내지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([
        header,
        [1, '가상학생', '합계', '91.2(91)', 0],
        ['', '', '성취도', 'A', 'P'],
      ]),
    );
    expect(result.students[0]!.subjects[0]).toMatchObject({
      scoreText: '91.2(91)',
      achievement: 'A',
    });
    expect(result.students[0]!.subjects[0]!.rawScore).toBeUndefined();
    expect(result.students[0]!.subjects[0]!.rankGrade).toBeUndefined();
    expect(result.students[0]!.subjects[1]!.scoreText).toBe('0');
  });
  it('합계(원점수)의 괄호 값과 명시된 0점은 보존한다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([header, [1, '가상학생', '합계(원점수)', '91.2(91)', 0]]),
    );
    expect(result.students[0]!.subjects.map((row) => row.rawScore)).toEqual([91, 0]);
  });

  it.each(['점수', '원점수'])('해석할 수 없는 %s 셀을 원문으로 보존한다', async (label) => {
    const result = await parseTranscriptExcel(
      await workbook([header, [1, '가상학생', label, '미응시'], ['', '', '성취도', 'P']]),
    );
    expect(result.students[0]!.subjects[0]).toMatchObject({
      scoreText: '미응시',
      achievement: 'P',
    });
  });

  it('점수 복합 표기는 임의의 숫자를 골라 원점수로 바꾸지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([header, [1, '가상학생', '점수', '91.2(91)']]),
    );
    expect(result.students[0]!.subjects[0]!.scoreText).toBe('91.2(91)');
    expect(result.students[0]!.subjects[0]!.rawScore).toBeUndefined();
  });
  it('빈 행 뒤 학생을 확인할 수 없는 성적은 부분 저장하지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([header, [1, '가상학생', '원점수', 91], [], ['', '', '성취도', 'D']]),
    );
    expect(result.students).toEqual([]);
    expect(result.problem).toContain('어느 학생');
  });

  it.each(['A3:A5', 'B3:B5'])('번호와 이름 중 한쪽만 병합된 학생도 읽는다 (%s)', async (range) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('성적');
    ws.addRows(ledger);
    ws.mergeCells(range);
    const result = await parseTranscriptExcel((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(result.students).toHaveLength(2);
    expect(result.students[0]!.subjects[0]).toMatchObject({ achievement: 'A', rankGrade: 1 });
  });

  it('통계 행 뒤 신원이 없는 성적은 누락한 채 성공 처리하지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([
        header,
        [1, '가상학생', '원점수', 91],
        ['', '', '과목평균', 70],
        ['', '', '성취도', 'A'],
      ]),
    );
    expect(result.students).toEqual([]);
    expect(result.problem).toContain('어느 학생');
  });
  it('안내 다음 시트의 성적과 30행 이후 머리글을 찾는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([...Array.from({ length: 35 }, () => ['안내']), ...ledger], { cover: true }),
    );
    expect(result.students).toHaveLength(2);
  });
  it('성적 시트가 여러 개면 자동 합치기를 중단한다', async () => {
    const result = await parseTranscriptExcel(await workbook(ledger, { extra: true }));
    expect(result.students).toEqual([]);
    expect(result.problem).toContain('여러 개');
  });

  it('반 열이 있는 파일에서 동번호·동명이인이어도 다른 반을 합치지 않는다', async () => {
    const result = await parseTranscriptExcel(
      await workbook([
        ['반', '번호', '성명', '교과목', '국어(4)'],
        [1, 1, '가상학생', '원점수', 90],
        [2, 1, '가상학생', '원점수', 90],
      ]),
    );
    expect(result.students).toEqual([]);
    expect(result.problem).toBeTruthy();
  });
  it('단일 과목 점수 가져오기는 기존 첫 시트 선택을 유지한다', async () => {
    const result = await parseGradeExcel(await workbook(ledger, { cover: true }));
    expect(result.records).toEqual([]);
  });
});
