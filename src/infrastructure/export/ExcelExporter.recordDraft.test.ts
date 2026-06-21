/**
 * 생활기록부 초안 엑셀 내보내기 (RD-4) — 라운드트립 검증.
 * 생성한 버퍼를 ExcelJS로 다시 읽어 셀 값·스타일을 확인한다.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { RecordDraft } from '@domain/entities/RecordDraft';
import { RECORD_AREA_LABELS } from '@domain/entities/RecordDraft';
import { exportRecordDraftsToExcel } from './ExcelExporter';
import type { RecordDraftStudentRef } from './ExcelExporter';

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

// ── 픽스처 ──

const STUDENTS: RecordDraftStudentRef[] = [
  { number: 1, name: '홍길동', studentRef: 'student-001' },
  { number: 2, name: '성춘향', studentRef: 'student-002' },
  { number: 3, name: '이몽룡', studentRef: 'student-003' },
];

function makeDraft(
  overrides: Partial<RecordDraft> & Pick<RecordDraft, 'area' | 'studentRef' | 'content'>,
): RecordDraft {
  return {
    id: `draft-${Math.random()}`,
    requiresTeacherReview: true,
    status: 'draft',
    byteLength: overrides.content.length,
    basisObservationIds: [],
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    ...overrides,
  };
}

const SHORT_CONTENT = '성실한 자세로 학교 생활에 임함.'; // 짧은 내용 (한도 미초과)
const LONG_CONTENT = '가'.repeat(502); // 한글 502자 = 1506B → 고등 자율(1500B) 초과

const DRAFTS: RecordDraft[] = [
  makeDraft({
    area: 'autonomy',
    studentRef: 'student-001',
    content: SHORT_CONTENT,
    status: 'confirmed',
    byteLength: 90,
  }),
  makeDraft({
    area: 'career',
    studentRef: 'student-001',
    content: '진로 탐색 활동에 적극 참여함.',
    status: 'reviewing',
    byteLength: 75,
  }),
  makeDraft({
    area: 'autonomy',
    studentRef: 'student-002',
    content: '리더십을 발휘하여 학급 자치회 활동을 이끌었음.',
    status: 'confirmed',
    byteLength: 120,
  }),
  // student-003 초안 없음 → 빈칸
];

const OVER_LIMIT_DRAFTS: RecordDraft[] = [
  makeDraft({
    area: 'autonomy',
    studentRef: 'student-001',
    content: LONG_CONTENT,
    byteLength: 1506,
  }),
];

const AREAS = ['autonomy', 'career'] as const;

describe('exportRecordDraftsToExcel', () => {
  it('비어있지 않은 ArrayBuffer를 반환한다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('시트 이름이 "생활기록부 초안"이다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안');
    expect(ws).toBeDefined();
  });

  it('헤더 행: 번호/이름 + 영역 한국어 라벨', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    const header = ws.getRow(1).values as Array<unknown>;
    expect(header[1]).toBe('번호/이름');
    expect(header[2]).toBe(RECORD_AREA_LABELS['autonomy']);
    expect(header[3]).toBe(RECORD_AREA_LABELS['career']);
  });

  it('학생 행 수가 students 배열 길이와 일치한다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    // 1행 = 헤더, 나머지 = 학생
    expect(ws.rowCount).toBe(STUDENTS.length + 1);
  });

  it('번호/이름 열: "01번 홍길동" 형식', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    expect(ws.getRow(2).getCell(1).value).toBe('01번 홍길동');
    expect(ws.getRow(3).getCell(1).value).toBe('02번 성춘향');
  });

  it('초안이 있는 셀: content 값이 들어있다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    // student-001 autonomy
    expect(ws.getRow(2).getCell(2).value).toBe(SHORT_CONTENT);
    // student-002 autonomy
    expect(ws.getRow(3).getCell(2).value).toBe('리더십을 발휘하여 학급 자치회 활동을 이끌었음.');
  });

  it('초안이 없는 셀은 빈 문자열', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    // student-003 — 모든 영역 초안 없음
    const val2 = ws.getRow(4).getCell(2).value;
    const val3 = ws.getRow(4).getCell(3).value;
    expect(val2 ?? '').toBe('');
    expect(val3 ?? '').toBe('');
  });

  it('confirmedOnly=true: status!==confirmed 초안은 제외된다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS], {
      confirmedOnly: true,
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    // student-001 career는 reviewing이라 비어야 함
    const careerCell = ws.getRow(2).getCell(3).value;
    expect(careerCell ?? '').toBe('');
    // student-001 autonomy는 confirmed이라 있어야 함
    expect(ws.getRow(2).getCell(2).value).toBe(SHORT_CONTENT);
  });

  it('includeMeta=true: 셀 내용에 바이트/상태 메타가 포함된다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, [...AREAS], {
      includeMeta: true,
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    const cellVal = String(ws.getRow(2).getCell(2).value ?? '');
    expect(cellVal).toContain(SHORT_CONTENT);
    expect(cellVal).toMatch(/\d+\/\d+B/);
  });

  it('한도 초과 셀: 경고 배경 색상(fill)이 적용된다', async () => {
    const buffer = await exportRecordDraftsToExcel(OVER_LIMIT_DRAFTS, STUDENTS, ['autonomy'], {
      level: 'high',
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    // student-001 autonomy — 1506B > 1500B 한도
    const cell = ws.getRow(2).getCell(2);
    const fill = cell.fill as ExcelJS.FillPattern | undefined;
    // 경고 fill이 적용돼야 한다 (fgColor 확인)
    expect(fill?.type).toBe('pattern');
    expect((fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBe('FFFFF0F0');
  });

  it('한도 미초과 셀: 경고 배경이 없다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, ['autonomy'], {
      level: 'high',
    });
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    const cell = ws.getRow(2).getCell(2); // 90B < 1500B
    const fill = cell.fill as ExcelJS.FillPattern | undefined;
    const argb = (fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? '';
    expect(argb).not.toBe('FFFFF0F0');
  });

  it('areas가 빈 배열이면 헤더 열이 번호/이름 하나뿐', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, STUDENTS, []);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    const header = ws.getRow(1).values as Array<unknown>;
    // index 0은 ExcelJS에서 undefined
    expect(header.filter(Boolean)).toEqual(['번호/이름']);
  });

  it('students가 빈 배열이면 헤더 행 1줄만 생성된다', async () => {
    const buffer = await exportRecordDraftsToExcel(DRAFTS, [], [...AREAS]);
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('생활기록부 초안')!;
    expect(ws.rowCount).toBe(1);
  });
});
