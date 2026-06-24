import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { studentKey } from '@domain/entities/TeachingClass';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { mergeSingleStudentAttendance } from './shared/inlineAttendanceEdit';
import {
  mapMixedRecordsToFlatRows,
  type MixedExcelRow,
} from '@adapters/presentation/mixedRecordExcelMapper';
import { ExpandableRecordContent } from '@adapters/components/common/records/ExpandableRecordContent';
import { AttendanceStatusBadge } from '@adapters/components/common/records/AttendanceStatusBadge';
import { DateGroupHeader } from '@adapters/components/common/records/DateGroupHeader';
import { RecordEmptyState } from '@adapters/components/common/records/RecordEmptyState';
import { RecordResultSummary } from '@adapters/components/common/records/RecordResultSummary';
import {
  RecordStudentJumpList,
  type JumpListItem,
} from '@adapters/components/common/records/RecordStudentJumpList';
import { mixedRecordToDisplay } from '@adapters/presentation/displayRecord';
import { groupRecordsByStudent } from '@adapters/presentation/recordIdentityAdapter';
/* eslint-disable no-restricted-imports */
import { exportMixedRecordsToExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */

type CategoryFilter = 'all' | 'attendance' | 'observation';

type PeriodFilter = 'all' | 'semester' | 'month' | 'week' | 'custom';

const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: '전체',
  semester: '이번 학기',
  month: '이번 달',
  week: '이번 주',
  custom: '직접 설정',
};

function getInitialPeriodFilter(): PeriodFilter {
  const month = new Date().getMonth() + 1;
  return month === 7 || month === 12 ? 'semester' : 'all';
}

interface MixedRecordBase {
  date: string;
  studentKey: string;
  studentName: string;
  studentNumber: number;
}

interface AttendanceMixedRecord extends MixedRecordBase {
  type: 'attendance';
  period: number;
  status: AttendanceStatus;
  reason?: string;
  memo?: string;
}

interface ObservationMixedRecord extends MixedRecordBase {
  type: 'observation';
  id: string;
  tags: readonly string[];
  content: string;
}

type MixedRecord = AttendanceMixedRecord | ObservationMixedRecord;

interface ClassRecordSearchViewProps {
  classId: string;
}

export function ClassRecordSearchView({ classId }: ClassRecordSearchViewProps) {
  const [studentFilter, setStudentFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(getInitialPeriodFilter);
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const showToast = useToastStore((s) => s.show);

  // D1: 특기(관찰) 인라인 편집 상태
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editObsContent, setEditObsContent] = useState('');

  // D2: 출결 인라인 편집 상태(키=studentKey-date-period, 카드 1개만 식별)
  const [editingAttKey, setEditingAttKey] = useState<string | null>(null);
  const [editAttStatus, setEditAttStatus] = useState<AttendanceStatus>('absent');
  const [editAttReason, setEditAttReason] = useState<AttendanceReason | ''>('');
  const [editAttMemo, setEditAttMemo] = useState('');
  const [attSaving, setAttSaving] = useState(false);

  const classes = useTeachingClassStore((s) => s.classes);
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  const observationRecords = useObservationStore((s) => s.records);
  const loadObs = useObservationStore((s) => s.load);
  const customTags = useObservationStore((s) => s.customTags);
  const updateObservation = useObservationStore((s) => s.updateRecord);

  useEffect(() => {
    void loadObs();
  }, [loadObs]);

  // 키워드 디바운스 (300ms) — 대량 기록에서 타이핑 렉 방지
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleKeywordChange = useCallback((val: string) => {
    setKeyword(val);
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    keywordTimer.current = setTimeout(() => setDebouncedKeyword(val), 300);
  }, []);

  // 언마운트 시 대기 중 디바운스 타이머 정리(잔여 타이머 발화 방지)
  useEffect(
    () => () => {
      if (keywordTimer.current) clearTimeout(keywordTimer.current);
    },
    [],
  );

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(() => {
    if (!cls) return [];
    return [...cls.students].filter(isStudentActive).sort((a, b) => a.number - b.number);
  }, [cls]);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, { name: string; number: number }>();
    if (cls) {
      for (const s of cls.students) m.set(studentKey(s), { name: s.name, number: s.number });
    }
    return m;
  }, [cls]);

  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);

  /* 통합 레코드 생성 */
  const mixedRecords = useMemo(() => {
    const records: MixedRecord[] = [];

    // 출결 레코드 → 비출석만
    if (categoryFilter !== 'observation') {
      for (const ar of attendanceRecords) {
        if (ar.classId !== classId) continue;
        for (const sa of ar.students) {
          if (sa.status === 'present') continue;
          const sKey = studentKey(sa);
          const info = studentNameMap.get(sKey);
          records.push({
            type: 'attendance',
            date: ar.date,
            studentKey: sKey,
            studentName: info?.name ?? '?',
            studentNumber: info?.number ?? sa.number,
            period: ar.period,
            status: sa.status,
            reason: sa.reason,
            memo: sa.memo,
          });
        }
      }
    }

    // 특기사항 레코드
    if (categoryFilter !== 'attendance') {
      for (const or of observationRecords) {
        if (or.classId !== classId) continue;
        const info = studentNameMap.get(or.studentId);
        records.push({
          type: 'observation',
          date: or.date,
          studentKey: or.studentId,
          studentName: info?.name ?? '?',
          studentNumber: info?.number ?? 0,
          id: or.id,
          tags: or.tags,
          content: or.content,
        });
      }
    }

    return records.sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, observationRecords, classId, categoryFilter, studentNameMap]);

  /* 기간 필터 계산 */
  const dateRange = useMemo(() => {
    if (periodFilter === 'all') return { start: null as string | null, end: null as string | null };
    if (periodFilter === 'custom') return { start: customStart, end: customEnd };
    const now = new Date();
    if (periodFilter === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const start = new Date(now);
      start.setDate(now.getDate() - diff);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: fmt(start), end: fmt(end) };
    }
    if (periodFilter === 'month')
      return {
        start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        end: null,
      };
    // semester
    const month = now.getMonth() + 1;
    const semStart = month >= 3 && month < 9 ? 3 : 9;
    const year = semStart === 9 && month < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return { start: `${year}-${String(semStart).padStart(2, '0')}-01`, end: null };
  }, [periodFilter, customStart, customEnd]);

  /* 필터 적용 */
  const filtered = useMemo(() => {
    let result = mixedRecords;
    // 기간 필터
    if (dateRange.start) result = result.filter((r) => r.date >= dateRange.start!);
    if (dateRange.end) result = result.filter((r) => r.date <= dateRange.end!);
    if (studentFilter) result = result.filter((r) => r.studentKey === studentFilter);
    if (tagFilter.length > 0) {
      result = result.filter(
        (r) => r.type === 'observation' && r.tags?.some((t) => tagFilter.includes(t)),
      );
    }
    if (debouncedKeyword.trim()) {
      const kw = debouncedKeyword.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.studentName.toLowerCase().includes(kw) ||
          (r.type === 'observation' && r.content.toLowerCase().includes(kw)) ||
          (r.type === 'attendance' && r.memo?.toLowerCase().includes(kw)),
      );
    }
    return result;
  }, [mixedRecords, studentFilter, tagFilter, debouncedKeyword, dateRange.start, dateRange.end]);

  /* 날짜별 그룹핑 */
  const grouped = useMemo(() => {
    const groups: { date: string; records: MixedRecord[] }[] = [];
    let currentDate = '';
    for (const r of filtered) {
      if (r.date !== currentDate) {
        currentDate = r.date;
        groups.push({ date: r.date, records: [] });
      }
      groups[groups.length - 1]!.records.push(r);
    }
    return groups;
  }, [filtered]);

  const displayRecords = useMemo(() => filtered.map((r) => mixedRecordToDisplay(r)), [filtered]);

  // 좌측 학생 점프 리스트 — 학생 단위 그룹핑(컨텍스트=teaching, 반=classId로 안전 키).
  // 카운트는 studentFilter 무관(전체 학생 네비게이션용)하도록 mixedRecords 기준.
  const allDisplayRecords = useMemo(
    () => mixedRecords.map((r) => mixedRecordToDisplay(r)),
    [mixedRecords],
  );
  const countByStudentKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groupRecordsByStudent(allDisplayRecords, 'teaching', classId)) {
      m.set(g.key.rawKey, g.items.length);
    }
    return m;
  }, [allDisplayRecords, classId]);
  const jumpItems = useMemo<JumpListItem[]>(
    () =>
      students.map((s) => {
        const k = studentKey(s);
        return { key: k, label: s.name, number: s.number, count: countByStudentKey.get(k) ?? 0 };
      }),
    [students, countByStudentKey],
  );

  // 선택 학생 통계 — 건수만(출석률 등 비율 지표는 두 컨텍스트 정의 일치 보장 전까지 미노출).
  const selectedStudentStats = useMemo(() => {
    if (!studentFilter) return null;
    let absent = 0;
    let late = 0;
    let earlyLeave = 0;
    let classAbsence = 0;
    let observation = 0;
    for (const r of displayRecords) {
      if (r.kind === 'observation') observation++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'late') late++;
      else if (r.status === 'earlyLeave') earlyLeave++;
      else if (r.status === 'classAbsence') classAbsence++;
    }
    return { absent, late, earlyLeave, classAbsence, observation };
  }, [displayRecords, studentFilter]);
  const selectedStudentName = studentFilter ? (studentNameMap.get(studentFilter)?.name ?? '') : '';

  const hasActiveFilters =
    studentFilter !== '' ||
    categoryFilter !== 'all' ||
    tagFilter.length > 0 ||
    debouncedKeyword.trim() !== '' ||
    periodFilter !== 'all';

  const handleResetFilters = () => {
    // 대기 중 디바운스 타이머를 먼저 취소 — 안 하면 곧 발화해 방금 지운 키워드가 부활(레이스)
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    setStudentFilter('');
    setCategoryFilter('all');
    setTagFilter([]);
    setKeyword('');
    setDebouncedKeyword('');
    setPeriodFilter('all');
    setEditingObsId(null);
    setEditObsContent('');
    setEditingAttKey(null);
    setAttSaving(false);
  };

  // D1: 특기 인라인 편집 — 진입/취소/저장
  const handleEditObs = useCallback((id: string, content: string) => {
    setEditingObsId(id);
    setEditObsContent(content);
  }, []);

  const handleCancelObsEdit = useCallback(() => {
    setEditingObsId(null);
    setEditObsContent('');
  }, []);

  const handleSaveObs = useCallback(async () => {
    const trimmed = editObsContent.trim();
    if (!trimmed || !editingObsId) return;
    // 부분 뷰모델이 아니라 store 원본을 조회해 spread — authorId/visibility/createdAt/tags/첨부 보존
    const orig = useObservationStore.getState().records.find((r) => r.id === editingObsId);
    if (!orig) {
      showToast('원본 기록을 찾을 수 없습니다', 'error');
      return;
    }
    try {
      await updateObservation({ ...orig, content: trimmed.slice(0, 500) });
      setEditingObsId(null);
      setEditObsContent('');
      showToast('특기사항을 저장했습니다', 'success');
    } catch {
      showToast('저장에 실패했습니다', 'error');
    }
  }, [editObsContent, editingObsId, updateObservation, showToast]);

  // D2: 출결 인라인 편집 — 진입/취소/저장(원본 재조회 → 한 학생만 안전 머지 → 저장)
  const handleEditAtt = useCallback((r: AttendanceMixedRecord) => {
    setEditingAttKey(`${r.studentKey}-${r.date}-${r.period}`);
    setEditAttStatus(r.status);
    setEditAttReason((r.reason as AttendanceReason | undefined) ?? '');
    setEditAttMemo(r.memo ?? '');
  }, []);

  const handleCancelAttEdit = useCallback(() => {
    setEditingAttKey(null);
    setAttSaving(false);
  }, []);

  const handleSaveAtt = useCallback(
    async (r: AttendanceMixedRecord) => {
      setAttSaving(true);
      const store = useTeachingClassStore.getState();
      // 그룹반 우선조회로 원본 레코드(=같은 교시 전체 학생)를 다시 읽는다.
      // 부분 뷰모델로 record를 재구성하면 같은 교시 다른 학생이 통째로 사라진다(데이터 손실).
      const existing = store.getAttendanceRecord(classId, r.date, r.period);
      if (!existing) {
        setAttSaving(false);
        showToast('원본 출결 기록을 찾을 수 없습니다', 'error');
        return;
      }
      // 되돌리기용 스냅샷(편집 전 값)
      const target = existing.students.find((sa) => studentKey(sa) === r.studentKey);
      const snapshot = target
        ? { status: target.status, reason: target.reason, memo: target.memo }
        : null;
      const patch =
        editAttStatus === 'present'
          ? { status: editAttStatus, reason: undefined, memo: undefined }
          : {
              status: editAttStatus,
              reason: editAttReason || undefined,
              memo: editAttMemo.trim() || undefined,
            };
      try {
        await store.saveAttendanceRecord(
          mergeSingleStudentAttendance(existing, r.studentKey, patch),
        );
        setEditingAttKey(null);
        setAttSaving(false);
        showToast(
          '출결을 저장했습니다',
          'success',
          snapshot
            ? {
                label: '되돌리기',
                onClick: () => {
                  const cur = useTeachingClassStore
                    .getState()
                    .getAttendanceRecord(classId, r.date, r.period);
                  if (!cur) return;
                  void useTeachingClassStore
                    .getState()
                    .saveAttendanceRecord(
                      mergeSingleStudentAttendance(cur, r.studentKey, snapshot),
                    );
                },
              }
            : undefined,
        );
      } catch {
        setAttSaving(false);
        showToast('저장에 실패했습니다', 'error');
      }
    },
    [classId, editAttStatus, editAttReason, editAttMemo, showToast],
  );

  /* 현재 필터 결과를 Excel로 내보내기 (안 Y: 표현 매퍼 → infra 직렬화) */
  const handleExport = useCallback(async () => {
    if (filtered.length === 0) return;
    const rows: MixedExcelRow[] = filtered.map((r) =>
      r.type === 'attendance'
        ? {
            type: 'attendance',
            date: r.date,
            studentNumber: r.studentNumber,
            studentName: r.studentName,
            period: r.period,
            status: r.status,
            reason: r.reason,
            memo: r.memo,
          }
        : {
            type: 'observation',
            date: r.date,
            studentNumber: r.studentNumber,
            studentName: r.studentName,
            tags: r.tags,
            content: r.content,
          },
    );

    try {
      const buffer = await exportMixedRecordsToExcel(mapMixedRecordsToFlatRows(rows), {
        periodLabel: PERIOD_LABEL[periodFilter],
      });

      if (window.electronAPI) {
        const saved = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: '수업기록_조회결과.xlsx',
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (saved) {
          await window.electronAPI.writeFile(saved.handle, buffer);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(saved.handle),
          });
        }
      } else {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '수업기록_조회결과.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Excel 파일을 다운로드했습니다', 'success');
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [filtered, periodFilter, showToast]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
        >
          <option value="">전체 학생</option>
          {students.map((s) => (
            <option key={studentKey(s)} value={studentKey(s)}>
              {s.number}번 {s.name}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: '전체' },
            { id: 'attendance' as const, label: '출결' },
            { id: 'observation' as const, label: '특기사항' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-2.5 py-1 rounded-lg text-detail font-medium transition-colors ${
                categoryFilter === c.id
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {categoryFilter !== 'attendance' && (
          <div className="flex gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setTagFilter((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  tagFilter.includes(tag)
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={keyword}
          onChange={(e) => handleKeywordChange(e.target.value)}
          placeholder="키워드 검색..."
          className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent w-40"
        />

        <span className="text-xs text-sp-muted">{filtered.length}건</span>

        {filtered.length > 0 && (
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-sp-muted hover:text-sp-text hover:bg-sp-surface border border-sp-border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Excel 내보내기
          </button>
        )}
      </div>

      {/* 기간 필터 */}
      <div className="flex items-center gap-1 flex-wrap">
        {[
          { id: 'all' as const, label: '전체' },
          { id: 'semester' as const, label: '이번 학기' },
          { id: 'month' as const, label: '이번 달' },
          { id: 'week' as const, label: '이번 주' },
          { id: 'custom' as const, label: '직접 설정' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setPeriodFilter(f.id)}
            className={`px-2.5 py-1 rounded-lg text-detail font-medium transition-colors ${
              periodFilter === f.id
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {f.label}
          </button>
        ))}
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-1.5 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
              style={{ colorScheme: 'dark' }}
            />
            <span className="text-xs text-sp-muted">~</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      {/* 결과 요약 (구분 분포·상위 학생·날짜 범위) — 칩 클릭 시 구분 필터 토글 */}
      <RecordResultSummary
        records={displayRecords}
        chipClassName={(key) =>
          key === 'attendance' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
        }
        onKindClick={(key) =>
          setCategoryFilter((prev) => (prev === key ? 'all' : (key as CategoryFilter)))
        }
        activeKind={categoryFilter === 'all' ? undefined : categoryFilter}
      />

      {/* 본문: 좌측 학생 점프 리스트 + 우측 타임라인 */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        <div className="w-full lg:w-[180px] shrink-0">
          <RecordStudentJumpList
            items={jumpItems}
            selectedKey={studentFilter}
            onSelect={setStudentFilter}
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* 선택 학생 통계 헤더(건수만 — 비율 지표 미노출) */}
          {selectedStudentStats && (
            <div className="mb-3 flex items-center gap-2 flex-wrap bg-sp-card border border-sp-border rounded-xl px-3 py-2.5">
              <span className="text-sm font-bold text-sp-text">{selectedStudentName}</span>
              <span className="text-xs text-sp-muted">기록 {displayRecords.length}건</span>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                {(
                  [
                    ['결석', selectedStudentStats.absent],
                    ['지각', selectedStudentStats.late],
                    ['조퇴', selectedStudentStats.earlyLeave],
                    ['결과', selectedStudentStats.classAbsence],
                    ['특기', selectedStudentStats.observation],
                  ] as const
                ).map(([label, n]) => (
                  <span
                    key={label}
                    className="px-2 py-0.5 rounded-full text-xs bg-sp-surface text-sp-muted"
                  >
                    {label} <span className="font-bold text-sp-text">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 타임라인 */}
          <div className="space-y-4">
            {grouped.length === 0 ? (
              <RecordEmptyState hasActiveFilters={hasActiveFilters} onReset={handleResetFilters} />
            ) : (
              grouped.map((group) => (
                <div key={group.date}>
                  <DateGroupHeader date={group.date} count={group.records.length} />
                  <div className="space-y-1.5">
                    {group.records.map((r) => (
                      <div
                        key={`${r.type}-${r.date}-${r.studentKey}-${r.type === 'attendance' ? r.period : r.id}`}
                        className="group bg-sp-card border border-sp-border rounded-xl px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              r.type === 'attendance'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-blue-500/15 text-blue-400'
                            }`}
                          >
                            {r.type === 'attendance' ? '출결' : '특기'}
                          </span>
                          <span className="text-xs font-medium text-sp-text">
                            {r.studentName}{' '}
                            <span className="text-sp-muted">{r.studentNumber}번</span>
                          </span>
                          {r.type === 'attendance' && r.status && (
                            <>
                              <AttendanceStatusBadge status={r.status} />
                              {r.period && (
                                <span className="text-xs text-sp-muted">{r.period}교시</span>
                              )}
                              {r.reason && (
                                <span className="text-xs text-sp-muted">({r.reason})</span>
                              )}
                            </>
                          )}
                          {r.type === 'observation' && r.tags && (
                            <div className="flex gap-1">
                              {r.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-sp-accent/10 text-sp-accent"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {r.type === 'observation' && editingObsId !== r.id && (
                            <button
                              type="button"
                              onClick={() => handleEditObs(r.id, r.content)}
                              className="ml-auto shrink-0 flex items-center px-1.5 py-0.5 rounded text-xs text-sp-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-sp-text transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                              title="수정"
                              aria-label="특기사항 수정"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                          )}
                          {r.type === 'attendance' &&
                            editingAttKey !== `${r.studentKey}-${r.date}-${r.period}` && (
                              <button
                                type="button"
                                onClick={() => handleEditAtt(r)}
                                className="ml-auto shrink-0 flex items-center px-1.5 py-0.5 rounded text-xs text-sp-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-sp-text transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                                title="수정"
                                aria-label="출결 수정"
                              >
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                            )}
                        </div>
                        {r.type === 'attendance' &&
                          (editingAttKey === `${r.studentKey}-${r.date}-${r.period}` ? (
                            <div className="mt-1 space-y-1.5 pl-1">
                              {/* 상태(결석/지각/조퇴/결과 — 출석 전환은 비출결-only 원칙상 제외) */}
                              <div className="flex flex-wrap items-center gap-1">
                                {(
                                  [
                                    ['absent', '결석'],
                                    ['late', '지각'],
                                    ['earlyLeave', '조퇴'],
                                    ['classAbsence', '결과'],
                                  ] as const
                                ).map(([st, label]) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => setEditAttStatus(st)}
                                    className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                                      editAttStatus === st
                                        ? 'bg-sp-accent text-white'
                                        : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {/* 사유 */}
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditAttReason('')}
                                  className={`px-2 py-0.5 rounded-lg text-xs ${
                                    !editAttReason
                                      ? 'bg-sp-accent text-white'
                                      : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                                  }`}
                                >
                                  사유 없음
                                </button>
                                {ATTENDANCE_REASONS.map((rs) => (
                                  <button
                                    key={rs}
                                    type="button"
                                    onClick={() => setEditAttReason(rs)}
                                    className={`px-2 py-0.5 rounded-lg text-xs ${
                                      editAttReason === rs
                                        ? 'bg-sp-accent text-white'
                                        : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                                    }`}
                                  >
                                    {rs}
                                  </button>
                                ))}
                              </div>
                              {/* 메모 */}
                              <textarea
                                value={editAttMemo}
                                onChange={(e) => setEditAttMemo(e.target.value)}
                                rows={2}
                                placeholder="메모(선택)"
                                className="w-full bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent resize-none"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                {attSaving && (
                                  <span className="mr-auto text-xs text-sp-muted">저장 중…</span>
                                )}
                                <button
                                  type="button"
                                  onClick={handleCancelAttEdit}
                                  className="px-2.5 py-1 rounded-lg text-xs text-sp-muted hover:text-sp-text"
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveAtt(r)}
                                  disabled={attSaving}
                                  className="px-2.5 py-1 rounded-lg text-xs bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-40"
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            r.memo && <p className="text-xs text-sp-muted pl-1">{r.memo}</p>
                          ))}
                        {r.type === 'observation' &&
                          (editingObsId === r.id ? (
                            <div className="pl-1 space-y-1.5">
                              <textarea
                                value={editObsContent}
                                onChange={(e) => setEditObsContent(e.target.value)}
                                maxLength={500}
                                rows={3}
                                autoFocus
                                className="w-full bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent resize-none"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleCancelObsEdit}
                                  className="px-2.5 py-1 rounded-lg text-xs text-sp-muted hover:text-sp-text"
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveObs()}
                                  disabled={!editObsContent.trim()}
                                  className="px-2.5 py-1 rounded-lg text-xs bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-40"
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            r.content && (
                              <div className="pl-1">
                                <ExpandableRecordContent content={r.content} />
                              </div>
                            )
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
