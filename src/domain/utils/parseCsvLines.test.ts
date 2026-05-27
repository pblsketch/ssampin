import { describe, expect, it } from 'vitest';
import { parseCsvLines } from './parseCsvLines';

describe('parseCsvLines', () => {
  it('splits a simple CSV into headers and rows', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    const result = parseCsvLines(csv);
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('skips leading empty rows so the header always starts at first non-empty line', () => {
    const csv = '\n\n이름,서명\n홍길동,\n';
    const result = parseCsvLines(csv);
    expect(result.headers).toEqual(['이름', '서명']);
    expect(result.rows).toEqual([['홍길동', '']]);
  });

  it('preserves quoted commas and escaped quotes', () => {
    const csv = 'name,note\n"홍, 길동","그가 ""왔""다"\n';
    const result = parseCsvLines(csv);
    expect(result.rows[0]).toEqual(['홍, 길동', '그가 "왔"다']);
  });

  it('handles CRLF line endings (Google Sheets export default)', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n';
    const result = parseCsvLines(csv);
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('preserves newlines inside quoted fields', () => {
    const csv = 'a,b\n"line1\nline2",x\n';
    const result = parseCsvLines(csv);
    expect(result.rows[0]).toEqual(['line1\nline2', 'x']);
  });

  it('trims header whitespace', () => {
    const csv = '  이름  , 서명 \n홍길동,O\n';
    const result = parseCsvLines(csv);
    expect(result.headers).toEqual(['이름', '서명']);
  });

  it('returns empty result for empty input', () => {
    expect(parseCsvLines('')).toEqual({ headers: [], rows: [] });
    expect(parseCsvLines('\n\n\n')).toEqual({ headers: [], rows: [] });
  });
});
