import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const inputSource = () => read('src/adapters/components/ClassManagement/ClassRecordInputView.tsx');
const tabSource = () => read('src/adapters/components/ClassManagement/ClassRecordTab.tsx');
const pageSource = () => read('src/adapters/components/ClassManagement/ClassManagementPage.tsx');
const gridSource = () => read('src/adapters/components/ClassManagement/ClassRecordStudentGrid.tsx');
const searchSource = () =>
  read('src/adapters/components/ClassManagement/ClassRecordSearchView.tsx');
const cardSource = () => read('src/adapters/components/ClassManagement/ObservationCard.tsx');
const formSource = () => read('src/adapters/components/ClassManagement/ObservationForm.tsx');

describe('class record phase 4 a11y and refactor safeguards', () => {
  it('adds tab semantics and selected/pressed states for keyboard and screen readers', () => {
    expect(tabSource()).toContain('role="tablist"');
    expect(tabSource()).toContain('role="tab"');
    expect(tabSource()).toContain('aria-selected');
    expect(pageSource()).toContain('role="tablist"');
    expect(pageSource()).toContain('role="tab"');
    expect(pageSource()).toContain('aria-selected');
    expect(inputSource()).toContain('aria-pressed');
    expect(inputSource()).toContain('focus-visible');
  });

  it('removes sub-12px class-record text and keeps status meaning non-color-only', () => {
    const sources = [inputSource(), gridSource(), searchSource(), cardSource()].join('\n');
    expect(sources).not.toContain('text-[9px]');
    expect(sources).not.toContain('text-[8px]');
    expect(sources).not.toContain('text-caption');
    expect(gridSource()).toContain('aria-label');
    expect(inputSource()).toContain('결과(수업 불참)');
  });

  it('keeps observation actions available on keyboard focus and improves microcopy', () => {
    expect(cardSource()).toContain('group-focus-within:opacity-100');
    // 계획 §4.1 로 안내 문구가 바뀌었다: 무엇을 적을지가 아니라 **무엇을 관찰했는지**를 묻는다.
    expect(formSource()).toContain('학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요');
    expect(inputSource()).toContain('기록할 학생을 왼쪽 리스트에서 선택해 주세요');
  });

  it('uses a discriminated union for mixed search records', () => {
    const source = searchSource();
    expect(source).toContain('interface AttendanceMixedRecord');
    expect(source).toContain('interface ObservationMixedRecord');
    expect(source).toContain('type MixedRecord = AttendanceMixedRecord | ObservationMixedRecord');
  });
});
