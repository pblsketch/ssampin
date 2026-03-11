import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
/* eslint-disable no-restricted-imports */
import { exportSeatingToExcel, exportRosterToExcel, parseRosterFromExcel } from '@infrastructure/export/ExcelExporter';
import { exportSeatingToHwpx } from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */
import { ShuffleOverlay } from './ShuffleOverlay';
import { SeatZoneModal } from './SeatZoneModal';
import { ConstraintHintBadge } from './ConstraintHintBadge';

/* ──────────────────────── 뷰 모드 타입 ──────────────────────── */

type ViewMode = 'seating' | 'roster';

/* ──────────────────────── 좌석 카드 ──────────────────────── */

interface SeatCardProps {
  row: number;
  col: number;
  studentId: string | null;
  isDragOver: boolean;
  isDragSource: boolean;
  isEditing: boolean;
  /** 짝꿍 모드: 짝 그룹의 왼쪽 */
  isLeftOfPair?: boolean;
  /** 짝꿍 모드: 짝 그룹의 오른쪽 */
  isRightOfPair?: boolean;
  onDragStart: (row: number, col: number) => void;
  onDragOver: (e: React.DragEvent, row: number, col: number) => void;
  onDragLeave: () => void;
  onDrop: (row: number, col: number) => void;
  onDragEnd: () => void;
  onEditSave: (row: number, col: number, studentId: string | null) => void;
}

function SeatCard({
  row,
  col,
  studentId,
  isDragOver,
  isDragSource,
  isEditing,
  isLeftOfPair,
  isRightOfPair,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEditSave,
}: SeatCardProps) {
  const getStudent = useStudentStore((s) => s.getStudent);
  const student = getStudent(studentId);
  const isEmpty = studentId === null;
  const studentNumber = student?.studentNumber;

  const [editName, setEditName] = useState(student?.name ?? '');

  useEffect(() => {
    setEditName(student?.name ?? '');
  }, [student?.name, isEditing]);

  /* 드래그 핸들러: 편집 모드에서만 동작 */
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isEmpty || !isEditing) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${row},${col}`);
      onDragStart(row, col);
    },
    [row, col, isEmpty, isEditing, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver(e, row, col);
    },
    [row, col, isEditing, onDragOver],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      onDrop(row, col);
    },
    [row, col, isEditing, onDrop],
  );

  // 짝꿍 모드 border radius 조정
  const pairRadiusClass = isLeftOfPair
    ? 'rounded-l-lg rounded-r-none'
    : isRightOfPair
      ? 'rounded-r-lg rounded-l-none'
      : 'rounded-lg';
  const pairBorderClass = isLeftOfPair
    ? 'border-r-0'
    : isRightOfPair
      ? 'border-l-0'
      : '';

  /* 빈 자리 */
  if (isEmpty && !isEditing) {
    return (
      <div className={`group relative border-2 border-dashed p-3 flex flex-col items-center justify-center gap-1 min-h-[90px] transition-all border-sp-border/50 bg-sp-card/50 ${pairRadiusClass} ${pairBorderClass}`}>
        <span className="text-xs text-sp-muted">빈 자리</span>
      </div>
    );
  }

  /* 편집 모드 - 이름 입력 (빈 자리 포함) */
  if (isEditing && isEmpty) {
    return (
      <div
        className={`relative border-2 border-dashed p-3 flex flex-col items-center justify-center gap-1 min-h-[90px] transition-all ${pairRadiusClass} ${pairBorderClass} ${isDragOver
          ? 'border-sp-accent bg-sp-accent/10'
          : 'border-sp-border/50 bg-sp-card/50'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
      >
        <span className="text-xs text-sp-muted">빈 자리</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div
        className={`relative border p-3 flex flex-col gap-2 min-h-[90px] transition-all cursor-grab active:cursor-grabbing ${pairRadiusClass} ${pairBorderClass} ${isDragSource
          ? 'border-sp-accent/50 bg-sp-accent/5 opacity-50'
          : isDragOver
            ? 'border-sp-accent ring-2 ring-sp-accent shadow-[0_0_15px_rgba(59,130,246,0.5)] bg-sp-accent/20 scale-105 z-10'
            : 'border-sp-border bg-sp-card hover:border-sp-accent/50 hover:ring-1 hover:ring-sp-accent/50'
          }`}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
        onDragEnd={onDragEnd}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-sp-accent font-bold">
              {studentNumber !== undefined
                ? String(studentNumber).padStart(2, '0')
                : '--'}
            </span>
            {studentId && <ConstraintHintBadge studentId={studentId} />}
          </div>
          <span className="material-symbols-outlined text-sm text-sp-muted">drag_indicator</span>
        </div>
        <input
          type="text"
          className="w-full rounded bg-sp-bg border border-sp-border px-2 py-1 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => {
            const name = editName.trim();
            if (name === '') {
              onEditSave(row, col, null);
            } else if (name !== student?.name && studentId) {
              // Update using global store action directly, or through a passed prop
              useStudentStore.getState().updateStudentName(studentId, name);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          placeholder="학생 이름"
        />
      </div>
    );
  }

  /* 보기 모드 - 드래그 비활성화 */
  return (
    <div className={`group relative border p-3 flex flex-col gap-2 shadow-sm transition-all min-h-[90px] border-sp-border bg-sp-card hover:border-sp-accent/50 hover:ring-1 hover:ring-sp-accent/50 ${pairRadiusClass} ${pairBorderClass}`}>
      {/* 학번 */}
      <div className="flex justify-between items-start">
        <span className="text-xs font-mono text-sp-muted group-hover:text-sp-accent transition-colors">
          {studentNumber !== undefined
            ? String(studentNumber).padStart(2, '0')
            : '--'}
        </span>
        <div
          className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
          title="출석"
        />
      </div>

      {/* 아바타 + 이름 */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden shrink-0 border border-slate-600 flex items-center justify-center">
          <span className="text-xs text-sp-muted">
            {student?.name.charAt(0) ?? '?'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-sp-text leading-tight">
            {student?.name ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── 명렬표 (학생 목록) ──────────────────────── */

interface RosterViewProps {
  isRosterEditing: boolean;
}

function RosterView({ isRosterEditing }: RosterViewProps) {
  const { students, updateStudentField, toggleVacant } = useStudentStore();
  const seating = useSeatingStore((s) => s.seating);

  // 좌석에 배치된 학생 ID Set
  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of seating.seats) {
      for (const cell of row) {
        if (cell !== null) ids.add(cell);
      }
    }
    return ids;
  }, [seating.seats]);

  // 학번 순으로 정렬된 학생 목록
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0)),
    [students],
  );

  const activeCount = useMemo(() => students.filter((s) => !s.isVacant).length, [students]);
  const vacantCount = useMemo(() => students.filter((s) => s.isVacant).length, [students]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* 테이블 헤더 */}
      <div className="grid grid-cols-[50px_50px_1fr_160px_160px_80px_80px] gap-2 px-4 py-3 border-b border-sp-border text-xs font-bold text-sp-muted uppercase tracking-wider">
        <span>번호</span>
        <span>학번</span>
        <span>이름</span>
        <span>학생 연락처</span>
        <span>학부모 연락처</span>
        <span className="text-center">좌석</span>
        <span className="text-center">결번</span>
      </div>

      {/* 학생 목록 */}
      <div className="divide-y divide-sp-border/50">
        {sortedStudents.map((student, idx) => {
          const isAssigned = assignedIds.has(student.id);
          const isVacant = !!student.isVacant;
          return (
            <div
              key={student.id}
              className={`grid grid-cols-[50px_50px_1fr_160px_160px_80px_80px] gap-2 px-4 py-3 items-center transition-colors ${isVacant ? 'opacity-50 bg-red-500/5' : ''} ${isRosterEditing ? 'hover:bg-sp-accent/5' : 'hover:bg-sp-card'}`}
            >
              {/* 번호 */}
              <span className="text-sm text-sp-muted font-mono">{idx + 1}</span>

              {/* 학번 */}
              <span className={`text-sm font-mono font-bold ${isVacant ? 'text-red-400/60' : 'text-sp-accent'}`}>
                {student.studentNumber !== undefined
                  ? String(student.studentNumber).padStart(2, '0')
                  : '--'}
              </span>

              {/* 이름 */}
              {isVacant ? (
                <span className="text-sm text-sp-muted italic line-through">결번</span>
              ) : isRosterEditing ? (
                <input
                  type="text"
                  className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full max-w-xs"
                  defaultValue={student.name}
                  onBlur={(e) => {
                    const newName = e.target.value.trim();
                    if (newName && newName !== student.name) {
                      void updateStudentField(student.id, 'name', newName);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  placeholder="학생 이름"
                />
              ) : (
                <span className="text-sm text-sp-text font-medium">{student.name}</span>
              )}

              {/* 학생 연락처 */}
              {isRosterEditing && !isVacant ? (
                <input
                  type="tel"
                  className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full"
                  defaultValue={student.phone ?? ''}
                  placeholder="010-0000-0000"
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (student.phone ?? '')) {
                      void updateStudentField(student.id, 'phone', val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              ) : (
                <span className="text-sm text-sp-muted">{student.phone || '-'}</span>
              )}

              {/* 학부모 연락처 */}
              {isRosterEditing && !isVacant ? (
                <input
                  type="tel"
                  className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full"
                  defaultValue={student.parentPhone ?? ''}
                  placeholder="010-0000-0000"
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (student.parentPhone ?? '')) {
                      void updateStudentField(student.id, 'parentPhone', val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              ) : (
                <span className="text-sm text-sp-muted">{student.parentPhone || '-'}</span>
              )}

              {/* 좌석 */}
              <div className="flex justify-center">
                {isVacant ? (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    결번
                  </span>
                ) : isAssigned ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    배정됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-sp-muted bg-sp-border/20 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-sp-muted" />
                    미배정
                  </span>
                )}
              </div>

              {/* 결번 토글 */}
              <div className="flex justify-center">
                {isRosterEditing ? (
                  <button
                    onClick={() => void toggleVacant(student.id)}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${isVacant
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-sp-border/20 text-sp-muted hover:bg-sp-border/40'
                      }`}
                    title={isVacant ? '결번 해제' : '결번 설정'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {isVacant ? 'block' : 'block'}
                    </span>
                  </button>
                ) : isVacant ? (
                  <span className="material-symbols-outlined text-red-400/60" style={{ fontSize: '16px' }}>block</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 요약 */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-sp-border text-xs text-sp-muted">
        <span>총 {activeCount}명 (결번 {vacantCount}명)</span>
        <span className="text-sp-border">|</span>
        <span>배정: {assignedIds.size}명</span>
        <span className="text-sp-border">|</span>
        <span>미배정: {activeCount - assignedIds.size}명</span>
      </div>
    </div>
  );
}

/* ──────────────────────── 메인 Seating 페이지 ──────────────────────── */

export function Seating(_props?: { embedded?: boolean }) {
  const { track } = useAnalytics();
  const {
    seating,
    loaded: seatingLoaded,
    isEditing,
    load: loadSeating,
    swapSeats,
    randomize,
    setEditing,
    studentCount,
    emptyCount,
    undo,
    redo,
    clearAllSeats,
    canUndo,
    canRedo,
    resizeGrid,
    rebuildFromRoster,
    togglePairMode,
  } = useSeatingStore();

  const {
    students,
    loaded: studentsLoaded,
    load: loadStudents,
    updateStudents,
    setStudentCount,
  } = useStudentStore();

  const className = useSettingsStore((s) => s.settings.className);

  const [viewMode, setViewMode] = useState<ViewMode>('seating');
  const [isRosterEditing, setIsRosterEditing] = useState(false);
  const [dragSource, setDragSource] = useState<{ row: number; col: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ row: number; col: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showShuffle, setShowShuffle] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showConstraintModal, setShowConstraintModal] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const rosterFileRef = useRef<HTMLInputElement>(null);

  const loaded = seatingLoaded && studentsLoaded;

  useEffect(() => {
    void loadStudents();
    void loadSeating();
  }, [loadStudents, loadSeating]);

  // Global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcut handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo()) {
          e.preventDefault();
          void undo();
        }
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        if (canRedo()) {
          e.preventDefault();
          void redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const totalStudents = useMemo(() => studentCount(), [seating.seats, studentCount]);
  const emptySeats = useMemo(() => emptyCount(), [seating.seats, emptyCount]);

  const handleDragStart = useCallback((row: number, col: number) => {
    setDragSource({ row, col });
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, row: number, col: number) => {
    setDragTarget({ row, col });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragTarget(null);
  }, []);

  const handleDrop = useCallback(
    (row: number, col: number) => {
      if (dragSource !== null) {
        track('seating_drag');
        void swapSeats(dragSource.row, dragSource.col, row, col);
      }
      setDragSource(null);
      setDragTarget(null);
    },
    [dragSource, swapSeats, track],
  );

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragTarget(null);
  }, []);

  const handleRandomize = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const confirmRandomize = useCallback(async () => {
    setShowConfirm(false);
    setShowShuffle(true);
    track('seating_shuffle', { studentCount: totalStudents });
    const result = await randomize();
    if (result && !result.success) {
      useToastStore.getState().show(
        '일부 배치 조건을 완전히 만족하지 못했습니다',
        'info',
      );
    } else if (result && result.relaxed) {
      useToastStore.getState().show(
        '배치 조건이 일부 완화되어 적용되었습니다',
        'info',
      );
    }
  }, [randomize, track, totalStudents]);

   
  const handleEditSave = useCallback(
    (_row: number, _col: number, _studentId: string | null) => {
      // 편집 모드에서 학생 이름 변경 시 처리 (추후 확장)
    },
    [],
  );

  // 뷰 모드 전환 시 편집 상태 리셋
  const switchViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode !== viewMode) {
        setEditing(false);
        setIsRosterEditing(false);
        setViewMode(mode);
      }
    },
    [viewMode, setEditing],
  );

  // 내보내기 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const showToast = useToastStore((s) => s.show);
  const getStudent = useStudentStore((s) => s.getStudent);

  const handleExport = useCallback(async (format: 'excel' | 'hwpx') => {
    setShowExportMenu(false);
    try {
      let data: ArrayBuffer | Uint8Array;
      let defaultFileName: string;

      if (format === 'excel') {
        data = await exportSeatingToExcel(seating, getStudent, students, className);
        defaultFileName = '학급자리배치도.xlsx';
      } else {
        data = await exportSeatingToHwpx(seating, getStudent, students, className);
        defaultFileName = '학급자리배치도.hwpx';
      }

      const normalized: ArrayBuffer | string =
        data instanceof Uint8Array
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
          : data;

      if (window.electronAPI) {
        const ext = format === 'excel' ? 'xlsx' : 'hwpx';
        const filterName = format === 'excel' ? 'Excel 파일' : '한글 문서';
        const filePath = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: filterName, extensions: [ext] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, normalized);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([normalized], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast('파일이 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [seating, getStudent, students, className, showToast]);

  const handleBulkImport = useCallback(async () => {
    if (!bulkText.trim()) return;

    // Parse the pasted text. Supports commas, tabs, and newlines.
    const names = bulkText
      .split(/[\n\t,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (names.length === 0) return;

    // Create new students array
    const newStudents = names.map((name, idx) => ({
      id: `s${Date.now()}_${idx}`,
      name,
      studentNumber: idx + 1,
      phone: '',
      parentPhone: '',
      isVacant: false,
    }));

    await updateStudents(newStudents);
    await rebuildFromRoster(newStudents);
    setBulkText('');
    setShowBulkImport(false);
  }, [bulkText, updateStudents, rebuildFromRoster]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">좌석 데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="flex items-center justify-between pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-sp-accent/20 p-2 rounded-lg text-sp-accent">
            <span className="material-symbols-outlined">chair_alt</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-sp-text tracking-tight">학급 자리 배치도</h2>
            <p className="text-xs text-sp-muted">
              {className || '학급 미설정'} ({totalStudents}명)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 뷰 모드 탭 */}
          <div className="flex items-center rounded-lg border border-sp-border bg-sp-card overflow-hidden">
            <button
              onClick={() => switchViewMode('seating')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'seating'
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text hover:bg-slate-700'
                }`}
            >
              <span className="material-symbols-outlined text-base">grid_view</span>
              <span>배치도</span>
            </button>
            <button
              onClick={() => switchViewMode('roster')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-sp-border ${viewMode === 'roster'
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text hover:bg-slate-700'
                }`}
            >
              <span className="material-symbols-outlined text-base">list</span>
              <span>명렬표</span>
            </button>
          </div>

          <div className="w-px h-8 bg-sp-border" />

          {/* 배치도 모드 전용 버튼 */}
          {viewMode === 'seating' && (
            <>
              <button
                onClick={handleRandomize}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">shuffle</span>
                <span>자리 바꾸기</span>
              </button>
              <button
                onClick={() => setShowConstraintModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">tune</span>
                <span>배치 조건</span>
              </button>
              <button
                onClick={() => void togglePairMode()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${seating.pairMode
                  ? 'border-sp-highlight bg-sp-highlight/20 text-sp-highlight'
                  : 'border-sp-border bg-sp-card hover:bg-slate-700 text-sp-text'
                  }`}
                title="짝꿍 모드: 2명씩 짝 그룹으로 표시"
              >
                <span className="material-symbols-outlined text-lg">group</span>
                <span>짝꿍</span>
              </button>
              <button
                onClick={() => setEditing(!isEditing)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${isEditing
                  ? 'border-sp-accent bg-sp-accent/20 text-sp-accent'
                  : 'border-sp-border bg-sp-card hover:bg-slate-700 text-sp-text'
                  }`}
              >
                <span className="material-symbols-outlined text-lg">edit</span>
                <span>{isEditing ? '편집 완료' : '편집'}</span>
              </button>
              {isEditing && (
                <>
                  <div className="w-px h-8 bg-sp-border" />
                  <button
                    onClick={() => void undo()}
                    title="실행 취소 (Ctrl+Z)"
                    disabled={!canUndo()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-sp-text transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">undo</span>
                    <span>실행 취소</span>
                  </button>
                  <button
                    onClick={() => void redo()}
                    title="다시 실행 (Ctrl+Shift+Z)"
                    disabled={!canRedo()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-sp-text transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">redo</span>
                    <span>다시 실행</span>
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 bg-sp-card hover:bg-red-500/10 text-sm font-medium text-red-400 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">delete_sweep</span>
                    <span>모두 삭제</span>
                  </button>
                </>
              )}
            </>
          )}

          {/* 명렬표 모드 전용 버튼 */}
          {viewMode === 'roster' && (
            <>
              {/* 인원 수 조절 */}
              <div className="flex items-center gap-1 px-3 py-2 rounded-lg border border-sp-border bg-sp-card text-sm text-sp-text">
                <button
                  onClick={() => void setStudentCount(students.length - 1)}
                  disabled={students.length <= 1}
                  className="w-6 h-6 flex items-center justify-center rounded border border-sp-border bg-sp-bg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>remove</span>
                </button>
                <span className="w-8 text-center font-mono font-bold">{students.length}</span>
                <button
                  onClick={() => void setStudentCount(students.length + 1)}
                  disabled={students.length >= 50}
                  className="w-6 h-6 flex items-center justify-center rounded border border-sp-border bg-sp-bg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                </button>
                <span className="ml-1 text-sp-muted">명</span>
              </div>

              <button
                onClick={() => setShowBulkImport(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">group_add</span>
                <span>일괄 입력</span>
              </button>

              {/* 엑셀 가져오기 */}
              <button
                onClick={() => rosterFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">upload_file</span>
                <span>엑셀 가져오기</span>
              </button>
              <input
                ref={rosterFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const buffer = await file.arrayBuffer();
                    const parsed = await parseRosterFromExcel(buffer);
                    if (parsed.length === 0) {
                      showToast('엑셀에서 학생 데이터를 찾을 수 없습니다', 'error');
                      return;
                    }
                    const newStudents = parsed.map((p, idx) => ({
                      id: `s${Date.now()}_${idx}`,
                      name: p.name,
                      studentNumber: p.studentNumber,
                      phone: p.phone,
                      parentPhone: p.parentPhone,
                      isVacant: p.isVacant,
                    }));
                    await updateStudents(newStudents);
                    await rebuildFromRoster(newStudents);
                    showToast(`${parsed.length}명의 학생을 가져왔습니다`, 'success');
                  } catch {
                    showToast('엑셀 파일을 읽는 중 오류가 발생했습니다', 'error');
                  }
                  // Reset file input so same file can be selected again
                  e.target.value = '';
                }}
              />

              <button
                onClick={() => setIsRosterEditing(!isRosterEditing)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${isRosterEditing
                  ? 'border-sp-accent bg-sp-accent/20 text-sp-accent'
                  : 'border-sp-border bg-sp-card hover:bg-slate-700 text-sp-text'
                  }`}
              >
                <span className="material-symbols-outlined text-lg">edit</span>
                <span>{isRosterEditing ? '편집 완료' : '편집'}</span>
              </button>
            </>
          )}

          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-sm shadow-sp-accent/20"
            >
              <span className="material-symbols-outlined text-lg">download</span>
              <span>내보내기</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-sp-card border border-sp-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                <button
                  onClick={() => void handleExport('excel')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-green-400 text-lg">table_view</span>
                  <span>학급 자리 배치 Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => void handleExport('hwpx')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors border-t border-sp-border"
                >
                  <span className="material-symbols-outlined text-blue-400 text-lg">description</span>
                  <span>학급 자리 배치 한글 (.hwpx)</span>
                </button>
                {viewMode === 'roster' && (
                  <button
                    onClick={async () => {
                      setShowExportMenu(false);
                      try {
                        const data = await exportRosterToExcel(students);
                        const defaultFileName = '명렬표.xlsx';
                        const normalized: ArrayBuffer = data;

                        if (window.electronAPI) {
                          const filePath = await window.electronAPI.showSaveDialog({
                            title: '명렬표 내보내기',
                            defaultPath: defaultFileName,
                            filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
                          });
                          if (filePath) {
                            await window.electronAPI.writeFile(filePath, normalized);
                            showToast('명렬표가 저장되었습니다', 'success', {
                              label: '파일 열기',
                              onClick: () => window.electronAPI?.openFile(filePath),
                            });
                          }
                        } else {
                          const blob = new Blob([normalized], { type: 'application/octet-stream' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = defaultFileName;
                          a.click();
                          URL.revokeObjectURL(url);
                          showToast('명렬표가 다운로드되었습니다', 'success');
                        }
                      } catch {
                        showToast('명렬표 내보내기 중 오류가 발생했습니다', 'error');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors border-t border-sp-border"
                  >
                    <span className="material-symbols-outlined text-amber-400 text-lg">badge</span>
                    <span>명렬표 Excel (.xlsx)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 컨텐츠 영역 */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center">
        {viewMode === 'seating' ? (
          <>
            {/* 교탁 */}
            <div className="w-full max-w-2xl mb-10 flex flex-col items-center">
              <div className="w-64 h-12 bg-sp-card border border-sp-border rounded-b-xl flex items-center justify-center shadow-lg relative after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-1 after:bg-sp-accent/50">
                <span className="text-sp-muted text-sm font-bold tracking-widest">
                  [ 교 탁 ]
                </span>
              </div>
            </div>

            {/* 편집 모드 안내 배너 */}
            {isEditing && (
              <div className="w-full max-w-6xl mx-auto mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sm text-sp-accent">
                <span className="material-symbols-outlined text-base">info</span>
                <span>편집 모드: 학생을 드래그하여 자리를 변경할 수 있습니다</span>
              </div>
            )}

            {/* 좌석 그리드 */}
            {seating.pairMode ? (
              /* ── 짝꿍 모드 그리드 ── */
              <div className="w-full max-w-6xl mx-auto pb-8 flex flex-col gap-5">
                {seating.seats.map((row, ri) => {
                  // 열을 짝 그룹으로 묶기: (0,1), (2,3), (4,5)...
                  const pairs: { startCol: number; endCol: number }[] = [];
                  for (let c = 0; c < seating.cols; c += 2) {
                    pairs.push({ startCol: c, endCol: Math.min(c + 1, seating.cols - 1) });
                  }

                  return (
                    <div
                      key={ri}
                      className="flex items-stretch justify-center gap-6"
                    >
                      {pairs.map((pair, pi) => {
                        const isSingleSeat = pair.startCol === pair.endCol;
                        return (
                          <div
                            key={pi}
                            className={`flex ${isSingleSeat ? '' : 'bg-sp-card/30 rounded-lg'}`}
                            style={{ minWidth: isSingleSeat ? 140 : 280 }}
                          >
                            {/* 왼쪽 좌석 */}
                            <div className="flex-1">
                              <SeatCard
                                row={ri}
                                col={pair.startCol}
                                studentId={row[pair.startCol] ?? null}
                                isDragOver={dragTarget !== null && dragTarget.row === ri && dragTarget.col === pair.startCol}
                                isDragSource={dragSource !== null && dragSource.row === ri && dragSource.col === pair.startCol}
                                isEditing={isEditing}
                                isLeftOfPair={!isSingleSeat}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onEditSave={handleEditSave}
                              />
                            </div>
                            {/* 오른쪽 좌석 (짝이 있을 때만) */}
                            {!isSingleSeat && (
                              <div className="flex-1">
                                <SeatCard
                                  row={ri}
                                  col={pair.endCol}
                                  studentId={row[pair.endCol] ?? null}
                                  isDragOver={dragTarget !== null && dragTarget.row === ri && dragTarget.col === pair.endCol}
                                  isDragSource={dragSource !== null && dragSource.row === ri && dragSource.col === pair.endCol}
                                  isEditing={isEditing}
                                  isRightOfPair
                                  onDragStart={handleDragStart}
                                  onDragOver={handleDragOver}
                                  onDragLeave={handleDragLeave}
                                  onDrop={handleDrop}
                                  onDragEnd={handleDragEnd}
                                  onEditSave={handleEditSave}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── 일반 그리드 ── */
              <div
                className="w-full max-w-6xl mx-auto pb-8"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${seating.cols}, minmax(0, 1fr))`,
                  gap: '1.25rem',
                }}
              >
                {seating.seats.map((row, ri) =>
                  row.map((studentId, ci) => {
                    const isDragOver =
                      dragTarget !== null &&
                      dragTarget.row === ri &&
                      dragTarget.col === ci;
                    const isDragSource2 =
                      dragSource !== null &&
                      dragSource.row === ri &&
                      dragSource.col === ci;

                    return (
                      <SeatCard
                        key={`${ri}-${ci}`}
                        row={ri}
                        col={ci}
                        studentId={studentId}
                        isDragOver={isDragOver}
                        isDragSource={isDragSource2}
                        isEditing={isEditing}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onEditSave={handleEditSave}
                      />
                    );
                  }),
                )}
              </div>
            )}

            {/* 하단 정보 */}
            <div className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-sp-muted py-4 border-t border-sp-border/50">
              <div className="flex items-center gap-4">
                <span>총 {totalStudents}명</span>
                <span className="text-sp-border">|</span>
                {/* 열 × 행 크기 조절 컨트롤 */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void resizeGrid(seating.rows, seating.cols - 1)}
                    disabled={seating.cols <= 1}
                    className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="열 줄이기"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>remove</span>
                  </button>
                  <span className="w-4 text-center">{seating.cols}</span>
                  <button
                    onClick={() => void resizeGrid(seating.rows, seating.cols + 1)}
                    disabled={seating.cols >= 10}
                    className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="열 늘리기"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                  </button>
                  <span className="ml-0.5">열</span>
                  <span className="mx-1 text-sp-border">×</span>
                  <button
                    onClick={() => void resizeGrid(seating.rows - 1, seating.cols)}
                    disabled={seating.rows <= 1}
                    className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="행 줄이기"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>remove</span>
                  </button>
                  <span className="w-4 text-center">{seating.rows}</span>
                  <button
                    onClick={() => void resizeGrid(seating.rows + 1, seating.cols)}
                    disabled={seating.rows >= 10}
                    className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="행 늘리기"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                  </button>
                  <span className="ml-0.5">행</span>
                </div>
                <span className="text-sp-border">|</span>
                <span>빈 자리: {emptySeats}개</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">info</span>
                <span>
                  {isEditing
                    ? '드래그하여 자리를 변경하세요'
                    : '편집 버튼을 눌러 자리를 변경할 수 있습니다'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <RosterView isRosterEditing={isRosterEditing} />
        )}
      </div>

      {/* 랜덤 배치 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-sp-text mb-2">자리 바꾸기</h3>
            <p className="text-sm text-sp-muted mb-6">
              모든 학생의 좌석을 랜덤으로 재배치합니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmRandomize}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모두 삭제 확인 모달 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-sp-text mb-2">좌석 모두 삭제</h3>
            <p className="text-sm text-sp-muted mb-6">
              모든 좌석 배정을 초기화합니다. 학생 목록과 좌석 크기는 유지됩니다.
              <br />
              <span className="text-sp-accent">실행 취소(Ctrl+Z)로 복원할 수 있습니다.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  void clearAllSeats().then(() => {
                    useToastStore.getState().show('좌석 배정이 모두 삭제되었습니다.', 'info', {
                      label: '실행 취소',
                      onClick: () => void useSeatingStore.getState().undo(),
                    });
                  });
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 셔플 애니메이션 오버레이 */}
      {showShuffle && (
        <ShuffleOverlay
          rows={seating.rows}
          cols={seating.cols}
          students={students}
          finalSeats={seating.seats}
          onComplete={() => setShowShuffle(false)}
        />
      )}

      {/* 일괄 입력 모달 */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl flex flex-col max-h-[80vh]">
            <h3 className="text-lg font-bold text-sp-text mb-2">학생 일괄 입력</h3>
            <p className="text-sm text-sp-muted mb-4">
              엑셀, 한글 파일 등에서 학생 이름 목록을 복사하여 붙여넣으세요.<br />
              이름은 줄바꿈, 쉼표, 또는 탭으로 구분됩니다.<br />
              <span className="text-red-400 font-bold mt-1 inline-block">주의: 저장 시 기존 명단이 모두 교체됩니다!</span>
            </p>

            <textarea
              className="flex-1 w-full min-h-[200px] bg-sp-bg border border-sp-border rounded-lg p-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none resize-none mb-6"
              placeholder="홍길동, 김철수, 이영희..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            <div className="flex justify-end gap-3 shrink-0">
              <button
                onClick={() => {
                  setBulkText('');
                  setShowBulkImport(false);
                }}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleBulkImport()}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 배치 조건 모달 */}
      <SeatZoneModal
        open={showConstraintModal}
        onClose={() => setShowConstraintModal(false)}
      />
    </div>
  );
}
