import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useToolSound } from '@adapters/hooks/useToolSound';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { shuffleArray } from '@domain/rules/randomRules';
import { validateConstraints } from '@domain/rules/seatRules';
import { seatingRepository } from '@adapters/di/container';
import { useSeatConstraintsStore } from '@adapters/stores/useSeatConstraintsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { TeachingClassSeating } from '@domain/entities/TeachingClass';

/* ─── Types ─────────────────────────────────────────────── */

interface ToolSeatPickerProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type Phase = 'setup' | 'picking' | 'complete';
type OrderMode = 'number' | 'numberReverse' | 'random' | 'direct';
type AdvanceMode = 'manual' | 'auto';
type SeatDataSource = 'homeroom' | 'teachingClass';

interface SeatPosition {
  row: number;
  col: number;
}

interface Assignment {
  row: number;
  col: number;
}

/* ─── Component ─────────────────────────────────────────── */

export function ToolSeatPicker({ onBack, isFullscreen }: ToolSeatPickerProps) {
  const { track } = useAnalytics();
  const { playResult: playAssignSound } = useToolSound('seatPicker');
  useEffect(() => {
    track('tool_use', { tool: 'seat_picker' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const students = useStudentStore((s) => s.students);
  const getStudent = useStudentStore((s) => s.getStudent);
  const seating = useSeatingStore((s) => s.seating);
  const loaded = useSeatingStore((s) => s.loaded);
  const loadSeating = useSeatingStore((s) => s.load);
  const resizeGrid = useSeatingStore((s) => s.resizeGrid);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const updateClass = useTeachingClassStore((s) => s.updateClass);

  /* ─── Setup state ─── */
  const [phase, setPhase] = useState<Phase>('setup');
  const [orderMode, setOrderMode] = useState<OrderMode>('number');
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>('manual');
  const [seatDataSource, setSeatDataSource] = useState<SeatDataSource>('homeroom');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  /* ─── Picking state ─── */
  const [studentOrder, setStudentOrder] = useState<Student[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pickingRows, setPickingRows] = useState(0);
  const [pickingCols, setPickingCols] = useState(0);
  const [assignments, setAssignments] = useState<Map<string, Assignment>>(new Map());
  const [shuffledSeats, setShuffledSeats] = useState<SeatPosition[]>([]);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [lastAssigned, setLastAssigned] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupText, setPopupText] = useState('');
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  /* ─── Blocked / Fixed seat state ─── */
  const [blockedSeats, setBlockedSeats] = useState<Set<string>>(new Set());
  const [fixedStudents, setFixedStudents] = useState<Map<string, string>>(new Map()); // key: "row-col", value: studentId
  const [seatConfigOpen, setSeatConfigOpen] = useState(false);
  const [seatConfigMode, setSeatConfigMode] = useState<'block' | 'fix'>('block');
  const [fixPickerSeat, setFixPickerSeat] = useState<string | null>(null); // "row-col" of seat showing student picker

  /* ─── Complete state ─── */
  const [showSaveModal, setShowSaveModal] = useState(false);

  /* ─── Refs ─── */
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── Load seating on mount ─── */
  useEffect(() => {
    if (!loaded) loadSeating();
    if (!tcLoaded) loadTc();
  }, [loaded, loadSeating, tcLoaded, loadTc]);

  /* ─── Cleanup timers ─── */
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  /* ─── Derived values ─── */
  const selectedTc = teachingClasses.find((c) => c.id === selectedClassId) ?? null;

  const tcStudentsAsStudents = useMemo((): Student[] => {
    if (!selectedTc) return [];
    return selectedTc.students
      .filter((s) => !s.isVacant)
      .map((s) => ({
        id: `tc-${selectedTc.id}-${s.number}`,
        studentNumber: s.number,
        name: s.name?.trim() ? s.name : `${s.number}번`,
        isVacant: false,
      }));
  }, [selectedTc]);

  const tcSeatingRows = selectedTc?.seating?.rows ?? 0;
  const tcSeatingCols = selectedTc?.seating?.cols ?? 0;

  const activeStudents = seatDataSource === 'homeroom'
    ? students.filter((s) => !s.isVacant)
    : tcStudentsAsStudents;
  const effectiveRows = seatDataSource === 'homeroom' ? seating.rows : tcSeatingRows;
  const effectiveCols = seatDataSource === 'homeroom' ? seating.cols : tcSeatingCols;
  const totalSeats = effectiveRows * effectiveCols;
  const availableSeats = totalSeats - blockedSeats.size;
  const unfixedStudentCount = activeStudents.length - fixedStudents.size;
  const hasSeatingData = effectiveRows > 0 && effectiveCols > 0;
  const needsAutoGrid = seatDataSource === 'teachingClass' && selectedTc !== null && !selectedTc.seating && activeStudents.length > 0;
  const studentShortage = !needsAutoGrid && activeStudents.length > availableSeats;
  const canStart = seatDataSource === 'homeroom'
    ? hasSeatingData && activeStudents.length > 0 && !studentShortage && fixedStudents.size <= availableSeats
    : selectedTc !== null && activeStudents.length > 0 && (hasSeatingData || needsAutoGrid);

  const assignedCount = assignments.size;
  const totalStudents = studentOrder.length;
  const isPickingDone = currentIndex >= totalStudents && totalStudents > 0;

  /* ─── Start picking ─── */
  const handleStart = useCallback(() => {
    // Separate fixed students from the rest
    const fixedStudentIds = new Set(fixedStudents.values());
    const unfixedActive = activeStudents.filter((s) => !fixedStudentIds.has(s.id));

    let ordered: Student[];
    if (orderMode === 'random') {
      ordered = shuffleArray(unfixedActive);
    } else if (orderMode === 'numberReverse') {
      ordered = [...unfixedActive].sort(
        (a, b) => (b.studentNumber ?? 0) - (a.studentNumber ?? 0),
      );
    } else {
      ordered = [...unfixedActive].sort(
        (a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0),
      );
    }

    // For teaching class with no seating, auto-generate grid
    let rows = effectiveRows;
    let cols = effectiveCols;
    if (needsAutoGrid) {
      cols = Math.max(1, Math.ceil(Math.sqrt(activeStudents.length)));
      rows = Math.max(1, Math.ceil(activeStudents.length / cols));
    }

    // Generate available seat positions (exclude blocked and fixed seats)
    const allSeats: SeatPosition[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}-${c}`;
        if (!blockedSeats.has(key) && !fixedStudents.has(key)) {
          allSeats.push({ row: r, col: c });
        }
      }
    }
    const shuffled = shuffleArray(allSeats);

    // Pre-assign fixed students
    const preAssignments = new Map<string, Assignment>();
    for (const [seatKey, studentId] of fixedStudents.entries()) {
      const [rStr, cStr] = seatKey.split('-');
      preAssignments.set(studentId, { row: parseInt(rStr!, 10), col: parseInt(cStr!, 10) });
    }

    setPickingRows(rows);
    setPickingCols(cols);
    setStudentOrder(ordered);
    setCurrentIndex(0);
    setAssignments(preAssignments);
    setShuffledSeats(shuffled);
    setFlippedCards(new Set());
    setLastAssigned(null);
    setShowPopup(false);
    setWaitingForNext(false);
    setIsPaused(false);
    setPhase('picking');
  }, [activeStudents, orderMode, effectiveRows, effectiveCols, needsAutoGrid, blockedSeats, fixedStudents]);

  /* ─── Handle card click ─── */
  const handleCardClick = useCallback(
    (cardIndex: number) => {
      if (isPaused || waitingForNext || showPopup || isPickingDone) return;
      if (flippedCards.has(cardIndex)) return;

      const seat = shuffledSeats[cardIndex];
      if (!seat) return;
      const currentStudent = studentOrder[currentIndex];
      if (!currentStudent) return;

      // Flip the card
      setFlippedCards((prev) => new Set(prev).add(cardIndex));
      playAssignSound();

      // Assign student to this seat
      const newAssignments = new Map(assignments);
      newAssignments.set(currentStudent.id, { row: seat.row, col: seat.col });
      setAssignments(newAssignments);

      // Highlight
      setLastAssigned(currentStudent.id);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setLastAssigned(null);
      }, 3000);

      // Show popup
      const label = `${seat.row + 1}행 ${seat.col + 1}열`;
      setPopupText(`${currentStudent.name} → ${label}!`);
      setShowPopup(true);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      popupTimerRef.current = setTimeout(() => {
        setShowPopup(false);

        const nextIndex = currentIndex + 1;
        if (nextIndex >= totalStudents) {
          // All done
          setCurrentIndex(nextIndex);
          setTimeout(() => setPhase('complete'), 500);
        } else if (advanceMode === 'auto') {
          // Block card clicks during auto-advance wait
          setWaitingForNext(true);
          if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = setTimeout(() => {
            setWaitingForNext(false);
            setCurrentIndex(nextIndex);
          }, 2000);
        } else {
          setWaitingForNext(true);
        }
      }, 1500);
    },
    [
      isPaused,
      waitingForNext,
      showPopup,
      isPickingDone,
      flippedCards,
      shuffledSeats,
      studentOrder,
      currentIndex,
      assignments,
      totalStudents,
      advanceMode,
    ],
  );

  /* ─── Helper: find assignment for a seat position ─── */
  const getAssignmentForSeat = useCallback(
    (row: number, col: number): { studentId: string; student: Student } | null => {
      for (const [studentId, pos] of assignments.entries()) {
        if (pos.row === row && pos.col === col) {
          const student = getStudent(studentId)
            ?? tcStudentsAsStudents.find((s) => s.id === studentId)
            ?? null;
          if (student) return { studentId, student };
        }
      }
      return null;
    },
    [assignments, getStudent, tcStudentsAsStudents],
  );

  /* ─── Handle direct seat click (direct mode) ─── */
  const handleDirectSeatClick = useCallback(
    (row: number, col: number) => {
      if (isPaused || showPopup || isPickingDone) return;
      if (getAssignmentForSeat(row, col)) return;

      const currentStudent = studentOrder[currentIndex];
      if (!currentStudent) return;

      const newAssignments = new Map(assignments);
      newAssignments.set(currentStudent.id, { row, col });
      setAssignments(newAssignments);

      setLastAssigned(currentStudent.id);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setLastAssigned(null);
      }, 3000);

      const label = `${row + 1}행 ${col + 1}열`;
      setPopupText(`${currentStudent.name} → ${label}!`);
      setShowPopup(true);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      popupTimerRef.current = setTimeout(() => {
        setShowPopup(false);
        const nextIndex = currentIndex + 1;
        if (nextIndex >= totalStudents) {
          setCurrentIndex(nextIndex);
          setTimeout(() => setPhase('complete'), 500);
        } else {
          setCurrentIndex(nextIndex);
        }
      }, 1000);
    },
    [
      isPaused,
      showPopup,
      isPickingDone,
      getAssignmentForSeat,
      studentOrder,
      currentIndex,
      assignments,
      totalStudents,
    ],
  );

  /* ─── Advance to next student (manual mode) ─── */
  const handleNext = useCallback(() => {
    setWaitingForNext(false);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  /* ─── Reset to setup ─── */
  const handleReset = useCallback(() => {
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setPhase('setup');
    setAssignments(new Map());
    setFlippedCards(new Set());
    setCurrentIndex(0);
    setShowPopup(false);
    setWaitingForNext(false);
    setIsPaused(false);
    setPickingRows(0);
    setPickingCols(0);
    setFixPickerSeat(null);
  }, []);

  /* ─── Save to seating store ─── */
  const handleSave = useCallback(async () => {
    const rows = pickingRows || (seatDataSource === 'homeroom' ? seating.rows : tcSeatingRows);
    const cols = pickingCols || (seatDataSource === 'homeroom' ? seating.cols : tcSeatingCols);

    const newSeats: (string | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: (string | null)[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(null);
      }
      newSeats.push(row);
    }

    if (seatDataSource === 'homeroom') {
      assignments.forEach((pos, studentId) => {
        const r = newSeats[pos.row];
        if (r) r[pos.col] = studentId;
      });

      const newSeating: SeatingData = { rows, cols, seats: newSeats };
      const constraints = useSeatConstraintsStore.getState().constraints;
      const { valid } = validateConstraints(newSeating.seats, constraints, rows, cols);

      try {
        await seatingRepository.saveSeating(newSeating);
        useSeatingStore.setState({ seating: newSeating });
        if (!valid) {
          useToastStore.getState().show('일부 배치 조건을 만족하지 못한 좌석이 있습니다', 'info');
        } else {
          useToastStore.getState().show('학급 자리 배치가 업데이트되었습니다', 'success');
        }
        setShowSaveModal(false);
      } catch {
        useToastStore.getState().show('저장에 실패했습니다', 'error');
      }
    } else if (selectedTc) {
      assignments.forEach((pos, syntheticId) => {
        const parts = syntheticId.split('-');
        const num = parseInt(parts[parts.length - 1] ?? '0', 10);
        const student = selectedTc.students.find((s) => s.number === num);
        if (student) {
          const r = newSeats[pos.row];
          if (r) r[pos.col] = studentKey(student);
        }
      });

      const tcSeating: TeachingClassSeating = { rows, cols, seats: newSeats };
      const updated = { ...selectedTc, seating: tcSeating, updatedAt: new Date().toISOString() };

      try {
        await updateClass(updated);
        useToastStore.getState().show(`${selectedTc.name} 자리 배치가 업데이트되었습니다`, 'success');
        setShowSaveModal(false);
      } catch {
        useToastStore.getState().show('저장에 실패했습니다', 'error');
      }
    }
  }, [assignments, seatDataSource, seating.rows, seating.cols, tcSeatingRows, tcSeatingCols, pickingRows, pickingCols, selectedTc, updateClass]);

  /* ─── Fullscreen toggle ─── */
  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        /* ignored */
      });
    } else {
      document.exitFullscreen().catch(() => {
        /* ignored */
      });
    }
  }, []);

  /* ─── Loading state ─── */
  if (!loaded || !tcLoaded) {
    return (
      <ToolLayout title="자리 뽑기" emoji="🪑" onBack={onBack} isFullscreen={isFullscreen}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sp-muted text-lg">불러오는 중...</div>
        </div>
      </ToolLayout>
    );
  }

  /* ═══════════════════════════════════════════════════════ */
  /* Phase 1: Setup                                         */
  /* ═══════════════════════════════════════════════════════ */
  if (phase === 'setup') {
    return (
      <ToolLayout title="자리 뽑기" emoji="🪑" onBack={onBack} isFullscreen={isFullscreen}>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-4 overflow-auto">
          <div className="w-full max-w-lg flex flex-col gap-5 px-4">
            {/* Title card */}
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 text-center">
              <p className="text-3xl mb-2">🪑</p>
              <h2 className="text-xl font-bold text-sp-text mb-1">자리 뽑기</h2>
              <p className="text-sp-muted text-sm">
                학생들이 한 명씩 카드를 뽑아 자리를 배정받습니다
              </p>
            </div>

            {/* Data source selector */}
            <div className="bg-sp-card border border-sp-border rounded-xl p-5">
              <p className="text-sp-text font-medium mb-3">학생 데이터</p>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setSeatDataSource('homeroom'); setSelectedClassId(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    seatDataSource === 'homeroom'
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                  }`}
                >
                  <span>👩‍🎓</span>
                  <span>학급 자리 배치</span>
                </button>
                <button
                  onClick={() => setSeatDataSource('teachingClass')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    seatDataSource === 'teachingClass'
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                  }`}
                >
                  <span>📚</span>
                  <span>수업반</span>
                </button>
              </div>
              {seatDataSource === 'teachingClass' && (
                <div>
                  {teachingClasses.length === 0 ? (
                    <div className="text-center py-3 text-sp-muted text-sm">
                      수업관리에서 먼저 반을 등록하세요
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {teachingClasses.map((tc) => {
                        const activeCount = tc.students.filter((s) => !s.isVacant).length;
                        return (
                          <button
                            key={tc.id}
                            onClick={() => setSelectedClassId(tc.id)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                              selectedClassId === tc.id
                                ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                                : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                            }`}
                          >
                            {tc.name}
                            {tc.subject && <span className="text-sp-muted/70"> · {tc.subject}</span>}
                            <span className="text-sp-muted/70 ml-1">({activeCount}명)</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {seatDataSource === 'teachingClass' && !selectedTc ? (
              <div className="bg-sp-card border border-amber-500/30 rounded-xl p-6 text-center">
                <p className="text-amber-400 text-sm">위에서 수업반을 선택해주세요</p>
              </div>
            ) : seatDataSource === 'teachingClass' && activeStudents.length === 0 ? (
              <div className="bg-sp-card border border-amber-500/30 rounded-xl p-6 text-center">
                <p className="text-amber-400 text-sm">수업관리에서 먼저 학생을 등록하세요</p>
              </div>
            ) : !hasSeatingData && !needsAutoGrid ? (
              /* No seating data */
              <div className="bg-sp-card border border-amber-500/30 rounded-xl p-6 text-center">
                <p className="text-amber-400 text-sm">
                  먼저 학급 자리 배치에서 학생과 자리를 등록해주세요
                </p>
              </div>
            ) : (
              <>
                {/* Info card */}
                <div className="bg-sp-card border border-sp-border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-lg">👩‍🎓</span>
                      </div>
                      <div>
                        <p className="text-sp-text font-medium">학생 수</p>
                        <p className="text-sp-accent text-lg font-bold">
                          {activeStudents.length}명
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <span className="text-lg">🪑</span>
                      </div>
                      <div>
                        <p className="text-sp-text font-medium">좌석 수</p>
                        <p className={`${needsAutoGrid ? 'text-blue-300' : 'text-green-400'} text-lg font-bold`}>
                          {needsAutoGrid
                            ? '자동 생성'
                            : `${effectiveRows}행 × ${effectiveCols}열 = ${totalSeats}석`}
                        </p>
                      </div>
                    </div>
                  </div>
                  {(blockedSeats.size > 0 || fixedStudents.size > 0) && (
                    <div className="bg-sp-surface rounded-lg px-4 py-2.5 text-sp-muted text-sm mb-2 flex items-center gap-3">
                      {blockedSeats.size > 0 && <span>🚫 빈자리 {blockedSeats.size}개</span>}
                      {fixedStudents.size > 0 && <span>📌 고정 {fixedStudents.size}명</span>}
                      <span className="ml-auto text-sp-text font-medium">사용 가능 {availableSeats - fixedStudents.size}석</span>
                    </div>
                  )}
                  {studentShortage && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                      좌석이 부족합니다 (학생 {activeStudents.length}명 &gt; 사용 가능 좌석 {availableSeats}석)
                    </div>
                  )}
                  {!studentShortage && !needsAutoGrid && unfixedStudentCount < (availableSeats - fixedStudents.size) && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5 text-blue-300 text-sm">
                      {availableSeats - fixedStudents.size - unfixedStudentCount}개 좌석이 비게 됩니다
                    </div>
                  )}
                </div>

                {/* Row/Col adjustment (homeroom only) */}
                {seatDataSource === 'homeroom' && (
                <div className="bg-sp-card border border-sp-border rounded-xl p-5">
                  <p className="text-sp-text font-medium mb-3">좌석 행/열 조절</p>
                  <div className="flex items-center justify-center gap-8">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-sp-muted">행</span>
                      <button
                        onClick={() => void resizeGrid(seating.rows - 1, seating.cols)}
                        disabled={seating.rows <= 1}
                        className="w-8 h-8 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sp-text font-bold">{seating.rows}</span>
                      <button
                        onClick={() => void resizeGrid(seating.rows + 1, seating.cols)}
                        disabled={seating.rows >= 10}
                        className="w-8 h-8 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-sp-muted">열</span>
                      <button
                        onClick={() => void resizeGrid(seating.rows, seating.cols - 1)}
                        disabled={seating.cols <= 1}
                        className="w-8 h-8 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sp-text font-bold">{seating.cols}</span>
                      <button
                        onClick={() => void resizeGrid(seating.rows, seating.cols + 1)}
                        disabled={seating.cols >= 10}
                        className="w-8 h-8 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {/* Seat configuration (blocked / fixed) */}
                {hasSeatingData && !needsAutoGrid && (
                <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setSeatConfigOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-4 text-sp-text font-medium hover:bg-sp-surface/50 transition-colors"
                  >
                    <span>좌석 설정</span>
                    <span className="text-sp-muted text-sm flex items-center gap-2">
                      {(blockedSeats.size > 0 || fixedStudents.size > 0) && (
                        <span className="text-xs bg-sp-accent/20 text-sp-accent px-2 py-0.5 rounded-full">
                          {blockedSeats.size > 0 && `빈자리 ${blockedSeats.size}`}
                          {blockedSeats.size > 0 && fixedStudents.size > 0 && ' · '}
                          {fixedStudents.size > 0 && `고정 ${fixedStudents.size}`}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-icon-md transition-transform" style={{ transform: seatConfigOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                    </span>
                  </button>
                  {seatConfigOpen && (
                    <div className="px-5 pb-5 border-t border-sp-border pt-4">
                      {/* Mode tabs */}
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={() => { setSeatConfigMode('block'); setFixPickerSeat(null); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            seatConfigMode === 'block'
                              ? 'bg-red-500/20 border-red-500/50 text-red-400'
                              : 'bg-sp-surface border-sp-border text-sp-muted hover:border-red-500/30 hover:text-sp-text'
                          }`}
                        >
                          🚫 빈자리 지정
                        </button>
                        <button
                          onClick={() => { setSeatConfigMode('fix'); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            seatConfigMode === 'fix'
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-sp-surface border-sp-border text-sp-muted hover:border-amber-500/30 hover:text-sp-text'
                          }`}
                        >
                          📌 학생 고정
                        </button>
                      </div>

                      {/* Mini seat grid */}
                      <div className="bg-sp-surface rounded-lg py-1.5 px-4 text-center mb-2">
                        <span className="text-sp-muted text-xs font-medium">교탁</span>
                      </div>
                      <div
                        className="grid gap-1.5 mx-auto mb-3"
                        style={{
                          gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
                          maxWidth: `${effectiveCols * 64}px`,
                        }}
                      >
                        {Array.from({ length: effectiveRows }, (_, r) =>
                          Array.from({ length: effectiveCols }, (_, c) => {
                            const key = `${r}-${c}`;
                            const isBlocked = blockedSeats.has(key);
                            const fixedStudentId = fixedStudents.get(key);
                            const fixedStudent = fixedStudentId
                              ? activeStudents.find((s) => s.id === fixedStudentId) ?? null
                              : null;
                            const isShowingPicker = fixPickerSeat === key;

                            // Available students for fix picker (not already fixed elsewhere)
                            const alreadyFixed = new Set(fixedStudents.values());

                            return (
                              <div key={key} className="relative">
                                <button
                                  onClick={() => {
                                    if (seatConfigMode === 'block') {
                                      if (fixedStudentId) return; // can't block a fixed seat
                                      setBlockedSeats((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    } else {
                                      if (isBlocked) return; // can't fix a blocked seat
                                      if (fixedStudentId) {
                                        // remove fix
                                        setFixedStudents((prev) => {
                                          const next = new Map(prev);
                                          next.delete(key);
                                          return next;
                                        });
                                        setFixPickerSeat(null);
                                      } else {
                                        setFixPickerSeat(isShowingPicker ? null : key);
                                      }
                                    }
                                  }}
                                  className={`
                                    w-full aspect-square rounded-lg flex flex-col items-center justify-center text-center text-xs transition-all
                                    ${isBlocked
                                      ? seatConfigMode === 'block'
                                        ? 'bg-red-500/20 border-2 border-red-500/50 text-red-400 hover:bg-red-500/30'
                                        : 'bg-red-500/10 border border-red-500/20 text-red-400/50 cursor-not-allowed'
                                      : fixedStudent
                                        ? seatConfigMode === 'fix'
                                          ? 'bg-amber-500/20 border-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                                          : 'bg-amber-500/10 border border-amber-500/20 text-amber-400/50 cursor-not-allowed'
                                        : seatConfigMode === 'block'
                                          ? 'bg-sp-card border border-sp-border hover:bg-red-500/10 hover:border-red-500/30 text-sp-muted'
                                          : 'bg-sp-card border border-sp-border hover:bg-amber-500/10 hover:border-amber-500/30 text-sp-muted'
                                    }
                                  `}
                                >
                                  {isBlocked ? (
                                    <span className="text-sm font-bold">✕</span>
                                  ) : fixedStudent ? (
                                    <>
                                      <span className="text-caption leading-none">📌</span>
                                      <span className="truncate w-full text-caption font-medium leading-tight">{fixedStudent.name}</span>
                                    </>
                                  ) : (
                                    <span className="text-sp-muted/60 leading-tight">{r + 1},{c + 1}</span>
                                  )}
                                </button>

                                {/* Student picker dropdown */}
                                {isShowingPicker && seatConfigMode === 'fix' && (
                                  <div className="absolute z-30 top-full left-0 mt-1 w-36 max-h-40 overflow-auto bg-sp-card border border-sp-border rounded-lg shadow-xl">
                                    {activeStudents
                                      .filter((s) => !alreadyFixed.has(s.id) || s.id === fixedStudentId)
                                      .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0))
                                      .map((s) => (
                                        <button
                                          key={s.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setFixedStudents((prev) => {
                                              const next = new Map(prev);
                                              next.set(key, s.id);
                                              return next;
                                            });
                                            setFixPickerSeat(null);
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-sp-accent/20 transition-colors"
                                        >
                                          {s.studentNumber ?? '-'}번 {s.name}
                                        </button>
                                      ))}
                                    {activeStudents.filter((s) => !alreadyFixed.has(s.id) || s.id === fixedStudentId).length === 0 && (
                                      <div className="px-3 py-2 text-xs text-sp-muted">배정 가능한 학생 없음</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }),
                        )}
                      </div>

                      {/* Summary + reset */}
                      <div className="flex items-center justify-between text-xs text-sp-muted">
                        <span>
                          {blockedSeats.size > 0 && `빈자리 ${blockedSeats.size}개`}
                          {blockedSeats.size > 0 && fixedStudents.size > 0 && ' · '}
                          {fixedStudents.size > 0 && `고정 ${fixedStudents.size}명`}
                          {blockedSeats.size === 0 && fixedStudents.size === 0 && '좌석을 클릭하여 설정하세요'}
                        </span>
                        {(blockedSeats.size > 0 || fixedStudents.size > 0) && (
                          <button
                            onClick={() => {
                              setBlockedSeats(new Set());
                              setFixedStudents(new Map());
                              setFixPickerSeat(null);
                            }}
                            className="text-red-400 hover:text-red-300 transition-colors font-medium"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* Student order */}
                <div className="bg-sp-card border border-sp-border rounded-xl p-5">
                  <p className="text-sp-text font-medium mb-3">뽑기 순서</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOrderMode('number')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                        orderMode === 'number'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span>🔢</span>
                      <span>번호순</span>
                    </button>
                    <button
                      onClick={() => setOrderMode('numberReverse')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                        orderMode === 'numberReverse'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span>🔃</span>
                      <span>번호역순</span>
                    </button>
                    <button
                      onClick={() => setOrderMode('random')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                        orderMode === 'random'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span>🔀</span>
                      <span>랜덤</span>
                    </button>
                    <button
                      onClick={() => setOrderMode('direct')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                        orderMode === 'direct'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span>✏️</span>
                      <span>직접지정</span>
                    </button>
                  </div>
                </div>

                {/* Advance mode (hidden in direct mode) */}
                {orderMode !== 'direct' && <div className="bg-sp-card border border-sp-border rounded-xl p-5">
                  <p className="text-sp-text font-medium mb-3">진행 방식</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAdvanceMode('manual')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                        advanceMode === 'manual'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span className="material-symbols-outlined text-icon-md">touch_app</span>
                      <span>수동 진행</span>
                    </button>
                    <button
                      onClick={() => setAdvanceMode('auto')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                        advanceMode === 'auto'
                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                      }`}
                    >
                      <span className="material-symbols-outlined text-icon-md">play_arrow</span>
                      <span>자동 진행</span>
                    </button>
                  </div>
                  <p className="text-sp-muted text-xs mt-2">
                    {advanceMode === 'manual'
                      ? '카드를 뽑은 후 버튼을 눌러 다음 학생으로 전환합니다'
                      : '카드를 뽑은 후 2초 뒤 자동으로 다음 학생으로 전환합니다'}
                  </p>
                </div>}

                {/* Direct mode hint */}
                {orderMode === 'direct' && (
                  <div className="bg-sp-card border border-sp-border rounded-xl p-5">
                    <p className="text-sp-text font-medium mb-2">직접 지정 모드</p>
                    <p className="text-sp-muted text-xs">
                      학급 자리 배치도에서 빈 좌석을 클릭하여 학생의 자리를 직접 지정합니다
                    </p>
                  </div>
                )}

                {/* Start button */}
                <button
                  onClick={handleStart}
                  disabled={!canStart}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-sp-accent to-blue-400 text-white text-lg font-bold shadow-lg hover:from-blue-400 hover:to-sp-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transform"
                >
                  🎲 자리 뽑기 시작!
                </button>
              </>
            )}
          </div>
        </div>
      </ToolLayout>
    );
  }

  /* ═══════════════════════════════════════════════════════ */
  /* Phase 2: Picking                                       */
  /* ═══════════════════════════════════════════════════════ */
  if (phase === 'picking') {
    const currentStudent = studentOrder[currentIndex] as Student | undefined;
    const remainingCards = shuffledSeats
      .map((_, i) => i)
      .filter((i) => !flippedCards.has(i));

    return (
      <ToolLayout title="자리 뽑기" emoji="🪑" onBack={onBack} isFullscreen={isFullscreen}>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Progress bar */}
          <div className="px-4 mb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sp-muted text-xs">배정 진행</span>
              <span className="text-sp-accent text-sm font-bold">
                {assignedCount}/{totalStudents} 배정 완료
              </span>
            </div>
            <div className="h-2 bg-sp-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sp-accent to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${totalStudents > 0 ? (assignedCount / totalStudents) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Main 2-column layout */}
          <div className="flex-1 flex flex-col md:flex-row gap-4 px-4 min-h-0 overflow-auto">
            {/* Left column: Seat Grid */}
            <div className="md:w-1/2 flex flex-col min-h-0">
              {/* 교탁 */}
              <div className="bg-sp-surface rounded-lg py-1.5 px-4 text-center mb-3 flex-shrink-0">
                <span className="text-sp-muted text-xs font-medium">교탁</span>
              </div>

              {/* Seat grid */}
              <div className="flex-1 overflow-auto">
                <div
                  className="grid gap-1.5 mx-auto"
                  style={{
                    gridTemplateColumns: `repeat(${pickingCols || effectiveCols}, minmax(0, 1fr))`,
                    maxWidth: `${(pickingCols || effectiveCols) * 72}px`,
                  }}
                >
                  {Array.from({ length: pickingRows || effectiveRows }, (_, r) =>
                    Array.from({ length: pickingCols || effectiveCols }, (_, c) => {
                      const seatKey = `${r}-${c}`;
                      const isBlocked = blockedSeats.has(seatKey);
                      const isFixed = fixedStudents.has(seatKey);
                      const assigned = getAssignmentForSeat(r, c);
                      const isLastAssigned =
                        assigned !== null && assigned.studentId === lastAssigned;
                      const canClickSeat =
                        orderMode === 'direct' && !assigned && !isBlocked && !isPaused && !showPopup && !isPickingDone;

                      if (isBlocked) {
                        return (
                          <div
                            key={seatKey}
                            className="w-full aspect-square rounded-lg flex flex-col items-center justify-center text-center p-1 bg-sp-surface/60 border border-sp-border/40"
                          >
                            <span className="text-red-400/60 text-sm font-bold">✕</span>
                            <span className="text-sp-muted/40 text-caption leading-tight">빈자리</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={seatKey}
                          onClick={() => canClickSeat && handleDirectSeatClick(r, c)}
                          className={`
                            w-full aspect-square rounded-lg flex flex-col items-center justify-center text-center p-1 transition-all duration-300
                            ${
                              isLastAssigned
                                ? 'bg-blue-500/40 border-2 border-blue-400 ring-2 ring-blue-400/50 animate-pulse'
                                : assigned && isFixed
                                  ? 'bg-amber-500/20 border border-amber-500/40'
                                  : assigned
                                    ? 'bg-blue-500/20 border border-blue-500/40'
                                    : canClickSeat
                                      ? 'bg-sp-card border-2 border-dashed border-sp-accent/40 cursor-pointer hover:bg-sp-accent/10 hover:border-sp-accent'
                                      : 'bg-sp-card border border-dashed border-sp-border'
                            }
                          `}
                        >
                          {assigned ? (
                            <>
                              <span className="text-sp-text text-xs font-bold truncate w-full leading-tight">
                                {isFixed && '📌'}{assigned.student.name}
                              </span>
                              <span className="text-sp-muted text-caption leading-tight">
                                {r + 1}행 {c + 1}열
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-lg font-bold leading-none ${canClickSeat ? 'text-sp-accent/60' : 'text-sp-muted'}`}>
                                {canClickSeat ? '＋' : '?'}
                              </span>
                              <span className="text-sp-muted/60 text-caption leading-tight">
                                {r + 1}행 {c + 1}열
                              </span>
                            </>
                          )}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            </div>

            {/* Right column: Picking Area */}
            <div className="md:w-1/2 flex flex-col min-h-0 gap-3">
              {/* Current student */}
              {currentStudent && (
                <div className="bg-sp-card border border-sp-accent/30 rounded-xl p-4 text-center flex-shrink-0">
                  <p className="text-sp-muted text-xs mb-1">현재 차례</p>
                  <p className="text-sp-text text-2xl font-bold">
                    🎯 {currentStudent.studentNumber ?? ''}번{' '}
                    {currentStudent.name}의 차례!
                  </p>
                  {isPaused && (
                    <p className="text-amber-400 text-sm mt-1 font-medium">
                      ⏸️ 일시정지됨
                    </p>
                  )}
                </div>
              )}

              {/* Card grid (hidden in direct mode) */}
              {orderMode === 'direct' ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center px-4">
                    <span className="text-4xl block mb-3">👈</span>
                    <p className="text-sp-text font-medium mb-1">좌석을 클릭하세요</p>
                    <p className="text-sp-muted text-sm">
                      왼쪽 학급 자리 배치도에서 빈 자리를 클릭하면<br />
                      현재 학생이 해당 자리에 배정됩니다
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <div className="flex flex-wrap gap-2 justify-center content-start py-1">
                    {shuffledSeats.map((seat, cardIdx) => {
                      const isFlipped = flippedCards.has(cardIdx);
                      const canClick =
                        !isFlipped && !isPaused && !waitingForNext && !showPopup && !isPickingDone;

                      return (
                        <div
                          key={cardIdx}
                          className="seat-card-container"
                          style={{ perspective: '800px' }}
                        >
                          <div
                            className={`relative w-16 h-20 md:w-20 md:h-24 transition-transform duration-600 ${isFlipped ? 'seat-card-flipped' : ''}`}
                            style={{ transformStyle: 'preserve-3d' }}
                          >
                            {/* Card back (face down) */}
                            <button
                              onClick={() => canClick && handleCardClick(cardIdx)}
                              disabled={!canClick}
                              className={`
                                absolute inset-0 rounded-xl flex flex-col items-center justify-center backface-hidden transition-all duration-200
                                ${isFlipped
                                  ? 'pointer-events-none'
                                  : canClick
                                    ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-2 border-amber-500/40 hover:scale-105 hover:ring-2 hover:ring-amber-400/60 hover:border-amber-400 cursor-pointer shadow-lg shadow-amber-500/10'
                                    : 'bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/20 cursor-default opacity-60'
                                }
                              `}
                            >
                              <span className="text-2xl font-bold text-amber-400">?</span>
                              <span className="text-caption text-amber-400/50 mt-0.5">
                                {cardIdx + 1}
                              </span>
                            </button>

                            {/* Card front (face up - revealed) */}
                            <div
                              className="absolute inset-0 rounded-xl flex flex-col items-center justify-center backface-hidden bg-sp-surface/80 border border-sp-border/60 pointer-events-none"
                              style={{ transform: 'rotateY(180deg)' }}
                            >
                              <span className="text-green-400 text-sm mb-0.5">✓</span>
                              <span className="text-sp-muted text-caption font-medium leading-tight">
                                {seat.row + 1}행 {seat.col + 1}열
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {remainingCards.length === 0 && !isPickingDone && (
                    <p className="text-sp-muted text-sm text-center py-4">
                      모든 카드가 사용되었습니다
                    </p>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-2 flex-shrink-0 pb-2">
                {waitingForNext && (
                  <button
                    onClick={handleNext}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-sp-accent to-blue-400 text-white font-bold text-sm hover:from-blue-400 hover:to-sp-accent transition-all active:scale-[0.98]"
                  >
                    ⏭️ 다음 학생
                  </button>
                )}
                <button
                  onClick={() => setIsPaused((p) => !p)}
                  className="px-4 py-3 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-red-400/50 transition-all text-sm font-medium"
                >
                  {isPaused ? '▶️ 재개' : '⏸️ 일시정지'}
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-red-400/50 transition-all text-sm font-medium"
                >
                  ⟲ 처음부터
                </button>
              </div>

              {/* Waiting list */}
              <div className="flex-shrink-0 bg-sp-card border border-sp-border rounded-xl p-3 max-h-36 overflow-auto">
                <p className="text-sp-muted text-xs font-medium mb-2">대기 목록</p>
                <div className="flex flex-wrap gap-1.5">
                  {studentOrder.map((s, idx) => {
                    const isDone = idx < currentIndex || assignments.has(s.id);
                    const isCurrent = idx === currentIndex && !isPickingDone;
                    return (
                      <span
                        key={s.id}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                          isCurrent
                            ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                            : isDone
                              ? 'bg-sp-surface border-sp-border text-sp-muted line-through'
                              : 'bg-sp-surface border-sp-border text-sp-text'
                        }`}
                      >
                        {isDone && !isCurrent && '✓ '}
                        {s.studentNumber ?? ''}번 {s.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Popup overlay */}
          {showPopup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div
                className="bg-sp-surface/95 border-2 border-sp-accent rounded-2xl px-10 py-8 shadow-2xl text-center backdrop-blur-sm"
                style={{ animation: 'seatPickerPopup 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                <p className="text-4xl mb-2">🎉</p>
                <p className="text-sp-text text-2xl md:text-3xl font-bold">{popupText}</p>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes seatPickerPopup {
            0% { transform: scale(0.3); opacity: 0; }
            70% { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          .backface-hidden {
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
          }
          .seat-card-flipped {
            transform: rotateY(180deg);
          }
          .duration-600 {
            transition-duration: 600ms;
          }
        `}</style>
      </ToolLayout>
    );
  }

  /* ═══════════════════════════════════════════════════════ */
  /* Phase 3: Complete                                      */
  /* ═══════════════════════════════════════════════════════ */
  const sortedResults = [...studentOrder]
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0))
    .map((s) => {
      const pos = assignments.get(s.id);
      return { student: s, pos };
    });

  return (
    <ToolLayout title="자리 뽑기" emoji="🪑" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="flex-1 flex flex-col items-center gap-5 py-4 overflow-auto px-4">
        {/* Celebration header */}
        <div className="text-center relative">
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                className="absolute text-lg"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `confetti-fall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s infinite`,
                  opacity: 0.7,
                }}
              >
                {['🎉', '🎊', '✨', '⭐', '🌟'][i % 5]}
              </span>
            ))}
          </div>
          <p className="text-4xl mb-2">🎉</p>
          <h2 className="text-2xl md:text-3xl font-bold text-sp-text relative z-10">
            자리 배치 완료!
          </h2>
          <p className="text-sp-muted text-sm mt-1 relative z-10">
            {assignedCount}명의 자리가 모두 배정되었습니다
          </p>
        </div>

        {/* Completed seat grid */}
        <div className="w-full max-w-2xl">
          <div className="bg-sp-surface rounded-lg py-1.5 px-4 text-center mb-3">
            <span className="text-sp-muted text-xs font-medium">교탁</span>
          </div>
          <div
            className="grid gap-1.5 mx-auto"
            style={{
              gridTemplateColumns: `repeat(${pickingCols || effectiveCols}, minmax(0, 1fr))`,
              maxWidth: `${(pickingCols || effectiveCols) * 72}px`,
            }}
          >
            {Array.from({ length: pickingRows || effectiveRows }, (_, r) =>
              Array.from({ length: pickingCols || effectiveCols }, (_, c) => {
                const seatKey = `${r}-${c}`;
                const isBlocked = blockedSeats.has(seatKey);
                const isFixed = fixedStudents.has(seatKey);
                const assigned = getAssignmentForSeat(r, c);

                if (isBlocked) {
                  return (
                    <div
                      key={seatKey}
                      className="w-full aspect-square rounded-lg flex flex-col items-center justify-center text-center p-1 bg-sp-surface/60 border border-sp-border/40"
                    >
                      <span className="text-red-400/60 text-sm font-bold">✕</span>
                      <span className="text-sp-muted/40 text-caption leading-tight">빈자리</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={seatKey}
                    className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center text-center p-1 ${
                      assigned && isFixed
                        ? 'bg-amber-500/20 border border-amber-500/40'
                        : assigned
                          ? 'bg-blue-500/20 border border-blue-500/40'
                          : 'bg-sp-card border border-dashed border-sp-border'
                    }`}
                  >
                    {assigned ? (
                      <>
                        <span className="text-sp-text text-xs font-bold truncate w-full leading-tight">
                          {isFixed && '📌'}{assigned.student.name}
                        </span>
                        <span className="text-sp-muted text-caption leading-tight">
                          {r + 1}행 {c + 1}열
                        </span>
                      </>
                    ) : (
                      <span className="text-sp-muted/40 text-xs">빈 좌석</span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Result table */}
        <div className="w-full max-w-2xl bg-sp-card border border-sp-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sp-border">
            <p className="text-sp-text font-medium text-sm">배정 결과</p>
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sp-border bg-sp-surface/50">
                  <th className="px-4 py-2 text-left text-sp-muted font-medium">번호</th>
                  <th className="px-4 py-2 text-left text-sp-muted font-medium">이름</th>
                  <th className="px-4 py-2 text-left text-sp-muted font-medium">배정 좌석</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map(({ student, pos }) => (
                  <tr key={student.id} className="border-b border-sp-border/50 last:border-0">
                    <td className="px-4 py-2 text-sp-text">
                      {student.studentNumber ?? '-'}
                    </td>
                    <td className="px-4 py-2 text-sp-text font-medium">{student.name}</td>
                    <td className="px-4 py-2 text-sp-accent font-medium">
                      {pos ? `${pos.row + 1}행 ${pos.col + 1}열` : '-'}
                      {pos && fixedStudents.has(`${pos.row}-${pos.col}`) && <span className="ml-1 text-amber-400" title="고정 좌석">📌</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full max-w-2xl">
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex-1 min-w-[180px] py-3 rounded-xl bg-gradient-to-r from-sp-accent to-blue-400 text-white font-bold text-sm hover:from-blue-400 hover:to-sp-accent transition-all active:scale-[0.98]"
          >
            {seatDataSource === 'homeroom' ? '💾 학급 자리 배치에 저장' : `💾 ${selectedTc?.name ?? '수업반'} 자리 배치에 저장`}
          </button>
          <button
            onClick={handleReset}
            className="flex-1 min-w-[140px] py-3 rounded-xl bg-sp-card border border-sp-border text-sp-text hover:text-sp-text hover:border-sp-accent/50 transition-all text-sm font-medium"
          >
            🔄 다시 뽑기
          </button>
          <button
            onClick={handleFullscreen}
            className="py-3 px-5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all text-sm font-medium"
          >
            ⛶ 전체화면
          </button>
        </div>

        {/* Save confirmation modal */}
        {showSaveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <p className="text-sp-text text-lg font-bold mb-2">
                {seatDataSource === 'homeroom' ? '학급 자리 배치 저장' : `${selectedTc?.name ?? '수업반'} 자리 배치 저장`}
              </p>
              <p className="text-sp-muted text-sm mb-6">
                {seatDataSource === 'homeroom'
                  ? '현재 학급 자리 배치를 덮어씌울까요? 이 작업은 되돌릴 수 없습니다.'
                  : `${selectedTc?.name ?? '수업반'}의 자리 배치를 덮어씌울까요?`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 py-2.5 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text transition-all text-sm font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg bg-sp-accent text-white hover:bg-blue-400 transition-all text-sm font-bold"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 0.7; }
          50% { opacity: 1; }
          100% { transform: translateY(80px) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </ToolLayout>
  );
}
