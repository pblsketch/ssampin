import { useMemo, useCallback } from 'react';
import type { Student } from '@domain/entities/Student';
import { isInactiveStatus, STUDENT_STATUS_LABELS } from '@domain/entities/Student';

/* ──────────────────────── 모드별 Props ──────────────────────── */

/** SelectionMode: 학생 선택/해제 (InputMode 패턴) */
export interface SelectionModeProps {
  mode: 'selection';
  selected: ReadonlySet<string>;
  onToggle: (studentId: string) => void;
}

/** CycleMode: 셀 탭 → 상태 순환 (○→×→미응답, 출석→결석→지각 등) */
export interface CycleModeProps<T extends string> {
  mode: 'cycle';
  values: ReadonlyMap<string, T>;
  cycle: readonly T[];
  renderValue: (value: T) => string;
  onCycle: (studentId: string, next: T) => void;
  /** 각 값별 스타일 (배경/텍스트 색상) */
  valueStyle?: (value: T) => string;
}

/** ReadonlyMode: 읽기 전용 표시 (설문 응답 현황 등) */
export interface ReadonlyModeProps<T extends string> {
  mode: 'readonly';
  values: ReadonlyMap<string, T>;
  renderValue: (value: T) => string;
  /** 보조 텍스트 (응답 시간 등) */
  renderSub?: (studentId: string) => string | undefined;
  valueStyle?: (value: T) => string;
}

export type StudentGridMode<T extends string = string> =
  | SelectionModeProps
  | CycleModeProps<T>
  | ReadonlyModeProps<T>;

/* ──────────────────────── 공통 Props ──────────────────────── */

export interface StudentGridProps<T extends string = string> {
  students: readonly Student[];
  gridMode: StudentGridMode<T>;
  /** 열 수 (기본 5) */
  columns?: number;
  /** 결번 학생 숨김 여부 */
  hideVacant?: boolean;
  className?: string;
}

/* ──────────────────────── 컴포넌트 ──────────────────────── */

export function StudentGrid<T extends string = string>({
  students,
  gridMode,
  columns = 5,
  hideVacant = false,
  className = '',
}: StudentGridProps<T>) {
  const filteredStudents = useMemo(
    () => (hideVacant ? students.filter((s) => !isInactiveStatus(s.status) && !s.isVacant) : students),
    [students, hideVacant],
  );

  const handleClick = useCallback(
    (student: Student) => {
      if (gridMode.mode === 'selection') {
        gridMode.onToggle(student.id);
      } else if (gridMode.mode === 'cycle') {
        const fallback = gridMode.cycle[gridMode.cycle.length - 1] as T;
        const current: T = gridMode.values.get(student.id) ?? fallback;
        const idx = gridMode.cycle.indexOf(current);
        const next: T = gridMode.cycle[(idx + 1) % gridMode.cycle.length] as T;
        gridMode.onCycle(student.id, next);
      }
      // readonly: 클릭 무시
    },
    [gridMode],
  );

  return (
    <div
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {filteredStudents.map((student, idx) => (
        <StudentCell
          key={student.id}
          student={student}
          displayNumber={idx + 1}
          gridMode={gridMode}
          onClick={() => handleClick(student)}
        />
      ))}
    </div>
  );
}

/* ──────────────────────── 셀 컴포넌트 ──────────────────────── */

interface StudentCellProps<T extends string> {
  student: Student;
  displayNumber: number;
  gridMode: StudentGridMode<T>;
  onClick: () => void;
}

function StudentCell<T extends string>({
  student,
  displayNumber,
  gridMode,
  onClick,
}: StudentCellProps<T>) {
  if (isInactiveStatus(student.status) || student.isVacant) {
    const label = student.status ? STUDENT_STATUS_LABELS[student.status] : '결번';
    return (
      <div className="px-2 py-2.5 rounded-lg text-xs text-sp-muted/40 text-center bg-sp-surface/30">
        {displayNumber}
        <div className="text-caption truncate">{label}</div>
      </div>
    );
  }

  if (gridMode.mode === 'selection') {
    const isSelected = gridMode.selected.has(student.id);
    return (
      <button
        onClick={onClick}
        className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all text-center ${
          isSelected
            ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
            : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
        }`}
      >
        {displayNumber}
        {student.name}
      </button>
    );
  }

  if (gridMode.mode === 'cycle') {
    const value: T = gridMode.values.get(student.id) ?? (gridMode.cycle[gridMode.cycle.length - 1] as T);
    const label = gridMode.renderValue(value);
    const style = gridMode.valueStyle?.(value) ?? '';
    return (
      <button
        onClick={onClick}
        className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all text-center ${style || 'bg-sp-surface text-sp-text'} hover:opacity-80`}
      >
        <div>{displayNumber} {label}</div>
        <div className="text-caption truncate">{student.name}</div>
      </button>
    );
  }

  // readonly
  const value: T | undefined = gridMode.values.get(student.id);
  const label = value !== undefined ? gridMode.renderValue(value) : '-';
  const style = value !== undefined ? (gridMode.valueStyle?.(value) ?? '') : 'text-sp-muted';
  const sub = gridMode.renderSub?.(student.id);
  return (
    <div className={`px-2 py-2.5 rounded-lg text-xs text-center ${style || 'bg-sp-surface text-sp-text'}`}>
      <div>{displayNumber} {label}</div>
      <div className="text-caption truncate">{student.name}</div>
      {sub && <div className="text-tiny text-sp-muted truncate">{sub}</div>}
    </div>
  );
}
