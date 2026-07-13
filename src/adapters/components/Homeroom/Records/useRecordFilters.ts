import { useState, useMemo, useCallback, useRef } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { requiresDocument } from '@domain/rules/attendanceDocumentPolicy';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import {
  filterByStudent,
  filterByCategory,
  filterBySubcategory,
  filterByDateRange,
  filterByKeyword,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';
import { getWeekRange, getMonthRange } from './recordUtils';

/**
 * 조회 화면 필터 상태 훅.
 *
 * 키워드(300ms 디바운스)·학생·카테고리/서브카테고리·상담방법·검토 토글 3종·
 * 기간 프리셋(스토어 periodFilter)·직접 지정 범위와 그 파생값(filtered/hasFilters/
 * resetFilters)을 캡슐화한다. SearchMode 본체는 이 훅의 결과를 레이아웃에 배치만 한다.
 * 필터 적용 순서·시맨틱은 추출 전 SearchMode 인라인 구현과 동일하다.
 */
export function useRecordFilters(
  records: readonly StudentRecord[],
  categories: readonly RecordCategoryItem[],
) {
  const periodFilter = useStudentRecordsStore((s) => s.periodFilter);
  const setPeriodFilter = useStudentRecordsStore((s) => s.setPeriodFilter);
  // M4: '서류 미제출' 토글은 증빙서류 요구 정책 게이트를 거친다
  const documentPolicy = useSettingsStore((s) => s.settings.attendanceDocumentPolicy);

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [unreportedOnly, setUnreportedOnly] = useState(false);
  const [docUnsubmittedOnly, setDocUnsubmittedOnly] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // debounce keyword
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleKeywordChange = useCallback((val: string) => {
    setKeyword(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedKeyword(val), 300);
  }, []);

  // 선택된 카테고리의 서브카테고리 목록
  const subcategoryOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat) return [];
    if (cat.id === 'attendance') {
      const subs: string[] = [];
      for (const t of ATTENDANCE_TYPES) {
        for (const r of ATTENDANCE_REASONS) {
          subs.push(`${t} (${r})`);
        }
      }
      return subs;
    }
    return [...cat.subcategories];
  }, [selectedCategory, categories]);

  // 필터 적용 여부
  const hasFilters =
    selectedStudentId ||
    selectedCategory ||
    selectedSubcategory ||
    selectedMethod ||
    debouncedKeyword ||
    followUpOnly ||
    unreportedOnly ||
    docUnsubmittedOnly ||
    periodFilter !== 'all';

  /** "필터 더보기" 팝오버 안에 든 필터 중 활성 개수(트리거 배지용). */
  const advancedFilterCount =
    (selectedCategory ? 1 : 0) +
    (selectedSubcategory ? 1 : 0) +
    (selectedMethod ? 1 : 0) +
    (followUpOnly ? 1 : 0) +
    (unreportedOnly ? 1 : 0) +
    (docUnsubmittedOnly ? 1 : 0);

  const resetFilters = useCallback(() => {
    setSelectedStudentId('');
    setSelectedCategory('');
    setSelectedSubcategory('');
    setSelectedMethod('');
    setKeyword('');
    setDebouncedKeyword('');
    setFollowUpOnly(false);
    setUnreportedOnly(false);
    setDocUnsubmittedOnly(false);
    setPeriodFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  }, [setPeriodFilter]);

  /** 요약 칩 클릭 — 해당 카테고리 필터 토글. */
  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategory((prev) => (prev === categoryId ? '' : categoryId));
    setSelectedSubcategory('');
  }, []);

  const filtered = useMemo(() => {
    let result = [...records];

    if (selectedStudentId) {
      result = filterByStudent(result, selectedStudentId) as StudentRecord[];
    }
    if (selectedCategory) {
      result = filterByCategory(result, selectedCategory) as StudentRecord[];
    }
    if (selectedSubcategory) {
      result = filterBySubcategory(result, selectedSubcategory) as StudentRecord[];
    }
    if (selectedMethod) {
      result = result.filter((r) => r.method === selectedMethod);
    }
    if (debouncedKeyword) {
      result = filterByKeyword(result, debouncedKeyword) as StudentRecord[];
    }
    if (followUpOnly) {
      result = result.filter((r) => r.followUp && !r.followUpDone);
    }
    if (unreportedOnly) {
      result = result.filter((r) => r.category === 'attendance' && !r.reportedToNeis);
    }
    if (docUnsubmittedOnly) {
      // M4: 증빙서류 요구 정책 게이트 — 서류가 필요 없는 출결은 '미제출'로 세지 않는다.
      result = result.filter(
        (r) =>
          r.category === 'attendance' &&
          requiresDocument(r, documentPolicy) &&
          !r.documentSubmitted,
      );
    }
    if (periodFilter === 'week') {
      const { start, end } = getWeekRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'month') {
      const { start, end } = getMonthRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'semester') {
      const now = new Date();
      const month = now.getMonth() + 1;
      const semStart = month >= 3 && month < 9 ? 3 : 9;
      const year = semStart === 9 && month < 3 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(`${year}-${String(semStart).padStart(2, '0')}-01T00:00:00`);
      result = filterByDateRange(result, start, new Date()) as StudentRecord[];
    } else if (periodFilter === 'custom' && customStartDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    }

    return sortByDateDesc(result);
  }, [
    records,
    selectedStudentId,
    selectedCategory,
    selectedSubcategory,
    selectedMethod,
    debouncedKeyword,
    followUpOnly,
    unreportedOnly,
    docUnsubmittedOnly,
    documentPolicy,
    periodFilter,
    customStartDate,
    customEndDate,
  ]);

  return {
    // 기간 (스토어 영속)
    periodFilter,
    setPeriodFilter,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    // 상시 노출 필터
    keyword,
    handleKeywordChange,
    debouncedKeyword,
    selectedStudentId,
    setSelectedStudentId,
    // 필터 더보기(팝오버) 필터
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    selectedMethod,
    setSelectedMethod,
    followUpOnly,
    setFollowUpOnly,
    unreportedOnly,
    setUnreportedOnly,
    docUnsubmittedOnly,
    setDocUnsubmittedOnly,
    subcategoryOptions,
    // 파생값
    filtered,
    hasFilters,
    advancedFilterCount,
    resetFilters,
    toggleCategory,
  };
}

export type UseRecordFiltersReturn = ReturnType<typeof useRecordFilters>;
