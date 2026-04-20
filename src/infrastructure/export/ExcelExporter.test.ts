import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { MultiSurveyResultData, PollResultData, SurveyResultData, WordCloudResultData, ToolResult } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  exportMultiSurveyDataToExcel,
  exportToolResultToExcel,
} from './ExcelExporter';

const mkQuestion = (
  overrides: Partial<MultiSurveyTemplateQuestion> & { id: string; type: MultiSurveyTemplateQuestion['type'] },
): MultiSurveyTemplateQuestion => ({
  id: overrides.id,
  type: overrides.type,
  question: overrides.question ?? '테스트 질문',
  required: overrides.required ?? true,
  options: overrides.options ?? [],
  maxLength: overrides.maxLength ?? 200,
  scaleMin: overrides.scaleMin ?? 1,
  scaleMax: overrides.scaleMax ?? 5,
  scaleMinLabel: overrides.scaleMinLabel ?? '',
  scaleMaxLabel: overrides.scaleMaxLabel ?? '',
});

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe('exportMultiSurveyDataToExcel', () => {
  const sampleData: MultiSurveyResultData = {
    type: 'multi-survey',
    title: '발제 피드백',
    questions: [
      mkQuestion({
        id: 'q1',
        type: 'single-choice',
        question: '이해도는?',
        options: [
          { id: 'high', text: '높음' },
          { id: 'mid', text: '보통' },
          { id: 'low', text: '낮음' },
        ],
      }),
      mkQuestion({
        id: 'q2',
        type: 'multi-choice',
        question: '인상 깊었던 부분은? (복수 선택)',
        options: [
          { id: 'a', text: '사례' },
          { id: 'b', text: '토론' },
          { id: 'c', text: '자료' },
        ],
      }),
      mkQuestion({ id: 'q3', type: 'text', question: '자유로운 의견' }),
      mkQuestion({ id: 'q4', type: 'scale', question: '만족도' }),
    ],
    submissions: [
      {
        id: 'sub1',
        answers: [
          { questionId: 'q1', value: 'high' },
          { questionId: 'q2', value: ['a', 'c'] },
          { questionId: 'q3', value: '매우 좋았습니다' },
          { questionId: 'q4', value: 5 },
        ],
        submittedAt: new Date('2026-04-19T10:00:00').getTime(),
      },
      {
        id: 'sub2',
        answers: [
          { questionId: 'q1', value: 'mid' },
          { questionId: 'q2', value: ['b'] },
          { questionId: 'q3', value: '배웠습니다' },
          { questionId: 'q4', value: 4 },
        ],
        submittedAt: new Date('2026-04-19T10:05:00').getTime(),
      },
      {
        id: 'sub3',
        answers: [
          { questionId: 'q1', value: 'high' },
          { questionId: 'q2', value: [] },
          { questionId: 'q3', value: '' },
          { questionId: 'q4', value: 3 },
        ],
        submittedAt: new Date('2026-04-19T10:10:00').getTime(),
      },
    ],
  };

  it('3개 시트 생성 (요약/전체 응답/워드 빈도)', async () => {
    const buffer = await exportMultiSurveyDataToExcel(sampleData);
    const wb = await parseWorkbook(buffer);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual(['요약', '전체 응답', '워드 빈도']);
  });

  it('텍스트 질문이 없으면 워드 빈도 시트는 생성되지 않음', async () => {
    const noTextData: MultiSurveyResultData = {
      ...sampleData,
      questions: sampleData.questions.filter((q) => q.type !== 'text'),
      submissions: sampleData.submissions.map((s) => ({
        ...s,
        answers: s.answers.filter((a) => a.questionId !== 'q3'),
      })),
    };
    const buffer = await exportMultiSurveyDataToExcel(noTextData);
    const wb = await parseWorkbook(buffer);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual(['요약', '전체 응답']);
    expect(sheetNames).not.toContain('워드 빈도');
  });

  it('Sheet 1 요약 — 헤더 + 메타 + 질문 행 수', async () => {
    const buffer = await exportMultiSurveyDataToExcel(sampleData);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('요약')!;

    // row 1 헤더
    const headerRow = ws.getRow(1);
    expect(headerRow.getCell(1).value).toBe('번호');
    expect(headerRow.getCell(2).value).toBe('질문');
    expect(headerRow.getCell(3).value).toBe('유형');
    expect(headerRow.getCell(4).value).toBe('통계');

    // row 2 메타 (총 참여 · 완료율)
    const metaText = String(ws.getRow(2).getCell(2).value);
    expect(metaText).toContain('총 참여');
    expect(metaText).toContain('3명');

    // row 3~6 = 4개 질문
    expect(ws.getRow(3).getCell(3).value).toBe('단일 선택');
    expect(ws.getRow(4).getCell(3).value).toBe('복수 선택');
    expect(ws.getRow(5).getCell(3).value).toBe('텍스트');
    expect(ws.getRow(6).getCell(3).value).toBe('척도');
  });

  it('Sheet 2 전체 응답 — 응답자 행 수 + 멀티초이스 세미콜론 조인', async () => {
    const buffer = await exportMultiSurveyDataToExcel(sampleData);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('전체 응답')!;

    // row 1 헤더
    expect(ws.getRow(1).getCell(1).value).toBe('응답자');
    expect(ws.getRow(1).getCell(2).value).toBe('제출 시각');
    expect(String(ws.getRow(1).getCell(3).value)).toContain('Q1');

    // row 2 = 응답 1, q2 (4번째 열)는 'a;c' → '사례; 자료'
    expect(ws.getRow(2).getCell(1).value).toBe('응답 1');
    expect(ws.getRow(2).getCell(4).value).toBe('사례; 자료');

    // row 3 = 응답 2, q4 (6번째 열)는 숫자 4 (raw 보존)
    expect(ws.getRow(3).getCell(6).value).toBe(4);

    // row 4 = 응답 3, q2 빈 배열 → 빈 문자열
    expect(ws.getRow(4).getCell(4).value).toBe('');

    // 총 응답자 3명 → 데이터 행도 3개
    expect(ws.rowCount).toBe(4); // 헤더 1 + 응답 3
  });

  it('Sheet 3 워드 빈도 — 빈도순 내림차순 정렬', async () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [mkQuestion({ id: 'q', type: 'text' })],
      submissions: [
        { id: 's1', answers: [{ questionId: 'q', value: '학생 공감 학생' }], submittedAt: 0 },
        { id: 's2', answers: [{ questionId: 'q', value: '학생' }], submittedAt: 0 },
      ],
    };
    const buffer = await exportMultiSurveyDataToExcel(data);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('워드 빈도')!;

    // 헤더
    expect(ws.getRow(1).getCell(1).value).toBe('단어');
    expect(ws.getRow(1).getCell(2).value).toBe('빈도');

    // 1위 = 학생 (3회)
    expect(ws.getRow(2).getCell(1).value).toBe('학생');
    expect(ws.getRow(2).getCell(2).value).toBe(3);

    // 2위 = 공감 (1회)
    expect(ws.getRow(3).getCell(1).value).toBe('공감');
    expect(ws.getRow(3).getCell(2).value).toBe(1);
  });

  it('빈 submissions — 시트는 생성되지만 데이터 행 없음', async () => {
    const emptyData: MultiSurveyResultData = { ...sampleData, submissions: [] };
    const buffer = await exportMultiSurveyDataToExcel(emptyData);
    const wb = await parseWorkbook(buffer);
    // 요약은 유지, 전체 응답은 헤더만, 워드 빈도는 생성 안 됨
    expect(wb.getWorksheet('요약')).toBeDefined();
    expect(wb.getWorksheet('전체 응답')!.rowCount).toBe(1); // 헤더만
    expect(wb.getWorksheet('워드 빈도')).toBeUndefined();
  });
});

describe('exportToolResultToExcel', () => {
  const mkResult = <T extends ToolResult['data']>(data: T): ToolResult => ({
    id: 'r1',
    name: 'test',
    toolType: data.type,
    data,
    savedAt: '2026-04-19T10:00:00Z',
  });

  it('multi-survey → 3시트 (집계 + 응답 + 워드빈도)', async () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [mkQuestion({ id: 'q', type: 'text' })],
      submissions: [{ id: 's1', answers: [{ questionId: 'q', value: '의견 나눔' }], submittedAt: 0 }],
    };
    const buffer = await exportToolResultToExcel(mkResult(data));
    const wb = await parseWorkbook(buffer);
    expect(wb.worksheets.map((w) => w.name)).toContain('요약');
    expect(wb.worksheets.map((w) => w.name)).toContain('전체 응답');
  });

  it('poll → 투표 결과 시트 + 옵션별 투표수/비율', async () => {
    const data: PollResultData = {
      type: 'poll',
      question: '어떤 색이 좋나요?',
      options: [
        { text: '빨강', votes: 3, color: '#ff0000' },
        { text: '파랑', votes: 7, color: '#0000ff' },
      ],
      totalVotes: 10,
    };
    const buffer = await exportToolResultToExcel(mkResult(data));
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('투표 결과')!;
    expect(ws).toBeDefined();

    // 헤더
    expect(ws.getRow(1).getCell(1).value).toBe('옵션');
    // row 2 = 질문(머지)
    // row 3 = 빨강 3표 30%
    expect(ws.getRow(3).getCell(1).value).toBe('빨강');
    expect(ws.getRow(3).getCell(2).value).toBe(3);
    expect(ws.getRow(3).getCell(3).value).toBe('30%');
    // row 4 = 파랑 7표 70%
    expect(ws.getRow(4).getCell(3).value).toBe('70%');
    // 총 투표수
    expect(ws.getRow(5).getCell(1).value).toBe('총 투표수');
    expect(ws.getRow(5).getCell(2).value).toBe(10);
  });

  it('survey → 설문 응답 시트 + 응답자 라벨', async () => {
    const data: SurveyResultData = {
      type: 'survey',
      question: '자유 의견',
      responses: [
        { text: '좋았어요', submittedAt: new Date('2026-04-19T09:00').getTime() },
        { text: '흥미로웠어요', submittedAt: new Date('2026-04-19T09:05').getTime() },
      ],
    };
    const buffer = await exportToolResultToExcel(mkResult(data));
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('설문 응답')!;
    expect(ws.getRow(3).getCell(1).value).toBe('응답 1');
    expect(ws.getRow(3).getCell(3).value).toBe('좋았어요');
    expect(ws.getRow(4).getCell(1).value).toBe('응답 2');
  });

  it('wordcloud → 워드 클라우드 시트 + 빈도 내림차순', async () => {
    const data: WordCloudResultData = {
      type: 'wordcloud',
      question: '한 단어로?',
      words: [
        { word: '성장', count: 5 },
        { word: '공감', count: 8 },
        { word: '도전', count: 2 },
      ],
      totalSubmissions: 15,
    };
    const buffer = await exportToolResultToExcel(mkResult(data));
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('워드 클라우드')!;

    // row 3 = 공감 8 (가장 많음)
    expect(ws.getRow(3).getCell(1).value).toBe('공감');
    expect(ws.getRow(3).getCell(2).value).toBe(8);
    expect(ws.getRow(4).getCell(1).value).toBe('성장');
    expect(ws.getRow(5).getCell(1).value).toBe('도전');
  });

  it('지원하지 않는 타입 → 에러', async () => {
    const data = {
      type: 'valueline-discussion' as const,
      topics: [],
      rounds: [],
    };
    await expect(exportToolResultToExcel(mkResult(data))).rejects.toThrow(
      /지원하지 않습니다/,
    );
  });
});
