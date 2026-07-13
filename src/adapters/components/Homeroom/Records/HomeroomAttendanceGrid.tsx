import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING, ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { computeAutoPeriods, summarizeTotal } from '@domain/rules/attendanceRules';
import { parseAttendanceQuickText } from '@domain/rules/attendanceQuickText';
import { studentKey } from '@domain/entities/TeachingClass';
import { AttendanceGridView } from '@adapters/components/attendance/shared/AttendanceGridView';
import { SeatAttendanceView } from './SeatAttendanceView';
import { SeatPeriodPopover } from './SeatPeriodPopover';
import {
  STATUS_CONFIG,
  STAT_COLORS,
  buildInitialMatrix,
  buildByPeriodFromMatrix,
  canonicalDaySignature,
  recordsToByPeriod,
  type LocalStudentAttendance,
  type MatrixState,
  type MatrixStudent,
} from '@adapters/components/attendance/shared/attendanceGridShared';

/**
 * 담임 오늘 출결 그리드 — 담임 소유 얇은 셸 (attendance-grid-v2 팔레트 + 자동 저장).
 *
 * 인터랙션: 팔레트(종류·사유·비고) 사전 설정 → 교시 칸 클릭 = 기준 교시로 행 전체
 * 재작성(§3.10-5). 지우개(칸/이름), 텍스트 빠른 입력, undo/redo(Ctrl+Z), 오늘 비우기.
 *
 * 자동 저장(§3.10-1): 편집 시 800ms 디바운스로 조용히 저장한다. 성공 토스트 없이
 * "저장됨 ✓" 상태칩만. **dirty-gate가 주 메커니즘**(편집 중이면 외부 스냅샷 변경으로
 * 재시드하지 않음 = 포커스된 그리드가 이긴다) + **자기 저장 서명이 보조**(비-dirty 시
 * 자기 저장의 store 반영을 canonical 서명으로 식별해 불필요한 재구성 방지).
 * 플러시 3종: 날짜 이동 · 언마운트 · window blur/beforeunload.
 *
 * 스토어 직접 import 금지(저장·데이터는 호스트 위임) — 단일 기록자 메타 가드.
 * 렌더 게이트(번호 충돌)는 호스트(AttendanceMode)가 앞단에서 처리한다.
 */
export interface HomeroomAttendanceGridProps {
  /** 담임 학생 목록 (번호순 정렬, number 기반 식별) */
  students: readonly MatrixStudent[];
  /** 출결 저장 classId (담임 학급명) */
  classId: string;
  /** 호스트(AttendanceMode)가 소유한 날짜 (YYYY-MM-DD) */
  date: string;
  /** (date) → 해당 날짜의 AttendanceRecord 배열 */
  loadDayRecords: (date: string) => readonly AttendanceRecord[];
  /** 하루치 저장 위임 — 호스트가 saveDayAttendance + 미러 조립까지 책임진다. */
  onSaveDay: (
    date: string,
    byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
  ) => Promise<void>;
  /** 교시 목록 — settings(maxPeriods) 단일 출처에서 호스트가 구성 */
  periods: readonly number[];
  /**
   * 좌석 뷰 데이터(선택) — 호스트(AttendanceMode)가 useSeatingStore에서 읽어 주입한다.
   * 그리드 셸은 스토어를 직접 import 하지 않으므로(메타 가드), 데이터·매핑을 prop으로만 받는다(§3.10-4).
   * 미전달이면 [명렬|좌석] 토글을 숨긴다.
   */
  seating?: {
    layout: 'grid' | 'group' | 'freestyle';
    rows: number;
    cols: number;
    seats: readonly (readonly (string | null)[])[];
    /** studentId → {번호, 이름} (활성·유번호 학생) */
    studentMap: ReadonlyMap<string, { number: number; name: string }>;
  };
  /**
   * 예외 편집 알림(M2, 선택) — 팔레트 칸 클릭·텍스트 빠른 입력·사유 인라인 편집
   * 3곳에서만 (studentNumber, 사유·비고 텍스트)를 호스트에 알린다. undo/redo/지우기에서는
   * 호출하지 않는다(오경보 차단). 경고 판정·표시는 호스트 소관 — 저장 흐름과 무관한 비차단 훅.
   */
  onExceptionEdited?: (studentNumber: number, text: string) => void;
}

/** 팔레트 종류 = 예외 상태 4종 + 지우개 */
type PaletteType = Exclude<AttendanceStatus, 'present'> | 'eraser';
/** undo/redo 단위 = 행 스냅샷(studentKey → 이전 row 전체) */
type RowVal = Record<number, LocalStudentAttendance | undefined> | undefined;
interface UndoEntry {
  rows: { sKey: string; row: RowVal }[];
}

const TYPE_ITEMS: readonly Exclude<AttendanceStatus, 'present'>[] = [
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
];

const TYPE_HINT: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '아무 칸이나 클릭 → 전 교시 결석',
  late: '등교한 교시 칸 클릭 → 조회~그 교시 지각',
  earlyLeave: '하교한 교시 칸 클릭 → 그 교시~종례 조퇴',
  classAbsence: '해당 교시 칸 클릭 → 그 교시만 결과',
};

const AUTOSAVE_DEBOUNCE_MS = 800;
const MAX_UNDO = 50;

const ATT_VIEW_KEY = 'ssampin:homeroom-attendance-view';

export function HomeroomAttendanceGrid({
  students,
  classId,
  date,
  loadDayRecords,
  onSaveDay,
  periods,
  seating,
  onExceptionEdited,
}: HomeroomAttendanceGridProps) {
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);

  /* 팔레트 상태 */
  const [paletteType, setPaletteType] = useState<PaletteType>('absent');
  const [paletteReason, setPaletteReason] = useState<AttendanceReason>('질병');
  const [paletteMemo, setPaletteMemo] = useState('');

  /* 보기(명렬|좌석) — 기기별 localStorage 영속. 좌석엔 교시 축이 없어 기준 교시 선택기 사용. */
  const [attView, setAttView] = useState<'list' | 'seat'>(() => {
    try {
      return localStorage.getItem(ATT_VIEW_KEY) === 'seat' ? 'seat' : 'list';
    } catch {
      return 'list';
    }
  });
  /* 좌석 클릭 → 그 학생 교시별 팝오버 (명렬 보기처럼 교시를 하나씩 지정) */
  const [seatPopover, setSeatPopover] = useState<{ sKey: string; rect: DOMRect } | null>(null);
  /* 요약 칩 클릭 시 해당 상태 학생 행/좌석 하이라이트 (§3.5) */
  const [highlightStatus, setHighlightStatus] = useState<AttendanceStatus | null>(null);
  const setAttViewPersist = useCallback((v: 'list' | 'seat') => {
    setAttView(v);
    try {
      localStorage.setItem(ATT_VIEW_KEY, v);
    } catch {
      /* noop */
    }
  }, []);

  /* undo/redo 표시 상태 (스택은 ref) */
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /* 텍스트 빠른 입력 / 오늘 비우기 모달 */
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  /* ── refs (자동 저장 상태 소유 — 스토어 직접 import 금지) ── */
  const matrixRef = useRef<MatrixState>(matrix);
  const dirtyRef = useRef(false);
  const dateRef = useRef(date);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSigRef = useRef<Set<string>>(new Set());
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const externalFirstRun = useRef(true);
  const mountedRef = useRef(true);
  useEffect(() => {
    // StrictMode 이중 호출 대비: 마운트마다 true로 되돌린다(cleanup만 두면 false로 고착).
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* 최신 props를 클로저 밖에서 읽기 위한 ref (외부 재시드 effect용) */
  const latestRef = useRef({ classId, date, students, periods, loadDayRecords });
  latestRef.current = { classId, date, students, periods, loadDayRecords };

  useEffect(() => {
    matrixRef.current = matrix;
  }, [matrix]);

  /** 정규 교시 수 (조회/종례 제외) — computeAutoPeriods 의 periodCount */
  const regularPeriodCount = useMemo(
    () => periods.filter((p) => p !== PERIOD_MORNING && p !== PERIOD_CLOSING).length,
    [periods],
  );
  // 원시 배열 periods를 dep로 쓰기 위한 안정 키(값 비교). 복합식(periods.join)을 dep 배열에
  // 직접 두면 여러 줄로 나뉠 때 lint 억제 주석이 첫 줄만 덮으므로, 이 변수를 dep에 둔다.
  const periodsKey = periods.join(',');

  const setDirtyBoth = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  }, []);

  const refreshUndoState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clearUndo = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  /* 편집 전 행 스냅샷 push (undo). 새 편집이면 redo 초기화. */
  const pushUndo = useCallback(
    (keys: readonly string[]) => {
      const cur = matrixRef.current;
      undoStackRef.current.push({ rows: keys.map((sKey) => ({ sKey, row: cur[sKey] })) });
      if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
      redoStackRef.current = [];
      refreshUndoState();
    },
    [refreshUndoState],
  );

  /* ── 자동 저장 ──
   * silent=true: 플러시(날짜 이동·언마운트) — setState 없이 저장만(언마운트 경고 방지). */
  const flushSave = useCallback(
    async (silent = false) => {
      if (saveTimerRef.current != null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (!dirtyRef.current) return;
      const snapMatrix = matrixRef.current;
      const snapDate = dateRef.current;
      const byPeriod = buildByPeriodFromMatrix(snapMatrix, students, periods);
      // 데이터 유실 방지: saveDayAttendance 는 하루치를 통째 교체하는데 매트릭스는 활성 명렬만 담는다.
      // 화면에 없는 학생(비활성·전학·결번 번호)의 그날 기록을 기존 저장본에서 그대로 얹어 보존한다.
      // (자동 저장이라 매 편집마다 조용히 삭제되던 회귀 방지.) 서명도 이 병합본으로 계산해
      // 재시드측(전체 레코드 기준)과 대칭을 유지한다.
      const activeNumbers = new Set(students.map((s) => s.number));
      for (const rec of latestRef.current.loadDayRecords(snapDate)) {
        let arr = byPeriod.get(rec.period);
        if (!arr) {
          arr = [];
          byPeriod.set(rec.period, arr);
        }
        for (const sa of rec.students) {
          if (!activeNumbers.has(sa.number) && !arr.some((x) => x.number === sa.number)) {
            arr.push({ ...sa });
          }
        }
      }
      const sig = canonicalDaySignature(byPeriod);
      pendingSigRef.current.add(sig);
      dirtyRef.current = false;
      if (!silent) {
        setDirty(false);
        setSaveStatus('saving');
      }
      try {
        await onSaveDay(snapDate, byPeriod);
        // 저장 중 다시 편집됐으면 조용히 대기(다음 디바운스가 처리)
        if (!silent && mountedRef.current) setSaveStatus(dirtyRef.current ? 'idle' : 'saved');
      } catch {
        pendingSigRef.current.delete(sig);
        dirtyRef.current = true;
        if (!silent && mountedRef.current) {
          setDirty(true);
          setSaveStatus('error');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSaveDay, students, periodsKey],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flushSave]);

  /* 편집 커밋 공통 후처리 */
  const commitEdit = useCallback(() => {
    setDirtyBoth(true);
    setSaveStatus('idle');
    scheduleSave();
  }, [setDirtyBoth, scheduleSave]);

  /* 저장본에서 재시드(공통) — 매트릭스 교체 + undo/상태 초기화 */
  const reseedFrom = useCallback(
    (
      records: readonly AttendanceRecord[],
      cid: string,
      d: string,
      sts: readonly MatrixStudent[],
      ps: readonly number[],
      resetDirty: boolean,
    ) => {
      setMatrix(buildInitialMatrix(records, cid, d, sts, ps));
      if (resetDirty) setDirtyBoth(false);
      setSaveStatus('idle');
      clearUndo();
    },
    [setDirtyBoth, clearUndo],
  );

  /* 구조적 재시드(날짜/학생/학급/교시 변경) + 플러시(날짜 이동·언마운트) */
  useEffect(() => {
    dateRef.current = date;
    const records = loadDayRecords(date);
    reseedFrom(records, classId, date, students, periods, true);
    return () => {
      // 떠나는 날짜(또는 언마운트) → 대기 중 저장 플러시 (플러시 3종 ①②). silent=재시드/언마운트 경고 방지
      void flushSave(true);
    };
    // loadDayRecords는 store 스냅샷 변화로 매 저장마다 identity가 바뀌므로 dep에서 제외
    // (외부 변경 재시드는 아래 dirty-gate effect가 담당). date/students/classId/periods만 구조 트리거.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, students, periodsKey]);

  /* 외부 변경 재시드 — dirty-gate(주) + 자기 저장 서명(보조) */
  useEffect(() => {
    if (externalFirstRun.current) {
      externalFirstRun.current = false;
      return; // 최초 마운트는 구조 effect가 이미 시드
    }
    if (dirtyRef.current) return; // dirty-gate: 편집 중이면 포커스된 그리드가 이긴다
    const {
      classId: cid,
      date: d,
      students: sts,
      periods: ps,
      loadDayRecords: load,
    } = latestRef.current;
    const records = load(d);
    const sig = canonicalDaySignature(recordsToByPeriod(records));
    if (pendingSigRef.current.has(sig)) {
      pendingSigRef.current.delete(sig);
      return; // 자기 저장의 store 반영 — 재구성 불필요
    }
    reseedFrom(records, cid, d, sts, ps, false); // 진짜 외부 변경 → 재시드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDayRecords]);

  /* 플러시 3종 ③ — window blur / beforeunload */
  useEffect(() => {
    const onBlur = () => void flushSave();
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBlur);
    };
  }, [flushSave]);

  /* 좌석 팝오버는 날짜·보기(명렬/좌석) 변경 시 닫는다 (컨텍스트 바뀌면 잘못된 학생에 적용 방지). */
  useEffect(() => {
    setSeatPopover(null);
  }, [date, attView]);

  /* ── 팔레트 적용 = 칸 클릭 ── */
  const handleCellClick = useCallback(
    (sKey: string, period: number) => {
      const student = students.find((s) => studentKey(s) === sKey);
      if (!student) return;
      pushUndo([sKey]);
      if (paletteType === 'eraser') {
        setMatrix((prev) => {
          const row = { ...(prev[sKey] ?? {}) };
          row[period] = undefined;
          return { ...prev, [sKey]: row };
        });
      } else {
        const status: AttendanceStatus = paletteType;
        const fill = computeAutoPeriods(status, period, regularPeriodCount);
        const memoText = paletteMemo.trim() || undefined;
        setMatrix((prev) => {
          // §3.10-5 전-행 재작성: 찍힌 교시 외 clear, 전 교시 동일 사유·비고
          const row: Record<number, LocalStudentAttendance | undefined> = {};
          for (const p of periods) {
            row[p] = fill.has(p)
              ? { number: student.number, status, reason: paletteReason, memo: memoText }
              : undefined;
          }
          return { ...prev, [sKey]: row };
        });
        // M2: 예외 편집 알림 — 지우개·undo/redo 경로에서는 호출하지 않는다.
        onExceptionEdited?.(student.number, [paletteReason, memoText].filter(Boolean).join(' '));
      }
      commitEdit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      students,
      paletteType,
      paletteReason,
      paletteMemo,
      regularPeriodCount,
      periodsKey,
      pushUndo,
      commitEdit,
      onExceptionEdited,
    ],
  );

  /* 그 학생 하루 전체를 출석으로 되돌림 (이름 클릭·좌석 팝오버 '하루 전체 지우기' 공용) */
  const clearStudentDay = useCallback(
    (sKey: string) => {
      pushUndo([sKey]);
      setMatrix((prev) => {
        const row: Record<number, LocalStudentAttendance | undefined> = {};
        for (const p of periods) row[p] = undefined;
        return { ...prev, [sKey]: row };
      });
      commitEdit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodsKey, pushUndo, commitEdit],
  );

  /* 이름 클릭 = (지우개 모드) 그 학생 하루 전체 지움 */
  const handleNameClick = useCallback(
    (sKey: string) => {
      if (paletteType !== 'eraser') return;
      clearStudentDay(sKey);
    },
    [paletteType, clearStudentDay],
  );

  /* 사유(비고) 인라인 편집 = 찍힌 교시 전체로 memo fan-out (§3.10-5) */
  const handleMemoEdit = useCallback(
    (sKey: string, memo: string) => {
      const memoText = memo.trim() || undefined;
      pushUndo([sKey]);
      setMatrix((prev) => {
        const row = prev[sKey];
        if (!row) return prev;
        const next: Record<number, LocalStudentAttendance | undefined> = { ...row };
        let changed = false;
        for (const p of periods) {
          const att = next[p];
          if (att && att.status !== 'present') {
            next[p] = { ...att, memo: memoText };
            changed = true;
          }
        }
        if (!changed) return prev;
        return { ...prev, [sKey]: next };
      });
      // M2: 예외 편집 알림 — 예외(비-present) 교시가 있는 행의 비고 입력만 알린다.
      if (memoText) {
        const student = students.find((s) => studentKey(s) === sKey);
        const row = matrixRef.current[sKey];
        const hasException =
          row != null && Object.values(row).some((a) => a && a.status !== 'present');
        if (student && hasException) {
          const reason = Object.values(row).find((a) => a && a.status !== 'present')?.reason;
          onExceptionEdited?.(student.number, [reason, memoText].filter(Boolean).join(' '));
        }
      }
      commitEdit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodsKey, pushUndo, commitEdit, students, onExceptionEdited],
  );

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  /* 좌석 클릭 = 그 학생 교시별 팝오버 열기. 좌석엔 교시 축이 없으므로 팝오버에서
     명렬 보기처럼 교시를 하나씩 지정한다(§3.10-4 후속, 피드백 2026-07). */
  const handleSeatClick = useCallback((sKey: string, rect: DOMRect) => {
    setSeatPopover({ sKey, rect });
  }, []);

  /* ── undo / redo ── */
  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const cur = matrixRef.current;
    redoStackRef.current.push({ rows: entry.rows.map(({ sKey }) => ({ sKey, row: cur[sKey] })) });
    setMatrix((prev) => {
      const next = { ...prev };
      for (const { sKey, row } of entry.rows) {
        if (row === undefined) delete next[sKey];
        else next[sKey] = row;
      }
      return next;
    });
    commitEdit();
    refreshUndoState();
  }, [commitEdit, refreshUndoState]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    const cur = matrixRef.current;
    undoStackRef.current.push({ rows: entry.rows.map(({ sKey }) => ({ sKey, row: cur[sKey] })) });
    setMatrix((prev) => {
      const next = { ...prev };
      for (const { sKey, row } of entry.rows) {
        if (row === undefined) delete next[sKey];
        else next[sKey] = row;
      }
      return next;
    });
    commitEdit();
    refreshUndoState();
  }, [commitEdit, refreshUndoState]);

  /* Ctrl+Z / Ctrl+Shift+Z */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* 오늘 기록 비우기 (확인 후 전 행 clear + 저장) */
  const clearToday = useCallback(() => {
    const keys = students.map((s) => studentKey(s));
    pushUndo(keys);
    setMatrix((prev) => {
      const next = { ...prev };
      for (const sKey of keys) {
        const row: Record<number, LocalStudentAttendance | undefined> = {};
        for (const p of periods) row[p] = undefined;
        next[sKey] = row;
      }
      return next;
    });
    commitEdit();
    setShowClearConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, periodsKey, pushUndo, commitEdit]);

  /* ── 텍스트 빠른 입력 ── */
  const parsedLines = useMemo(() => {
    if (!showTextPanel || textInput.trim() === '') return [];
    return parseAttendanceQuickText(
      textInput,
      students.map((s) => ({ number: s.number, name: s.name })),
      regularPeriodCount,
    );
  }, [showTextPanel, textInput, students, regularPeriodCount]);

  const okLineCount = useMemo(() => parsedLines.filter((l) => l.ok).length, [parsedLines]);

  const applyText = useCallback(() => {
    const applies = parsedLines
      .filter((l) => l.ok && l.result)
      .map((l) => {
        const student = students.find((s) => s.number === l.result!.studentNumber);
        return student ? { student, res: l.result! } : null;
      })
      .filter(
        (
          a,
        ): a is {
          student: MatrixStudent;
          res: NonNullable<(typeof parsedLines)[number]['result']>;
        } => a !== null,
      );
    if (applies.length === 0) return;
    pushUndo(applies.map((a) => studentKey(a.student)));
    setMatrix((prev) => {
      const next = { ...prev };
      for (const { student, res } of applies) {
        const fill = new Set(res.periods);
        const row: Record<number, LocalStudentAttendance | undefined> = {};
        for (const p of periods) {
          row[p] = fill.has(p)
            ? { number: student.number, status: res.status, reason: res.reason, memo: res.memo }
            : undefined;
        }
        next[studentKey(student)] = row;
      }
      return next;
    });
    // M2: 예외 편집 알림 — 적용된 학생별 1회씩 (undo/redo와 무관한 편집 원본 지점).
    for (const { student, res } of applies) {
      onExceptionEdited?.(student.number, [res.reason, res.memo].filter(Boolean).join(' '));
    }
    commitEdit();
    setShowTextPanel(false);
    setTextInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedLines, students, periodsKey, pushUndo, commitEdit, onExceptionEdited]);

  /* 상단 요약(전체 카운트) */
  const matrixMap = useMemo(() => {
    const m = new Map<string, Map<number, StudentAttendance | undefined>>();
    for (const [sKey, row] of Object.entries(matrix)) {
      const inner = new Map<number, StudentAttendance | undefined>();
      for (const p of periods) inner.set(p, row?.[p]);
      m.set(sKey, inner);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, periodsKey]);
  const totalStats = useMemo(() => summarizeTotal(matrixMap), [matrixMap]);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-sp-muted">
        <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
        <p className="text-sm">명렬표에 학생을 먼저 등록해주세요.</p>
      </div>
    );
  }

  const isEraser = paletteType === 'eraser';
  // 좌석 뷰 유효 여부 — localStorage에 'seat'가 남아도 좌석 데이터가 없으면 명렬로 폴백.
  const seatMode = attView === 'seat' && !!seating;
  const selectionLabel = isEraser
    ? '지우개'
    : `${STATUS_CONFIG[paletteType].label} · ${paletteReason}`;

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* ── 팔레트 바 (스크롤해도 고정) ── */}
      <div className="shrink-0 flex flex-col gap-1.5 bg-sp-surface border border-sp-border rounded-xl px-3 py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-sp-muted w-8 shrink-0">종류</span>
          {TYPE_ITEMS.map((type) => {
            const active = paletteType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPaletteType(type)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                    : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
                }`}
              >
                <span className={`material-symbols-outlined text-sm ${STAT_COLORS[type]}`}>
                  {STATUS_CONFIG[type].icon}
                </span>
                {STATUS_CONFIG[type].label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPaletteType('eraser')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              isEraser
                ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
            }`}
            title="칸 클릭: 그 칸만 지움 · 이름 클릭: 하루 전체 지움"
          >
            <span className="material-symbols-outlined text-sm">ink_eraser</span>
            지우개
          </button>

          <div className="flex-1" />

          <span
            className={`px-3 py-1 rounded-lg text-sm font-bold ${
              isEraser ? 'bg-sp-card text-sp-text' : 'bg-sp-accent/15 text-sp-accent'
            }`}
          >
            {selectionLabel}
          </span>
        </div>

        {!isEraser && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-sp-muted w-8 shrink-0">사유</span>
            {ATTENDANCE_REASONS.map((reason) => {
              const active = paletteReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setPaletteReason(reason)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                      : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
                  }`}
                >
                  {reason}
                </button>
              );
            })}
            <span className="text-xs text-sp-muted ml-2">비고</span>
            <input
              type="text"
              value={paletteMemo}
              onChange={(e) => setPaletteMemo(e.target.value)}
              placeholder="예: 감기 (선택)"
              className="flex-1 min-w-[8rem] bg-sp-card border border-sp-border rounded-lg px-2.5 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
            />
          </div>
        )}

        <p className="text-caption text-sp-muted leading-relaxed">
          {isEraser
            ? seatMode
              ? '좌석을 클릭하면 그 학생의 교시별 창이 열려요. 창에서 하루 전체 지우기도 할 수 있어요.'
              : '칸을 클릭하면 그 칸만, 이름을 클릭하면 그 학생 하루 전체를 출석으로 되돌려요.'
            : seatMode
              ? '좌석을 클릭하면 그 학생의 교시별 창이 열려요. 창에서 교시를 클릭해 지정하세요.'
              : TYPE_HINT[paletteType]}
        </p>
      </div>

      {/* ── 도구 + 저장 상태 바 (스크롤해도 고정) ── */}
      <div className="shrink-0 flex items-center gap-3 bg-sp-surface border border-sp-border rounded-xl px-3 py-1.5 flex-wrap">
        <span className="text-xs text-sp-muted">전체 {students.length}명</span>
        <span className="text-sp-border">|</span>
        {(['absent', 'late', 'earlyLeave', 'classAbsence'] as AttendanceStatus[]).map((status) => {
          const active = highlightStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setHighlightStatus((prev) => (prev === status ? null : status))}
              aria-pressed={active}
              title={`${STATUS_CONFIG[status].label} 학생 강조`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-colors ${
                active
                  ? 'border-sp-accent/50 bg-sp-accent/10'
                  : 'border-transparent hover:bg-sp-card'
              } ${totalStats[status] === 0 ? 'opacity-50' : ''}`}
            >
              <span className={`material-symbols-outlined text-sm ${STAT_COLORS[status]}`}>
                {STATUS_CONFIG[status].icon}
              </span>
              <span className="text-xs text-sp-muted">{STATUS_CONFIG[status].label}</span>
              <span className={`text-sm font-medium ${STAT_COLORS[status]}`}>
                {totalStats[status]}
              </span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* 저장 상태칩 (조용) */}
        <span
          aria-live="polite"
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
            saveStatus === 'saving'
              ? 'text-sp-muted bg-sp-card'
              : saveStatus === 'error'
                ? 'text-red-400 bg-red-500/10'
                : dirty
                  ? 'text-sp-muted bg-sp-card'
                  : saveStatus === 'saved'
                    ? 'text-green-400 bg-green-500/10'
                    : 'text-sp-muted/60'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {saveStatus === 'saving'
              ? 'progress_activity'
              : saveStatus === 'error'
                ? 'error'
                : dirty
                  ? 'edit'
                  : saveStatus === 'saved'
                    ? 'check_circle'
                    : 'cloud_done'}
          </span>
          {saveStatus === 'saving'
            ? '저장 중...'
            : saveStatus === 'error'
              ? '저장 실패 — 다시 편집하면 재시도'
              : dirty
                ? '저장 대기'
                : saveStatus === 'saved'
                  ? '저장됨 ✓'
                  : '자동 저장'}
        </span>

        {/* 보기 토글 (명렬|좌석) — 좌석 데이터가 있을 때만 노출 */}
        {seating && (
          <div className="flex items-center bg-sp-card border border-sp-border rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setAttViewPersist('list')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                attView === 'list'
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
              title="명렬 보기"
            >
              <span className="material-symbols-outlined text-sm">format_list_numbered</span>
              명렬
            </button>
            <button
              type="button"
              onClick={() => setAttViewPersist('seat')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                attView === 'seat'
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
              title="좌석 보기"
            >
              <span className="material-symbols-outlined text-sm">grid_view</span>
              좌석
            </button>
          </div>
        )}
        <button
          onClick={() => setShowTextPanel(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-sp-accent/50"
          title="여러 줄로 한 번에 입력"
        >
          <span className="material-symbols-outlined text-sm">edit_note</span>
          텍스트로 입력
        </button>
        <button
          onClick={undo}
          disabled={!canUndo}
          aria-label="되돌리기"
          className="flex items-center gap-1 px-2 py-1 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="되돌리기 (Ctrl+Z)"
        >
          <span className="material-symbols-outlined text-sm">undo</span>
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          aria-label="다시 실행"
          className="flex items-center gap-1 px-2 py-1 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <span className="material-symbols-outlined text-sm">redo</span>
        </button>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-red-400 bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-red-500/40"
          title="오늘 출결을 전부 지웁니다"
        >
          <span className="material-symbols-outlined text-sm">delete_sweep</span>
          오늘 기록 비우기
        </button>
      </div>

      {/* 본문 — flex-1로 남은 영역을 채우고 이 영역만 스크롤(위 팔레트·도구 바는 고정). */}
      <div className="flex-1 min-h-0 overflow-auto">
        {seatMode && seating ? (
          seating.layout === 'grid' ? (
            <SeatAttendanceView
              rows={seating.rows}
              cols={seating.cols}
              seats={seating.seats}
              studentMap={seating.studentMap}
              matrix={matrix}
              periods={periods}
              onSeatClick={handleSeatClick}
              highlightStatus={highlightStatus}
            />
          ) : (
            <div className="rounded-xl border border-sp-border bg-sp-surface/40 px-4 py-10 text-center text-sm text-sp-muted leading-relaxed">
              좌석 보기는 격자(grid) 배치에서만 지원돼요. 모둠·자유 배치는 준비 중입니다 — 명렬
              보기로 입력해주세요.
            </div>
          )
        ) : (
          <AttendanceGridView
            students={students}
            matrix={matrix}
            periods={periods}
            onCellClick={handleCellClick}
            onCellContextMenu={handleCellContextMenu}
            onStudentNameClick={isEraser ? handleNameClick : undefined}
            nameClickTitle="지우개: 클릭하면 이 학생의 하루 출결을 전부 지워요"
            blankPresent
            reasonColumn
            onMemoEdit={handleMemoEdit}
            highlightStatus={highlightStatus}
          />
        )}
      </div>

      {/* ── 텍스트 빠른 입력 패널 ── */}
      {showTextPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-5 w-[640px] max-w-[92vw] max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-base">edit_note</span>
                텍스트로 빠르게 입력
              </h3>
              <button
                onClick={() => setShowTextPanel(false)}
                className="text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="text-xs text-sp-muted bg-sp-surface rounded-lg px-3 py-2 mb-2 leading-relaxed">
              한 줄에 한 명씩:{' '}
              <span className="text-sp-text font-medium">학생 [교시] [사유] 종류 [비고]</span>
              <br />
              예: <span className="text-sp-text">김정민 2교시 질병 지각 감기</span> ·{' '}
              <span className="text-sp-text">이서연 조회 미인정 지각</span> ·{' '}
              <span className="text-sp-text">4 3교시 미인정 결과</span>
              <br />
              결석은 교시를 생략하면 전 교시로 처리돼요. 사유를 생략하면 ‘기타’.
            </div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                '김정민 2교시 질병 지각 감기\n이서연 조회 미인정 지각\n4 3교시 미인정 결과'
              }
              autoFocus
              className="w-full h-32 bg-sp-surface border border-sp-border rounded-lg p-3 text-sm text-sp-text placeholder:text-sp-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            {/* 미리보기 */}
            {parsedLines.length > 0 && (
              <div className="mt-2 flex-1 overflow-y-auto border border-sp-border rounded-lg p-2 space-y-1 min-h-0">
                {parsedLines.map((line) => (
                  <div
                    key={line.lineNo}
                    className={`flex items-start gap-1.5 text-xs ${
                      line.ok ? 'text-sp-text' : 'text-red-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm leading-none mt-0.5">
                      {line.ok ? 'check' : 'close'}
                    </span>
                    <span>
                      {line.ok
                        ? line.result!.preview
                        : `${line.lineNo}행: ${line.error} (${line.raw})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowTextPanel(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-surface text-sp-muted hover:text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={applyText}
                disabled={okLineCount === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {okLineCount > 0 ? `${okLineCount}명 적용` : '적용'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 오늘 기록 비우기 확인 ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-base font-bold text-sp-text flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-red-400">delete_sweep</span>
              오늘 기록 비우기
            </h3>
            <p className="text-sm text-sp-muted mb-4 leading-relaxed">
              이 날짜의 출결을 모두 지우고 전원 출석으로 되돌려요. 되돌리기(Ctrl+Z)로 복구할 수
              있어요.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sp-surface text-sp-muted hover:text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={clearToday}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/90 text-white hover:bg-red-500 transition-colors"
              >
                모두 비우기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 좌석 교시별 팝오버 (좌석 보기에서 좌석 클릭 시) ── */}
      {seatMode &&
        seatPopover &&
        (() => {
          const student = students.find((s) => studentKey(s) === seatPopover.sKey);
          if (!student) return null;
          return (
            <SeatPeriodPopover
              student={{ number: student.number, name: student.name }}
              row={matrix[seatPopover.sKey] ?? {}}
              periods={periods}
              isEraser={isEraser}
              paletteLabel={selectionLabel}
              anchorRect={seatPopover.rect}
              onCellClick={(p) => handleCellClick(seatPopover.sKey, p)}
              onMemoEdit={(m) => handleMemoEdit(seatPopover.sKey, m)}
              onClearStudent={() => {
                clearStudentDay(seatPopover.sKey);
                setSeatPopover(null);
              }}
              onClose={() => setSeatPopover(null)}
            />
          );
        })()}
    </div>
  );
}
