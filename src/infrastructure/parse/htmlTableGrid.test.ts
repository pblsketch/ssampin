import { describe, it, expect } from 'vitest';
import { decodeSheetBytes, looksLikeHtmlTable, parseHtmlTableToGrid } from './htmlTableGrid';

function toBuffer(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}

describe('looksLikeHtmlTable', () => {
  it('<table>가 있으면 true', () => {
    expect(looksLikeHtmlTable('<html><body><table><tr></tr></table>')).toBe(true);
    expect(looksLikeHtmlTable('<TABLE border=1>')).toBe(true);
  });
  it('표가 없으면 false', () => {
    expect(looksLikeHtmlTable('그냥 텍스트')).toBe(false);
    expect(looksLikeHtmlTable('PK...binary...')).toBe(false);
  });
});

describe('parseHtmlTableToGrid', () => {
  it('colspan/rowspan을 모든 칸에 복제한다(엑셀 병합 셀과 동일)', () => {
    const html = `
      <table>
        <tr><td colspan="4">국어</td></tr>
        <tr><td rowspan=2>번호</td><td>원점수</td><td>성취도</td><td>석차등급</td></tr>
        <tr><td>95</td><td>A</td><td>1</td></tr>
      </table>`;
    const grid = parseHtmlTableToGrid(html);
    expect(grid[0]).toEqual(['국어', '국어', '국어', '국어']);
    expect(grid[1]).toEqual(['번호', '원점수', '성취도', '석차등급']);
    // rowspan으로 '번호'가 다음 행 0번 칸에 내려옴
    expect(grid[2]).toEqual(['번호', '95', 'A', '1']);
  });

  it('태그/엔티티/공백을 정리한다', () => {
    const html =
      '<table><tr><td><b>김&amp;철수</b></td><td>9&#48;/8&nbsp;0</td><td><font>A</font></td></tr></table>';
    const grid = parseHtmlTableToGrid(html);
    expect(grid[0]).toEqual(['김&철수', '90/8 0', 'A']);
  });

  it('데이터가 가장 풍부한 표를 고른다(외곽 레이아웃 표 무시)', () => {
    const html = `
      <table><tr><td>머리말</td></tr></table>
      <table>
        <tr><td>번호</td><td>성명</td></tr>
        <tr><td>1</td><td>홍길동</td></tr>
        <tr><td>2</td><td>김영희</td></tr>
      </table>`;
    const grid = parseHtmlTableToGrid(html);
    expect(grid.length).toBe(3);
    expect(grid[0]).toEqual(['번호', '성명']);
  });
});

describe('decodeSheetBytes', () => {
  it('UTF-8 문서를 그대로 디코딩한다', () => {
    const text = decodeSheetBytes(toBuffer('<table><tr><td>성명</td></tr></table>'));
    expect(text).toContain('성명');
  });

  it('charset=euc-kr 라벨이어도 throw 없이 디코딩한다(ASCII 보존)', () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr"></head><body><table><tr><td>NO</td></tr></table></body></html>';
    const text = decodeSheetBytes(toBuffer(html));
    expect(text).toContain('<td>NO</td>');
  });
});
