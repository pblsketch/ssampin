/**
 * EvidenceExcel — 업로드 파싱 회귀 가드.
 *
 * 핵심: 기존엔 parseEvidenceFromExcel 의 exceljs `xlsx.load` 경로에 라운드트립
 * 테스트가 없어, '붙여넣기 때 섞인 제어문자' 같은 실파일이 통째로 실패해도 잡지 못했다.
 * (사용자 신고: 양식 다운로드→붙여넣기→업로드 시 "엑셀을 읽는 중 오류".)
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {
  exportEvidenceTemplateToExcel,
  parseEvidenceFromExcel,
  ExcelReadError,
} from './EvidenceExcel';

const STUDENTS = [
  { studentRef: 's1', number: 1, name: '김민지' },
  { studentRef: 's2', number: 2, name: '이서연' },
];

/** 양식을 만들고 '관찰 내용'(E열)에 값을 채운 업로드 파일 버퍼를 만든다. */
async function makeFilledBuffer(contents: Record<number, string>): Promise<ArrayBuffer> {
  const tpl = await exportEvidenceTemplateToExcel(STUDENTS, '2학년 1반');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl);
  const ws = wb.worksheets[0]!;
  for (const [row, text] of Object.entries(contents)) {
    ws.getRow(Number(row)).getCell(5).value = text;
  }
  const out = await wb.xlsx.writeBuffer();
  return out as ArrayBuffer;
}

/** 버퍼의 모든 .xml 파트에서 anchor 텍스트 바로 앞에 raw 제어문자를 주입한다. */
async function injectRawControlChar(buffer: ArrayBuffer, anchor: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.xml')) continue;
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async('string');
    if (xml.includes(anchor)) {
      zip.file(name, xml.replace(anchor, `${String.fromCharCode(0x0b)}${anchor}`));
    }
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('parseEvidenceFromExcel', () => {
  it('정상 업로드 파일을 라운드트립으로 파싱한다(식별키·내용 보존)', async () => {
    const buf = await makeFilledBuffer({ 2: '모둠 토론 적극 참여', 3: '발표 우수' });
    const rows = await parseEvidenceFromExcel(buf);
    expect(rows.map((r) => r.content)).toEqual(['모둠 토론 적극 참여', '발표 우수']);
    expect(rows[0]!.studentRef).toBe('s1');
    expect(rows[1]!.studentRef).toBe('s2');
  });

  it('셀에 섞인 XML 불법 제어문자(붙여넣기 유래)를 제거하고 그래도 파싱한다', async () => {
    const clean = await makeFilledBuffer({ 2: '모둠 토론 적극 참여' });
    const dirty = await injectRawControlChar(clean, '모둠');
    // 살균 없이는 exceljs 가 "disallowed character"로 거부함을 먼저 확인.
    await expect(new ExcelJS.Workbook().xlsx.load(dirty)).rejects.toThrow();
    // 우리 파서는 살균 후 성공해야 한다.
    const rows = await parseEvidenceFromExcel(dirty);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toContain('모둠 토론 적극 참여');
    // 제어문자는 제거되어 남지 않는다.
    expect(rows[0]!.content).not.toContain(String.fromCharCode(0x0b));
  });

  it('xlsx(zip)가 아닌 파일은 ExcelReadError(not-xlsx)로 분류한다', async () => {
    const notXlsx = new TextEncoder().encode('식별키,번호,성명\n,1,김민지\n').buffer;
    await expect(parseEvidenceFromExcel(notXlsx)).rejects.toBeInstanceOf(ExcelReadError);
    await expect(parseEvidenceFromExcel(notXlsx)).rejects.toMatchObject({ kind: 'not-xlsx' });
  });
});
