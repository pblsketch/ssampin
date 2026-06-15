import { describe, it, expect } from 'vitest';
import { toHwpxFileName } from './markdownConvertExport';

describe('toHwpxFileName', () => {
  it('확장자를 .hwpx 로 교체', () => {
    expect(toHwpxFileName('보고서.pdf')).toBe('보고서.hwpx');
    expect(toHwpxFileName('명렬표.hwpx')).toBe('명렬표.hwpx');
    expect(toHwpxFileName('성적.xlsx')).toBe('성적.hwpx');
  });

  it('확장자 없으면 그대로 + .hwpx', () => {
    expect(toHwpxFileName('가정통신문')).toBe('가정통신문.hwpx');
  });

  it('빈 이름/공백/확장자만 → converted.hwpx', () => {
    expect(toHwpxFileName('')).toBe('converted.hwpx');
    expect(toHwpxFileName('   ')).toBe('converted.hwpx');
    expect(toHwpxFileName('.pdf')).toBe('converted.hwpx');
  });

  it('공백을 트림', () => {
    expect(toHwpxFileName('  안내문.docx  ')).toBe('안내문.hwpx');
  });
});
