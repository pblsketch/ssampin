import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
/* eslint-disable no-restricted-imports */
import { exportSeatingToExcel } from '@infrastructure/export/ExcelExporter';
import { exportSeatingToHwpx } from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */
import { ShuffleOverlay } from './ShuffleOverlay';
import { GroupShuffleOverlay } from './GroupShuffleOverlay';
import { GroupSeatingView } from './GroupSeatingView';
import { SeatZoneModal } from './SeatZoneModal';
import { ConstraintHintBadge } from './ConstraintHintBadge';
import { buildPairGroups, adjustPairGroupsForRow } from '@domain/rules/seatingLayoutRules';

/* ──────────────────────── 이름 글자 크기 매핑 ──────────────────────── */

const NAME_SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

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
  const nameSize = useSettingsStore((s) => s.settings.seatingNameSize ?? 'sm');
  const nameSizeClass = NAME_SIZE_CLASS[nameSize];

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
        <div className="h-8 w-8 rounded-full bg-sp-surface overflow-hidden shrink-0 border border-sp-border flex items-center justify-center">
          <span className="text-xs text-sp-muted">
            {student?.name.charAt(0) ?? '?'}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`${nameSizeClass} font-bold text-sp-text leading-tight truncate`}>
            {student?.name ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── 메인 Seating 페이지 ──────────────────────── */

export function Seating(props?: { embedded?: boolean }) {
  const embedded = props?.embedded ?? false;
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
    togglePairMode,
    toggleOddColumnMode,
    changeLayout,
    updateGroups,
    shuffleGroupSeating,
    toggleGroupGridSync,
  } = useSeatingStore();

  const {
    students,
    loaded: studentsLoaded,
    load: loadStudents,
  } = useStudentStore();

  const className = useSettingsStore((s) => s.settings.className);
  const seatingDefaultView = useSettingsStore((s) => s.settings.seatingDefaultView);

  const layout = seating.layout ?? 'grid';
  const groupGridSync = seating.groupGridSync !== false;

  const [isTeacherView, setIsTeacherView] = useState(seatingDefaultView === 'teacher');
  const [dragSource, setDragSource] = useState<{ row: number; col: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ row: number; col: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showShuffle, setShowShuffle] = useState(false);
  const [showGroupShuffle, setShowGroupShuffle] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showConstraintModal, setShowConstraintModal] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

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
    track('seating_shuffle', { studentCount: totalStudents });

    if (layout === 'group') {
      // 모둠 모드: 기존 모둠 구조 유지하면서 학생만 재배정
      const groups = seating.groups ?? [];
      const groupCount = Math.max(1, groups.length);
      const maxSize = groups[0]?.maxSize ?? 6;
      await shuffleGroupSeating(groupCount, maxSize);
      setShowGroupShuffle(true);
      return;
    }

    setShowShuffle(true);
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
  }, [randomize, track, totalStudents, layout, seating.groups, shuffleGroupSeating]);

   
  const handleEditSave = useCallback(
    (_row: number, _col: number, _studentId: string | null) => {
      // 편집 모드에서 학생 이름 변경 시 처리 (추후 확장)
    },
    [],
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

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">좌석 데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${embedded ? '' : '-m-8'}`}>
      {!embedded && (
        <PageHeader
          icon="chair_alt"
          iconIsMaterial
          title="학급 자리 배치도"
          leftAddon={
            <span className="text-sp-muted text-sm font-sp-medium">
              {className || '학급 미설정'} ({totalStudents}명)
            </span>
          }
        />
      )}
      <div className={embedded ? '' : 'p-8 flex flex-col flex-1 min-h-0'}>
      <div className="flex items-center justify-end gap-2 flex-wrap mb-4">
              {/* 레이아웃 모드 스위치 */}
              <div className="flex items-center gap-0.5 bg-sp-surface rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => void changeLayout('grid')}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    layout === 'grid' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm mr-1 align-middle">grid_view</span>
                  격자
                </button>
                <button
                  onClick={() => void changeLayout('group')}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    layout === 'group' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm mr-1 align-middle">workspaces</span>
                  모둠
                </button>
              </div>
              <button
                onClick={() => void toggleGroupGridSync()}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  groupGridSync
                    ? 'border-sp-accent/40 bg-sp-accent/10 text-sp-accent'
                    : 'border-sp-border bg-sp-card text-sp-muted hover:text-sp-text'
                }`}
                title={groupGridSync
                  ? '격자↔모둠 연동: 전환 시 학생 자동 재분배'
                  : '격자↔모둠 비연동: 각각 독립 유지'}
              >
                <span className="material-symbols-outlined text-sm">
                  {groupGridSync ? 'link' : 'link_off'}
                </span>
                {groupGridSync ? '연동' : '비연동'}
              </button>
              <div className="w-px h-8 bg-sp-border shrink-0" />
              <button
                onClick={handleRandomize}
                className="shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">shuffle</span>
                <span>자리 바꾸기</span>
              </button>
              <button
                onClick={() => setShowConstraintModal(true)}
                className="shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">tune</span>
                <span>배치 조건</span>
              </button>
              {layout === 'grid' && (
                <>
                  <button
                    onClick={() => void togglePairMode()}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${seating.pairMode
                      ? 'border-sp-highlight bg-sp-highlight/20 text-sp-highlight'
                      : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-text'
                      }`}
                    title="짝꿍 모드: 2명씩 짝 그룹으로 표시"
                  >
                    <span className="material-symbols-outlined text-lg">group</span>
                    <span>짝꿍</span>
                  </button>
                  {seating.pairMode && (
                    <button
                      onClick={() => void toggleOddColumnMode()}
                      className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${
                        (seating.oddColumnMode ?? 'single') === 'triple'
                          ? 'border-sp-highlight bg-sp-highlight/20 text-sp-highlight'
                          : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-text'
                      }`}
                      title="홀수 열 처리: 3명 함께 앉기 / 1명 따로 앉기"
                    >
                      <span className="material-symbols-outlined text-lg">group_add</span>
                      <span>{(seating.oddColumnMode ?? 'single') === 'triple' ? '3인 짝' : '1인 따로'}</span>
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setIsTeacherView((v) => !v)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${isTeacherView
                  ? 'border-sp-accent bg-sp-accent/20 text-sp-accent'
                  : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-text'
                  }`}
                title={isTeacherView ? '학생 시점으로 보기' : '교사 시점으로 보기'}
              >
                <span className="material-symbols-outlined text-lg">
                  {isTeacherView ? 'visibility' : 'swap_vert'}
                </span>
                <span>교사 시점</span>
              </button>
              <button
                onClick={() => setEditing(!isEditing)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${isEditing
                  ? 'border-sp-accent bg-sp-accent/20 text-sp-accent'
                  : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-text'
                  }`}
              >
                <span className="material-symbols-outlined text-lg">edit</span>
                <span>{isEditing ? '편집 완료' : '편집'}</span>
              </button>
              {isEditing && (
                <>
                  <div className="w-px h-8 bg-sp-border shrink-0" />
                  <button
                    onClick={() => void undo()}
                    title="실행 취소 (Ctrl+Z)"
                    disabled={!canUndo()}
                    className="shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-sp-text transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">undo</span>
                    <span>실행 취소</span>
                  </button>
                  <button
                    onClick={() => void redo()}
                    title="다시 실행 (Ctrl+Shift+Z)"
                    disabled={!canRedo()}
                    className="shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-sp-text transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">redo</span>
                    <span>다시 실행</span>
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 bg-sp-card hover:bg-red-500/10 text-sm font-medium text-red-400 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">delete_sweep</span>
                    <span>모두 삭제</span>
                  </button>
                </>
              )}

          <div className="relative shrink-0" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-sm shadow-sp-accent/20"
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
              </div>
            )}
          </div>
      </div>

      {/* 컨텐츠 영역 */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
            <span className="material-symbols-outlined text-4xl mb-3">people</span>
            <p className="text-sm">먼저 명렬 관리에서 학생을 등록해주세요.</p>
            <p className="text-xs mt-1 text-sp-muted/60">담임업무 → 명렬 관리 탭에서 학생을 추가할 수 있습니다.</p>
          </div>
        ) : (
          <>
            {/* 교탁 (학생 시점: 위, 교사 시점: 아래) */}
            {!isTeacherView && (
              <div className="w-full max-w-2xl mb-10 flex flex-col items-center">
                <div className="w-64 h-12 bg-sp-card border border-sp-border rounded-b-xl flex items-center justify-center shadow-lg relative after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-1 after:bg-sp-accent/50">
                  <span className="text-sp-muted text-sm font-bold tracking-widest">
                    [ 교 탁 ]
                  </span>
                </div>
              </div>
            )}

            {/* 편집 모드 안내 배너 */}
            {isEditing && (
              <div className="w-full max-w-6xl mx-auto mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sm text-sp-accent">
                <span className="material-symbols-outlined text-base">info</span>
                <span>편집 모드: 학생을 드래그하여 자리를 변경할 수 있습니다</span>
              </div>
            )}

            {/* 좌석 그리드 */}
            {layout === 'group' ? (
              <GroupSeatingView
                groups={seating.groups ?? []}
                isEditing={isEditing}
                onUpdateGroups={(groups) => void updateGroups(groups)}
                onShuffleGroups={(count, max) => void shuffleGroupSeating(count, max)}
              />
            ) : seating.pairMode ? (
              /* ── 짝꿍 모드 그리드 ── */
              <div className="w-full max-w-6xl mx-auto pb-8 flex flex-col gap-5">
                {Array.from({ length: seating.rows }, (_, vi) => {
                  // 교사 시점: 행 반전
                  const ri = isTeacherView ? seating.rows - 1 - vi : vi;
                  const row = seating.seats[ri]!;
                  const mode = seating.oddColumnMode ?? 'single';
                  // buildPairGroups로 짝 그룹 생성
                  const basePairs = buildPairGroups(seating.cols, seating.cols % 2 !== 0 ? mode : 'single');
                  // 짝수 열 + 3인짝 모드: 행별로 solo 학생을 이전 짝에 합류
                  const pairs = (mode === 'triple' && seating.cols % 2 === 0)
                    ? adjustPairGroupsForRow(basePairs, row)
                    : basePairs;
                  // 교사 시점: 짝 그룹 순서 반전
                  const orderedPairs = isTeacherView ? [...pairs].reverse() : pairs;

                  return (
                    <div
                      key={ri}
                      className="flex items-stretch justify-center gap-6"
                    >
                      {orderedPairs.map((pair, pi) => {
                        const isSingleSeat = pair.startCol === pair.endCol;
                        const isTriple = pair.endCol - pair.startCol === 2;

                        if (isTriple) {
                          // 3인 그룹
                          const colsInGroup = isTeacherView
                            ? [pair.endCol, pair.startCol + 1, pair.startCol]
                            : [pair.startCol, pair.startCol + 1, pair.endCol];
                          return (
                            <div
                              key={pi}
                              className="flex bg-sp-card/30 rounded-lg"
                              style={{ minWidth: 420 }}
                            >
                              {colsInGroup.map((c, ci) => (
                                <div key={c} className="flex-1">
                                  <SeatCard
                                    row={ri}
                                    col={c}
                                    studentId={row[c] ?? null}
                                    isDragOver={dragTarget !== null && dragTarget.row === ri && dragTarget.col === c}
                                    isDragSource={dragSource !== null && dragSource.row === ri && dragSource.col === c}
                                    isEditing={isEditing}
                                    isLeftOfPair={ci === 0}
                                    isRightOfPair={ci === colsInGroup.length - 1}
                                    onDragStart={handleDragStart}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onDragEnd={handleDragEnd}
                                    onEditSave={handleEditSave}
                                  />
                                </div>
                              ))}
                            </div>
                          );
                        }

                        // 교사 시점: 짝꿍 내부 좌우도 반전
                        const leftCol = isTeacherView ? pair.endCol : pair.startCol;
                        const rightCol = isTeacherView ? pair.startCol : pair.endCol;
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
                                col={leftCol}
                                studentId={row[leftCol] ?? null}
                                isDragOver={dragTarget !== null && dragTarget.row === ri && dragTarget.col === leftCol}
                                isDragSource={dragSource !== null && dragSource.row === ri && dragSource.col === leftCol}
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
                                  col={rightCol}
                                  studentId={row[rightCol] ?? null}
                                  isDragOver={dragTarget !== null && dragTarget.row === ri && dragTarget.col === rightCol}
                                  isDragSource={dragSource !== null && dragSource.row === ri && dragSource.col === rightCol}
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
                {Array.from({ length: seating.rows }, (_, vi) =>
                  Array.from({ length: seating.cols }, (_, vj) => {
                    // 교사 시점: 상하좌우 반전 (180도 회전)
                    const ri = isTeacherView ? seating.rows - 1 - vi : vi;
                    const ci = isTeacherView ? seating.cols - 1 - vj : vj;
                    const studentId = seating.seats[ri]?.[ci] ?? null;
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

            {/* 교탁 (교사 시점: 아래) */}
            {isTeacherView && (
              <div className="w-full max-w-2xl mt-6 mb-4 flex flex-col items-center">
                <div className="w-64 h-12 bg-sp-card border border-sp-border rounded-t-xl flex items-center justify-center shadow-lg relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-1 after:bg-sp-accent/50">
                  <span className="text-sp-muted text-sm font-bold tracking-widest">
                    [ 교 탁 ]
                  </span>
                </div>
              </div>
            )}

            {/* 하단 정보 */}
            <div className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-sp-muted py-4 border-t border-sp-border/50">
              <div className="flex items-center gap-4">
                <span>총 {totalStudents}명</span>
                <span className="text-sp-border">|</span>
                {/* 열 × 행 크기 조절 컨트롤 */}
                {layout === 'grid' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void resizeGrid(seating.rows, seating.cols - 1)}
                      disabled={seating.cols <= 1}
                      className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="열 줄이기"
                    >
                      <span className="material-symbols-outlined text-icon-xs">remove</span>
                    </button>
                    <span className="w-4 text-center">{seating.cols}</span>
                    <button
                      onClick={() => void resizeGrid(seating.rows, seating.cols + 1)}
                      disabled={seating.cols >= 10}
                      className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="열 늘리기"
                    >
                      <span className="material-symbols-outlined text-icon-xs">add</span>
                    </button>
                    <span className="ml-0.5">열</span>
                    <span className="mx-1 text-sp-border">×</span>
                    <button
                      onClick={() => void resizeGrid(seating.rows - 1, seating.cols)}
                      disabled={seating.rows <= 1}
                      className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="행 줄이기"
                    >
                      <span className="material-symbols-outlined text-icon-xs">remove</span>
                    </button>
                    <span className="w-4 text-center">{seating.rows}</span>
                    <button
                      onClick={() => void resizeGrid(seating.rows + 1, seating.cols)}
                      disabled={seating.rows >= 10}
                      className="w-5 h-5 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="행 늘리기"
                    >
                      <span className="material-symbols-outlined text-icon-xs">add</span>
                    </button>
                    <span className="ml-0.5">행</span>
                  </div>
                )}
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
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
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
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
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

      {/* 모둠 셔플 애니메이션 오버레이 */}
      {showGroupShuffle && (
        <GroupShuffleOverlay
          groups={seating.groups ?? []}
          students={students}
          onComplete={() => setShowGroupShuffle(false)}
        />
      )}

      {/* 배치 조건 모달 */}
      <SeatZoneModal
        open={showConstraintModal}
        onClose={() => setShowConstraintModal(false)}
      />
      </div>
    </div>
  );
}
