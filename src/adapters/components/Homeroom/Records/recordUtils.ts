import { RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';
import type {
  StudentRecord,
  CounselingMethod,
  AttendancePeriodEntry,
} from '@domain/entities/StudentRecord';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import {
  enumerateRange,
  formatDateKR as formatDateKRBase,
} from '@adapters/components/common/calendarUtils';
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABEL_TO_STATUS,
} from '@adapters/presentation/attendanceStatusVariants';

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
  editReportedToNeis: boolean;
  setEditReportedToNeis: (v: boolean) => void;
  editDocumentSubmitted: boolean;
  setEditDocumentSubmitted: (v: boolean) => void;
  editFollowUp: string;
  setEditFollowUp: (v: string) => void;
  editFollowUpDate: string;
  setEditFollowUpDate: (v: string) => void;
  /** 출결 교시 편집 상태 (attendance 기록의 편집 UI에서 사용) */
  editAttendancePeriods?: readonly AttendancePeriodEntry[];
  setEditAttendancePeriods?: (next: AttendancePeriodEntry[]) => void;
  /** 정규 교시 수 (settings.maxPeriods) */
  regularPeriodCount?: number;
  onEditSave: (record: StudentRecord) => Promise<void>;
  onEditCancel: () => void;
}

/* ──────────────────────── 출결 편집 유틸 ──────────────────────── */

const SUBCATEGORY_STATUS_MAP: Record<string, AttendancePeriodEntry['status']> = {
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

/**
 * 출결 기록 편집 시작 시 교시 행 상태의 초기값을 계산한다.
 * - record.attendancePeriods 가 있으면 그대로 사용
 * - 없으면(레거시) subcategory 문자열을 파싱해 1행을 만든다 (period=1 기본값)
 */
export function initEditAttendancePeriods(record: {
  readonly subcategory: string;
  readonly attendancePeriods?: readonly AttendancePeriodEntry[];
}): AttendancePeriodEntry[] {
  if (record.attendancePeriods && record.attendancePeriods.length > 0) {
    return [...record.attendancePeriods];
  }
  // 레거시 파싱: "결석 (질병)" | "지각"
  const match = record.subcategory.match(/^(.+?)(?:\s*\((.+)\))?$/);
  const typeLabel = match?.[1]?.trim() ?? '결석';
  const reason = match?.[2]?.trim() as AttendancePeriodEntry['reason'] | undefined;
  const status = SUBCATEGORY_STATUS_MAP[typeLabel] ?? 'absent';
  return [
    {
      period: 1,
      status,
      ...(reason ? { reason } : {}),
    },
  ];
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

/**
 * 시작일~종료일 사이의 날짜 배열 생성 (로컬 기준, UTC 밀림 없음)
 *
 * 본 함수는 `calendarUtils.enumerateRange` 의 호환 alias 다.
 * 신규 코드는 `enumerateRange` 를 직접 import 하여 사용한다.
 *
 * @returns YYYY-MM-DD 문자열 배열 (시작일·종료일 포함). start > end 면 빈 배열.
 */
export function createDateRange(start: string, end: string): string[] {
  return enumerateRange(start, end);
}

function dateYear(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getFullYear();
}

function formatDateKRWithYear(dateStr: string): string {
  return `${dateYear(dateStr)}년 ${formatDateKRBase(dateStr)}`;
}

/**
 * 기록 조회에서는 작년 기록도 함께 보이므로, 현재 연도가 아닌 날짜는 연도를 드러낸다.
 */
export function formatDateKR(dateStr: string, baseDate: Date = new Date()): string {
  return dateYear(dateStr) === baseDate.getFullYear()
    ? formatDateKRBase(dateStr)
    : formatDateKRWithYear(dateStr);
}

export function formatDateRangeKR(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDateKR(startDate);
  if (dateYear(startDate) !== dateYear(endDate)) {
    return `${formatDateKRWithYear(startDate)} ~ ${formatDateKRWithYear(endDate)}`;
  }
  return `${formatDateKR(startDate)} ~ ${formatDateKR(endDate)}`;
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
  const base =
    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
  const c = RECORD_COLOR_MAP[color] ?? GRAY_COLOR;
  return `${base} ${isSelected ? c.activeBg : c.inactiveBg}`;
}

export function getCategoryLabelColor(color: string): string {
  return RECORD_COLOR_MAP[color]?.text ?? GRAY_COLOR.text;
}

export function getRecordTagClass(
  categoryId: string,
  categories: readonly RecordCategoryItem[],
): string {
  const cat = categories.find((c) => c.id === categoryId);
  const c = RECORD_COLOR_MAP[cat?.color ?? 'gray'] ?? GRAY_COLOR;
  return `px-2 py-0.5 rounded text-xs font-medium ${c.tagBg}`;
}

/**
 * Q2: 기록 칩에 표시할 라벨.
 *  - 출결: subcategory("결석 (질병)") 그대로(구조적 데이터).
 *  - 비출결: 태그(있으면 ' · ' 결합), 없으면 카테고리명 fallback.
 *    (subcategory 는 sentinel 이라 화면에 노출하지 않는다 — category + tags 2축.)
 */
export function getRecordChipLabel(
  record: { category: string; subcategory: string; tags?: readonly string[] },
  categories: readonly RecordCategoryItem[],
): string {
  if (record.category === 'attendance') return record.subcategory;
  if (record.tags && record.tags.length > 0) return record.tags.join(' · ');
  return categories.find((c) => c.id === record.category)?.name.split(' (')[0] ?? record.subcategory;
}

export function getCategoryDotColor(
  categoryId: string,
  categories: readonly RecordCategoryItem[],
): string {
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

/**
 * 출결 유형 라벨("결석/지각/조퇴/결과") → 배지 색상.
 * 공용 `ATTENDANCE_BADGE`(단일 소스, /20·지각 amber)에서 색을 끌어온다.
 * 기존 로컬 정의(/15·지각 yellow)를 대체해 다른 조회 화면과 색을 통일한다.
 */
function getAttendanceTagColor(label: string): string | null {
  const status = ATTENDANCE_LABEL_TO_STATUS[label];
  return status ? ATTENDANCE_BADGE[status] : null;
}

export function getAttendanceTypeFromSubcategory(subcategory: string): string | null {
  const match = subcategory.match(/^(결석|지각|조퇴|결과)/);
  return match ? match[1]! : null;
}

/** 출결 레코드면 유형별 색상, 아니면 기존 카테고리 색상 */
export function getSmartTagClass(
  record: { category: string; subcategory: string },
  categories: readonly RecordCategoryItem[],
): string {
  if (record.category === 'attendance') {
    const attType = getAttendanceTypeFromSubcategory(record.subcategory);
    const tagColor = attType ? getAttendanceTagColor(attType) : null;
    if (tagColor) {
      return `px-2 py-0.5 rounded text-xs font-medium ${tagColor}`;
    }
  }
  return getRecordTagClass(record.category, categories);
}

/* ──────────────────────── 교시별 출결 표시 ──────────────────────── */

const ATTENDANCE_STATUS_TEXT: Record<AttendancePeriodEntry['status'], string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

/**
 * 교시별 출결 상세를 한 줄(단일 그룹) 또는 여러 줄(다중 그룹)로 변환한다.
 *
 * - 모든 교시의 (상태, 사유)가 동일: `["1교시, 3교시"]` — subcategory 태그가 이미 유형을 표시하므로 교시만 노출.
 * - 교시마다 (상태, 사유)가 다름: `["1교시 결석 (질병)", "3교시 지각 (기타)"]` — 교시별 유형까지 표시.
 *
 * @param entries attendancePeriods 필드 (period 오름차순 가정)
 * @returns 표시용 문자열 배열. entries가 비어있으면 빈 배열.
 */
export function formatAttendancePeriodLines(
  entries: readonly AttendancePeriodEntry[] | undefined,
): string[] {
  if (!entries || entries.length === 0) return [];

  // (status, reason) 그룹핑
  const groups = new Map<
    string,
    { periods: number[]; status: AttendancePeriodEntry['status']; reason?: string }
  >();
  for (const e of entries) {
    const key = `${e.status}|${e.reason ?? ''}`;
    const existing = groups.get(key);
    if (existing) existing.periods.push(e.period);
    else groups.set(key, { periods: [e.period], status: e.status, reason: e.reason });
  }

  const renderPeriods = (periods: readonly number[]): string =>
    periods.map(formatPeriodLabel).join(', ');

  // 단일 그룹: 교시 나열만 (subcategory 태그가 유형 표시)
  if (groups.size === 1) {
    const only = groups.values().next().value;
    if (!only) return [];
    return [renderPeriods(only.periods)];
  }

  // 다중 그룹: 교시 + 유형(사유) 모두 표시
  const lines: string[] = [];
  for (const g of groups.values()) {
    const statusText = ATTENDANCE_STATUS_TEXT[g.status];
    const reasonText = g.reason ? ` (${g.reason})` : '';
    lines.push(`${renderPeriods(g.periods)} ${statusText}${reasonText}`);
  }
  return lines;
}

/** 출결 유형 정렬 우선순위 */
export const ATTENDANCE_SORT_ORDER: Record<string, number> = {
  결석: 0,
  지각: 1,
  조퇴: 2,
  결과: 3,
};

export type RecordSortMode = 'occurredAt' | 'type' | 'studentNumber';

export const RECORD_SORT_OPTIONS: { mode: RecordSortMode; label: string; icon: string }[] = [
  { mode: 'occurredAt', label: '최근 일시', icon: 'event' },
  { mode: 'type', label: '유형별', icon: 'filter_list' },
  { mode: 'studentNumber', label: '학번순', icon: 'format_list_numbered' },
];

function latestAttendancePeriod(record: StudentRecord): number {
  if (record.category !== 'attendance' || !record.attendancePeriods?.length) return -1;
  return Math.max(...record.attendancePeriods.map((entry) => entry.period));
}

function studentNumberOf(record: StudentRecord, studentMap: ReadonlyMap<string, Student>): number {
  return studentMap.get(record.studentId)?.studentNumber ?? 9999;
}

function compareStudentNumber(
  a: StudentRecord,
  b: StudentRecord,
  studentMap: ReadonlyMap<string, Student>,
): number {
  const byNumber = studentNumberOf(a, studentMap) - studentNumberOf(b, studentMap);
  if (byNumber !== 0) return byNumber;
  return a.studentId.localeCompare(b.studentId);
}

function compareOccurredAtWithinDateDesc(
  a: StudentRecord,
  b: StudentRecord,
  studentMap: ReadonlyMap<string, Student>,
): number {
  const byPeriod = latestAttendancePeriod(b) - latestAttendancePeriod(a);
  if (byPeriod !== 0) return byPeriod;
  return compareStudentNumber(a, b, studentMap);
}

export function sortRecordsInDateGroup(
  records: readonly StudentRecord[],
  sortMode: RecordSortMode,
  studentMap: ReadonlyMap<string, Student>,
): StudentRecord[] {
  return [...records].sort((a, b) => {
    if (sortMode === 'type') {
      const aType = getAttendanceTypeFromSubcategory(a.subcategory);
      const bType = getAttendanceTypeFromSubcategory(b.subcategory);
      const aOrder = aType ? (ATTENDANCE_SORT_ORDER[aType] ?? 99) : 99;
      const bOrder = bType ? (ATTENDANCE_SORT_ORDER[bType] ?? 99) : 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const bySubcategory = a.subcategory.localeCompare(b.subcategory);
      if (bySubcategory !== 0) return bySubcategory;
      return compareStudentNumber(a, b, studentMap);
    }

    if (sortMode === 'studentNumber') {
      const byStudent = compareStudentNumber(a, b, studentMap);
      if (byStudent !== 0) return byStudent;
      const aType = getAttendanceTypeFromSubcategory(a.subcategory);
      const bType = getAttendanceTypeFromSubcategory(b.subcategory);
      const aOrder = aType ? (ATTENDANCE_SORT_ORDER[aType] ?? 99) : 99;
      const bOrder = bType ? (ATTENDANCE_SORT_ORDER[bType] ?? 99) : 99;
      return aOrder - bOrder;
    }

    return compareOccurredAtWithinDateDesc(a, b, studentMap);
  });
}

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
