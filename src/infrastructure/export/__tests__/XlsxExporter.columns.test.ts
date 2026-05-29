/**
 * XlsxExporter 칼럼 헤더 + 행 셀 deep-equal 단위 테스트.
 *
 * 기존 `XlsxExporter.test.ts:49` (`'9 칼럼 순서 확인 — 닉네임 포함 시 9칼럼'`)는
 * docstring이 9칼럼 검증을 약속했지만 본문은 `Buffer instanceof` + PK 매직 바이트만
 * assert 했다 (vacuous-by-naming). 본 테스트는 ExcelJS workbook.xlsx.load(buffer)로
 * 실제 생성된 워크북을 재로드하여 headerRow.values 를 deep-equal로 검증한다.
 *
 * 동작 = 파일 바이트, 토스트 아님 (CLAUDE.md P3).
 *
 * Plan §4 H1 / AC `xlsx-exporter-01` / Delta v3.1 OC-4 해소 / D-1·D-2 정합.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportWallBoardToXlsx } from '../XlsxExporter';
import type { RealtimeWallBoard, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

// NOTE: 인프라 테스트는 어댑터 모듈 import 금지 (eslint no-restricted-imports, P2 layer boundary).
// `'전체'` 는 어댑터 상수 DEFAULT_TAB_TITLE 의 값과 동일해야 하며, 본 테스트는 그 값이 실제로
// XlsxExporter 출력 칸에 그대로 라우팅되는지를 검증한다. 리터럴 사용 = AC verification 의도.

// ---- factories ----

function makePost(
  overrides: Partial<RealtimeWallPost> & { tabId?: string } = {},
): RealtimeWallPost & { tabId?: string } {
  return {
    id: 'p1',
    nickname: '학생A',
    text: '테스트 내용',
    status: 'approved',
    pinned: false,
    submittedAt: 1_700_000_000_000,
    kanban: { columnId: 'c1', order: 0 },
    freeform: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
    likes: 3,
    comments: [],
    color: 'yellow',
    tabId: DEFAULT_TAB_ID,
    ...overrides,
  };
}

const defaultTabs: readonly RealtimeWallTabConfig[] = [
  // title='전체' 는 어댑터 상수 DEFAULT_TAB_TITLE 의 기대값 (테스트는 동기화 책임 X — 리터럴 의도)
  { id: DEFAULT_TAB_ID, title: '전체', permission: 'all', order: 0 },
  { id: 'tab-a', title: '탭A', permission: 'all', order: 1 },
];

function makeBoard(
  overrides: Partial<RealtimeWallBoard> & { tabs?: readonly RealtimeWallTabConfig[] } = {},
): RealtimeWallBoard & { tabs?: readonly RealtimeWallTabConfig[] } {
  return {
    title: '테스트 보드',
    layoutMode: 'grid',
    columns: [],
    posts: [],
    tabs: defaultTabs,
    ...overrides,
  };
}

// exceljs `worksheet.getRow(n).values` returns a 1-indexed Array — index 0 is `null`/undefined.
// Plan §4 H1 specifies undefined at index 0; ExcelJS in practice returns either undefined or null,
// so we normalize before deep-equal.
function normalizeHeaderValues(values: unknown[]): unknown[] {
  return values.map((v) => (v === null ? undefined : v));
}

// exceljs @types/node 의 Buffer 제네릭(`Buffer<ArrayBufferLike>`)을 ExcelJS 타입
// (`Buffer` 비제네릭) 으로 좁히는 helper. 런타임 동작은 동일.
function toExcelBuffer(buf: Buffer): Parameters<ExcelJS.Xlsx['load']>[0] {
  return buf as unknown as Parameters<ExcelJS.Xlsx['load']>[0];
}

async function loadHeaderRow(buf: Buffer): Promise<unknown[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelBuffer(buf));
  const sheet = workbook.getWorksheet('보드');
  if (!sheet) throw new Error('sheet "보드" not found in loaded workbook');
  const headerRow = sheet.getRow(1);
  return normalizeHeaderValues(Array.from(headerRow.values as unknown as unknown[]));
}

async function loadFirstDataRow(buf: Buffer): Promise<Record<string, unknown>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelBuffer(buf));
  const sheet = workbook.getWorksheet('보드');
  if (!sheet) throw new Error('sheet "보드" not found in loaded workbook');
  // exceljs auto-binds column.key to cell.value when we addRow with object form.
  // Re-loading from buffer loses the keys; we read by 1-indexed column number.
  // For the includeNickname=true variant, column order is fixed (per Plan §4 H1 expected array).
  const headers = (await loadHeaderRow(buf)).slice(1) as string[]; // drop leading undefined
  const dataRow = sheet.getRow(2);
  const values = normalizeHeaderValues(Array.from(dataRow.values as unknown as unknown[])).slice(1);
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    out[h] = values[i];
  });
  return out;
}

// ---- header order tests (AC xlsx-exporter-01) ----

describe('exportWallBoardToXlsx — 헤더 칼럼 deep-equal (Plan §4 H1)', () => {
  it('includeNickname=true → 9 칼럼 헤더 순서 deep-equal', async () => {
    const board = makeBoard({ posts: [makePost()] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const headerValues = await loadHeaderRow(buf);
    // exceljs Row.values is 1-indexed; index 0 is undefined (per Architect verdict + Plan §4 H1).
    expect(headerValues).toEqual([
      undefined,
      '작성일시',
      '닉네임',
      '탭ID',
      '탭이름',
      '내용',
      '색상',
      '좋아요',
      '댓글수',
      '상태',
    ]);
  });

  it('includeNickname=false → 8 칼럼 헤더 (닉네임 제외) 순서 deep-equal', async () => {
    const board = makeBoard({ posts: [makePost()] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: false,
      currentTabOnly: false,
    });

    const headerValues = await loadHeaderRow(buf);
    expect(headerValues).toEqual([
      undefined,
      '작성일시',
      '탭ID',
      '탭이름',
      '내용',
      '색상',
      '좋아요',
      '댓글수',
      '상태',
    ]);
  });
});

// ---- legacy tabId fallback tests (Plan §4 H1 legacy case + AC D-3 정합) ----

describe('exportWallBoardToXlsx — legacy 카드(tabId 없음) DEFAULT_TAB_ID 라우팅', () => {
  it('tabId 누락 카드는 탭ID 셀이 DEFAULT_TAB_ID(`default`)로 라우팅된다', async () => {
    const legacyPost = makePost({ id: 'legacy' });
    // tabId 명시적으로 제거
    const { tabId: _removed, ...postWithoutTabId } = legacyPost;
    void _removed;
    const board = makeBoard({ posts: [postWithoutTabId as RealtimeWallPost] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const row = await loadFirstDataRow(buf);
    expect(row['탭ID']).toBe(DEFAULT_TAB_ID);
    expect(row['탭ID']).toBe('default');
  });

  it('tabs 배열에 default 탭이 있으면 탭이름 셀은 그 title("전체")로 매핑된다', async () => {
    const legacyPost = makePost({ id: 'legacy' });
    const { tabId: _removed, ...postWithoutTabId } = legacyPost;
    void _removed;
    const board = makeBoard({ posts: [postWithoutTabId as RealtimeWallPost] }); // defaultTabs 포함 (title='전체')
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const row = await loadFirstDataRow(buf);
    expect(row['탭이름']).toBe('전체');
  });

  it('tabs 배열이 비어 있으면 탭이름 셀은 tabId 자체(인프라 fallback)', async () => {
    const legacyPost = makePost({ id: 'legacy' });
    const { tabId: _removed, ...postWithoutTabId } = legacyPost;
    void _removed;
    const board = makeBoard({
      posts: [postWithoutTabId as RealtimeWallPost],
      tabs: [], // tabs 없음 → XlsxExporter:71 `tab?.title ?? tabId` fallback 발동
    });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const row = await loadFirstDataRow(buf);
    // 인프라 레이어는 UI 문자열을 import 하지 않으므로 tabId === 'default' 자체가 셀 값.
    expect(row['탭이름']).toBe('default');
    expect(row['탭이름']).not.toBe('전체');
  });
});

// ---- data row content sanity (smoke) ----

describe('exportWallBoardToXlsx — 행 셀 내용 sanity', () => {
  it('post 필드가 칼럼 키에 1:1 매핑된다 (timestamp, content, color, likes, status)', async () => {
    const post = makePost({
      id: 'p-content',
      text: '내용 sanity',
      color: 'blue',
      likes: 7,
      status: 'approved',
      submittedAt: Date.parse('2026-03-15T09:30:00Z'),
    });
    const board = makeBoard({ posts: [post] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const row = await loadFirstDataRow(buf);
    expect(row['작성일시']).toBe('2026-03-15T09:30:00.000Z');
    expect(row['닉네임']).toBe('학생A');
    expect(row['내용']).toBe('내용 sanity');
    expect(row['색상']).toBe('blue');
    expect(row['좋아요']).toBe(7);
    expect(row['상태']).toBe('approved');
    expect(row['댓글수']).toBe(0);
  });

  it('currentTabOnly=true 필터: 다른 탭 카드는 행 0개', async () => {
    const posts = [
      makePost({ id: 'p-default', tabId: DEFAULT_TAB_ID, text: 'default 카드' }),
      makePost({ id: 'p-a', tabId: 'tab-a', text: 'tab-a 카드' }),
    ];
    const board = makeBoard({ posts });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: true,
      currentTabId: 'tab-a',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(buf));
    const sheet = workbook.getWorksheet('보드');
    if (!sheet) throw new Error('sheet "보드" not found');
    // 헤더 1행 + 데이터 1행 = rowCount 2
    expect(sheet.rowCount).toBe(2);

    const row = await loadFirstDataRow(buf);
    expect(row['탭ID']).toBe('tab-a');
    expect(row['내용']).toBe('tab-a 카드');
  });

  it('빈 보드 → 헤더 1행만 존재 (rowCount=1)', async () => {
    const board = makeBoard({ posts: [] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: true,
      currentTabOnly: false,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(buf));
    const sheet = workbook.getWorksheet('보드');
    if (!sheet) throw new Error('sheet "보드" not found');
    expect(sheet.rowCount).toBe(1);

    const headerValues = await loadHeaderRow(buf);
    expect(headerValues[1]).toBe('작성일시'); // 헤더는 그대로
  });

  it('color undefined → "white" 기본값으로 행에 기록', async () => {
    const post = makePost({ color: undefined });
    const board = makeBoard({ posts: [post] });
    const buf = await exportWallBoardToXlsx(board, {
      includeNickname: false,
      currentTabOnly: false,
    });

    const row = await loadFirstDataRow(buf);
    expect(row['색상']).toBe('white');
  });
});
