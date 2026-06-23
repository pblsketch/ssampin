import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const inputSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordInputView.tsx', 'utf8');
const searchSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordSearchView.tsx', 'utf8');
const statsSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordStatsView.tsx', 'utf8');
const gridSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordStudentGrid.tsx', 'utf8');
const tabSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordTab.tsx', 'utf8');
const emptyStateSource = () =>
  readFileSync('src/adapters/components/common/records/RecordEmptyState.tsx', 'utf8');

describe('class record phase 3 ux safeguards', () => {
  it('keeps stale selected student cleanup and roster next action while defaulting unmarked students to present', () => {
    const source = inputSource();
    expect(source).not.toContain('전체 출석으로 채우기');
    expect(source).toContain('체크하지 않은 학생은 출석으로 저장됩니다');
    expect(source).toContain("status: 'present'");
    expect(source).toContain('setSelectedStudentKey(null)');
    expect(source).toContain('명렬 관리로 가기');
  });

  it('adds seating empty-state next action wired through the record tab', () => {
    expect(gridSource()).toContain('좌석배치 만들러 가기');
    expect(gridSource()).toContain('onCreateSeating');
    expect(inputSource()).toContain('onGoToSeatingTab');
    expect(tabSource()).toContain('onGoToSeatingTab');
  });

  it('adds search semester season default and empty-result reset action', () => {
    const source = searchSource();
    expect(source).toContain('getInitialPeriodFilter');
    expect(source).toContain('month === 7 || month === 12');
    expect(source).toContain('handleResetFilters');
    // 빈결과 초기화 동작은 공용 RecordEmptyState 부품으로 추출됨(Phase B) — 배선으로 검증
    expect(source).toContain('RecordEmptyState');
    expect(source).toContain('onReset={handleResetFilters}');
    // 실제 [필터 초기화] 텍스트는 부품에 존재
    expect(emptyStateSource()).toContain('필터 초기화');
  });

  it('adds stats skeleton placeholders for loading/empty class transitions', () => {
    const source = statsSource();
    expect(source).toContain('skeletonRows');
    expect(source).toContain('animate-pulse');
    expect(source).toContain('통계를 불러오는 중입니다');
  });
});
