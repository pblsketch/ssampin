import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Phase D (record-viewing-unification) — 수업 조회 특기(관찰) 인라인 편집 가드.
 * 데이터 안전 핵심: 부분 뷰모델이 아니라 store 원본을 조회해 spread(원본 필드 보존).
 */
const searchSource = () =>
  readFileSync('src/adapters/components/ClassManagement/ClassRecordSearchView.tsx', 'utf8');

describe('class record phase 6 — 특기 인라인 편집 (D1)', () => {
  it('인라인 편집 상태와 관찰 저장 경로가 배선되어 있다', () => {
    const source = searchSource();
    expect(source).toContain('editingObsId');
    expect(source).toContain('editObsContent');
    // 관찰 저장은 useObservationStore.updateRecord 경유
    expect(source).toContain('updateObservation');
    expect(source).toContain('s.updateRecord');
  });

  it('저장 시 store 원본을 조회해 spread 하고 500자 상한을 지킨다 (원본 필드 보존)', () => {
    const source = searchSource();
    // 부분 뷰모델이 아니라 원본 ObservationRecord 를 id 로 조회 후 spread
    expect(source).toContain('useObservationStore.getState().records.find');
    expect(source).toMatch(/\.\.\.orig/);
    expect(source).toContain('slice(0, 500)');
  });

  it('필터 초기화가 편집 상태도 함께 초기화한다 (원자성)', () => {
    const source = searchSource();
    const resetBody = source.slice(
      source.indexOf('const handleResetFilters'),
      source.indexOf('const handleResetFilters') + 600,
    );
    expect(resetBody).toContain('setEditingObsId(null)');
    expect(resetBody).toContain("setEditObsContent('')");
  });

  it('회귀 가드 — MixedRecord 유니온·filtered 의존성·sub-12px 금지가 보존된다', () => {
    const source = searchSource();
    // 유니온 3문자열 (phase4 핀과 동일 — 편집 추가로 깨지면 안 됨)
    expect(source).toContain('interface AttendanceMixedRecord');
    expect(source).toContain('interface ObservationMixedRecord');
    expect(source).toContain('type MixedRecord = AttendanceMixedRecord | ObservationMixedRecord');
    // baseline filtered useMemo 의존성 배열 문자열
    expect(source).toContain(
      '[mixedRecords, studentFilter, tagFilter, debouncedKeyword, dateRange.start, dateRange.end]',
    );
    // sub-12px 금지(접근성)
    expect(source).not.toContain('text-[9px]');
    expect(source).not.toContain('text-[8px]');
    expect(source).not.toContain('text-caption');
  });

  it('편집 액션은 키보드 포커스에서도 보인다 (group-focus-within)', () => {
    expect(searchSource()).toContain('group-focus-within:opacity-100');
  });
});
