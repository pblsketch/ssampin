import { describe, it, expect } from 'vitest';
import { mergeCategories, mergeStudentRecords } from '../SyncFromCloud';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { StudentRecordsData } from '@domain/entities/StudentRecord';

const CUSTOM: RecordCategoryItem = {
  id: 'custom-특기',
  name: '특기 활동',
  color: 'purple',
  subcategories: ['체육', '음악'],
};

describe('mergeCategories — 카테고리 항목(id) 합집합 병합', () => {
  it('기본 카테고리만 든 리모트가 로컬 커스텀 카테고리를 소거하지 않는다 (2026-07-13 유실 시나리오)', () => {
    const local = [...DEFAULT_RECORD_CATEGORIES, CUSTOM];
    const remote = [...DEFAULT_RECORD_CATEGORIES];
    const merged = mergeCategories(local, remote);
    expect(merged!.map((c) => c.id)).toContain('custom-특기');
    expect(merged).toHaveLength(DEFAULT_RECORD_CATEGORIES.length + 1);
  });

  it('리모트 빈 배열은 로컬을 덮지 않는다 (구 "remote.categories ?? local" 버그 재현 방지)', () => {
    const local = [CUSTOM];
    const merged = mergeCategories(local, []);
    expect(merged).toEqual(local);
  });

  it('한쪽에만 있으면 있는 쪽을 그대로 쓰고, 양쪽 다 없으면 undefined', () => {
    expect(mergeCategories(undefined, [CUSTOM])).toEqual([CUSTOM]);
    expect(mergeCategories([CUSTOM], undefined)).toEqual([CUSTOM]);
    expect(mergeCategories(undefined, undefined)).toBeUndefined();
  });

  it('같은 id는 리모트 name/color를 채택하되 subcategories는 합집합(리모트 순서 우선)', () => {
    const local: RecordCategoryItem[] = [
      { id: 'x', name: '옛 이름', color: 'red', subcategories: ['일반', '학습'] },
    ];
    const remote: RecordCategoryItem[] = [
      { id: 'x', name: '새 이름', color: 'blue', subcategories: ['일반', '진로'] },
    ];
    const merged = mergeCategories(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged![0]!.name).toBe('새 이름');
    expect(merged![0]!.color).toBe('blue');
    expect(merged![0]!.subcategories).toEqual(['일반', '진로', '학습']);
  });

  it('mergeStudentRecords 통합: 커스텀 카테고리가 병합 결과에 보존된다', () => {
    const local: StudentRecordsData = {
      records: [],
      categories: [...DEFAULT_RECORD_CATEGORIES, CUSTOM],
    };
    const remote: StudentRecordsData = {
      records: [],
      categories: [...DEFAULT_RECORD_CATEGORIES],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.categories!.map((c) => c.id)).toContain('custom-특기');
  });

  it('mergeStudentRecords 통합: 양쪽 다 categories가 없으면 필드가 생성되지 않는다', () => {
    const merged = mergeStudentRecords({ records: [] }, { records: [] });
    expect('categories' in merged).toBe(false);
  });
});
