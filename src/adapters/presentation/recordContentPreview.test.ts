/**
 * recordContentPreview 단위 테스트 (계획 UT-A3: 100/101자 경계 + 토글)
 */
import { describe, it, expect } from 'vitest';
import { previewContent, DEFAULT_CONTENT_PREVIEW_LIMIT } from './recordContentPreview';

const LIMIT = DEFAULT_CONTENT_PREVIEW_LIMIT; // 100

describe('previewContent', () => {
  it('빈 내용: 토글 없음, 전문(빈문자열) 그대로', () => {
    expect(previewContent('', false)).toEqual({ text: '', showToggle: false });
  });

  it('정확히 100자: 토글 없음, 전문 노출(자르지 않음)', () => {
    const content = 'a'.repeat(LIMIT);
    const r = previewContent(content, false);
    expect(r.showToggle).toBe(false);
    expect(r.text).toBe(content);
    expect(r.text).toHaveLength(100);
  });

  it('101자(경계 초과): 접힘 상태면 100자+… 표시 + 토글 노출', () => {
    const content = 'a'.repeat(LIMIT + 1);
    const r = previewContent(content, false);
    expect(r.showToggle).toBe(true);
    expect(r.text).toBe('a'.repeat(LIMIT) + '…');
    expect(r.text).toHaveLength(101); // 100자 + '…'
  });

  it('101자: 펼친 상태면 전문 표시(토글은 여전히 노출)', () => {
    const content = 'a'.repeat(LIMIT + 1);
    const r = previewContent(content, true);
    expect(r.showToggle).toBe(true);
    expect(r.text).toBe(content);
    expect(r.text).toHaveLength(101);
  });

  it('짧은 내용(99자): 토글 없음, 전문', () => {
    const content = 'b'.repeat(LIMIT - 1);
    const r = previewContent(content, false);
    expect(r.showToggle).toBe(false);
    expect(r.text).toBe(content);
  });

  it('limit 커스텀: 10자 기준 11자는 토글+자름', () => {
    const r = previewContent('가나다라마바사아자차카', false, 10); // 11자
    expect(r.showToggle).toBe(true);
    expect(r.text).toBe('가나다라마바사아자차' + '…');
  });

  it('펼침 여부는 showToggle 판정에 영향 없음(내용 길이만으로 결정)', () => {
    const short = 'x'.repeat(LIMIT);
    expect(previewContent(short, true).showToggle).toBe(false);
    expect(previewContent(short, false).showToggle).toBe(false);
  });
});
