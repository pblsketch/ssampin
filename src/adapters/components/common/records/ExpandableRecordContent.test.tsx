// @vitest-environment jsdom
/**
 * ExpandableRecordContent — 펼치기/접기 동작 테스트 (공용 부품화 회귀 가드)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExpandableRecordContent } from './ExpandableRecordContent';

afterEach(() => cleanup());

describe('ExpandableRecordContent', () => {
  it('100자 이하: 전문 표시, [더보기] 없음', () => {
    const content = 'a'.repeat(100);
    render(<ExpandableRecordContent content={content} />);
    expect(screen.getByText(content)).toBeTruthy();
    expect(screen.queryByText('더보기')).toBeNull();
  });

  it('100자 초과: 잘린 미리보기 + [더보기], 클릭 시 전문 + [접기]', () => {
    const content = 'b'.repeat(150);
    render(<ExpandableRecordContent content={content} />);
    // 접힘: 100자 + …
    expect(screen.getByText('b'.repeat(100) + '…')).toBeTruthy();
    const toggle = screen.getByText('더보기');
    fireEvent.click(toggle);
    // 펼침: 전문 + 접기
    expect(screen.getByText(content)).toBeTruthy();
    expect(screen.getByText('접기')).toBeTruthy();
    // 다시 접기
    fireEvent.click(screen.getByText('접기'));
    expect(screen.getByText('b'.repeat(100) + '…')).toBeTruthy();
  });
});
