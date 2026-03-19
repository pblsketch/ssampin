import { RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord, CounselingMethod } from '@domain/entities/StudentRecord';

/* ──────────────────────── 공유 타입 ──────────────────────── */

export interface ModeProps {
  students: readonly Student[];
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
}

export interface RecordEditProps {
  editingId: string | null;
  editContent: string;
  setEditContent: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editSubcategory: string;
  setEditSubcategory: (v: string) => void;
  onEditSave: (record: StudentRecord) => Promise<void>;
  onEditCancel: () => void;
}

/* ──────────────────────── 날짜 유틸 ──────────────────────── */

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function getMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

export function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatTimeKR(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/* ──────────────────────── 색상 헬퍼 ──────────────────────── */

export const GRAY_COLOR = RECORD_COLOR_MAP['gray']!;

export function getSubcategoryChipClass(color: string, isSelected: boolean): string {
  const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
  const c = RECORD_COLOR_MAP[color] ?? GRAY_COLOR;
  return `${base} ${isSelected ? c.activeBg : c.inactiveBg}`;
}

export function getCategoryLabelColor(color: string): string {
  return RECORD_COLOR_MAP[color]?.text ?? GRAY_COLOR.text;
}

export function getRecordTagClass(categoryId: string, categories: readonly RecordCategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  const c = RECORD_COLOR_MAP[cat?.color ?? 'gray'] ?? GRAY_COLOR;
  return `px-2 py-0.5 rounded text-xs font-medium ${c.tagBg}`;
}

export function getCategoryDotColor(categoryId: string, categories: readonly RecordCategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  const colorMap: Record<string, string> = {
    red: 'bg-red-400',
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
    indigo: 'bg-indigo-400',
    teal: 'bg-teal-400',
    gray: 'bg-gray-400',
  };
  return colorMap[cat?.color ?? 'gray'] ?? 'bg-gray-400';
}

/* ──────────────────────── 출결 유형별 태그 색상 ──────────────────────── */

const ATTENDANCE_TAG_COLORS: Record<string, string> = {
  '결석': 'bg-red-500/15 text-red-400',
  '지각': 'bg-yellow-500/15 text-yellow-400',
  '조퇴': 'bg-orange-500/15 text-orange-400',
  '결과': 'bg-purple-500/15 text-purple-400',
};

export function getAttendanceTypeFromSubcategory(subcategory: string): string | null {
  const match = subcategory.match(/^(결석|지각|조퇴|결과)/);
  return match ? match[1]! : null;
}

/** 출결 레코드면 유형별 색상, 아니면 기존 카테고리 색상 */
export function getSmartTagClass(record: { category: string; subcategory: string }, categories: readonly RecordCategoryItem[]): string {
  if (record.category === 'attendance') {
    const attType = getAttendanceTypeFromSubcategory(record.subcategory);
    if (attType && ATTENDANCE_TAG_COLORS[attType]) {
      return `px-2 py-0.5 rounded text-xs font-medium ${ATTENDANCE_TAG_COLORS[attType]}`;
    }
  }
  return getRecordTagClass(record.category, categories);
}

/** 출결 유형 정렬 우선순위 */
export const ATTENDANCE_SORT_ORDER: Record<string, number> = {
  '결석': 0,
  '지각': 1,
  '조퇴': 2,
  '결과': 3,
};

export type RecordSortMode = 'time' | 'type' | 'studentNumber';

export const RECORD_SORT_OPTIONS: { mode: RecordSortMode; label: string; icon: string }[] = [
  { mode: 'time', label: '입력 시간', icon: 'schedule' },
  { mode: 'type', label: '유형별', icon: 'filter_list' },
  { mode: 'studentNumber', label: '학번순', icon: 'format_list_numbered' },
];

/* ──────────────────────── 상담 방법 ──────────────────────── */

export const METHOD_OPTIONS: { value: CounselingMethod; icon: string; label: string }[] = [
  { value: 'phone', icon: '\uD83D\uDCDE', label: '전화' },
  { value: 'face', icon: '\uD83E\uDD1D', label: '대면' },
  { value: 'online', icon: '\uD83D\uDCBB', label: '온라인' },
  { value: 'visit', icon: '\uD83C\uDFE0', label: '가정방문' },
  { value: 'text', icon: '\uD83D\uDCAC', label: '문자' },
  { value: 'other', icon: '\uD83D\uDCDD', label: '기타' },
];

export function getMethodIcon(method: CounselingMethod | undefined): string {
  if (!method) return '';
  const found = METHOD_OPTIONS.find((m) => m.value === method);
  return found?.icon ?? '';
}

export const COUNSELING_METHODS: { value: CounselingMethod; label: string }[] = [
  { value: 'phone', label: '전화' },
  { value: 'face', label: '대면' },
  { value: 'online', label: '온라인' },
  { value: 'visit', label: '가정방문' },
  { value: 'text', label: '문자' },
  { value: 'other', label: '기타' },
];
