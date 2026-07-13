import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Student } from '@domain/entities/Student';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useMultiDateAttendanceIntentStore } from '@adapters/stores/useMultiDateAttendanceIntentStore';
import { detectStudentNumberIssues } from '@domain/rules/studentNumberRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import { DateNavigator } from '@adapters/components/StudentRecords/DateNavigator';
import { Notice } from '@adapters/components/common/Notice';
import { HomeroomAttendanceGrid } from './HomeroomAttendanceGrid';
import { MultiDayAttendancePanel } from './MultiDayAttendancePanel';
import { renumberHomeroomStudents } from './recordUtils';

/** 명령 팔레트 intent의 한글 종류 → AttendanceStatus */
const TYPE_FROM_KR: Record<string, Exclude<AttendanceStatus, 'present'>> = {
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

/**
 * 출결 탭 전용 화면 — 담임 단일 날짜 출결의 유일한 기록자.
 *
 * attendance-grid-v2 P7.1에서 InputMode(누가기록)의 '오늘 출결' 그리드 섹션을
 * 이 전용 탭으로 분리했다. 렌더 게이트(번호 충돌)·미러 순서(saveDayAttendance →
 * bridge)·교시 단일 출처(periodCount)는 여기로 승계됐다(메타 가드 §3.10-6 리타깃).
 * 그리드 셸(HomeroomAttendanceGrid)은 스토어를 직접 import 하지 않고, 저장·로드는
 * 이 호스트가 위임한다.
 */
interface AttendanceModeProps {
  /** 담임 반 활성 학생 목록 (RecordsTab의 activeStudentsList) */
  students: readonly Student[];
  selectedDate: string;
  onDateChange: (date: string) => void;
}

export function AttendanceMode({ students, selectedDate, onDateChange }: AttendanceModeProps) {
  const { getDayAttendance, saveDayAttendance } = useTeachingClassStore();
  const bridgeHomeroomDayAttendance = useStudentRecordsStore((s) => s.bridgeHomeroomDayAttendance);
  const className = useSettingsStore((s) => s.settings.className);
  const maxPeriods = useSettingsStore((s) => s.settings.maxPeriods);
  // 교시 목록은 settings(maxPeriods) 단일 출처 — computeAutoPeriods 의 periodCount 와 동일 기준.
  const periodCount = maxPeriods ?? 7;
  const showToast = useToastStore((s) => s.show);

  // 외부 저장(다중날짜 카드 경로 등) 시 그리드가 저장본으로 재시드되도록 스토어 스냅샷에 의존 —
  // 두 기록 경로가 같은 날짜에 겹칠 때 "스토어가 이긴다"(그리드 스냅샷이 다른 기록을 지우지 않게).
  const attendanceRecordsAll = useTeachingClassStore((s) => s.attendanceRecords);
  const gridPeriods = useMemo(
    () => [PERIOD_MORNING, ...Array.from({ length: periodCount }, (_, i) => i + 1), PERIOD_CLOSING],
    [periodCount],
  );
  const gridStudents = useMemo(
    () =>
      students
        .filter((s) => isStudentActive(s) && s.studentNumber != null && s.studentNumber > 0)
        .map((s) => ({ number: s.studentNumber!, name: s.name })),
    [students],
  );

  // ── 좌석 뷰 데이터 (§3.10-4) — 데이터만 읽어 그리드에 주입(그리드는 스토어 미import). ──
  // 읽기 전용: seating 상태만 구독하고 편집 액션은 참조하지 않는다. load()는 데이터 확보용.
  const seating = useSeatingStore((s) => s.seating);
  const seatingLoaded = useSeatingStore((s) => s.loaded);
  const loadSeating = useSeatingStore((s) => s.load);
  useEffect(() => {
    if (!seatingLoaded) void loadSeating();
  }, [seatingLoaded, loadSeating]);

  const seatingProp = useMemo(() => {
    if (!seatingLoaded) return undefined;
    const seats = seating.seats;
    const hasSeats = seats.some((row) => row.some((id) => id != null));
    if (!hasSeats) return undefined; // 좌석 배치가 없으면 토글 숨김
    // id↔번호 매핑 계층 — 좌석은 studentId, 출결은 번호(studentKey). 활성·유번호 학생만.
    const studentMap = new Map<string, { number: number; name: string }>();
    for (const s of students) {
      if (isStudentActive(s) && s.studentNumber != null && s.studentNumber > 0) {
        studentMap.set(s.id, { number: s.studentNumber, name: s.name });
      }
    }
    return {
      layout: seating.layout ?? 'grid',
      rows: seating.rows,
      cols: seating.cols,
      seats,
      studentMap,
    } as const;
  }, [seatingLoaded, seating, students]);
  const loadGridDayRecords = useCallback(
    (date: string) => (className ? getDayAttendance(className, date) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [className, getDayAttendance, attendanceRecordsAll],
  );
  const saveGridDay = useCallback(
    async (date: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => {
      if (!className) {
        showToast('설정에서 담임반을 먼저 입력해주세요', 'info');
        return;
      }
      // 데이터 유실 방지: 하루치 통째 교체 전 스토어 로드 보장 (카드 경로와 동일 가드)
      const tcState = useTeachingClassStore.getState();
      if (!tcState.loaded) await tcState.load();
      // 로드 실패 시 saveDayAttendance 가 조용히 no-op 하므로(저장 안 됨), 미러·성공표시 전에 차단하고
      // 오류를 던져 그리드가 "저장 실패"를 표시하게 한다(저장 안 됐는데 저장됨✓ 표시 방지).
      if (useTeachingClassStore.getState().loadFailed) {
        throw new Error('출결 데이터를 불러오지 못해 저장할 수 없어요. 잠시 후 다시 시도해주세요.');
      }
      const recordsByPeriod = new Map<number, StudentAttendance[]>();
      for (const [p, arr] of byPeriod) recordsByPeriod.set(p, [...arr]);
      await saveDayAttendance(className, date, recordsByPeriod);
      // 미러: bridge 가 students(id+번호)로 number→studentId 재매핑을 수행해
      // att-{studentId}-{date} StudentRecord 를 조립한다.
      await bridgeHomeroomDayAttendance({ className, date, recordsByPeriod, students });
      // 자동 저장 성공 토스트 금지(§3.10-1) — 조용한 "저장됨 ✓" 상태칩으로 대체. 오류만 그리드가 표시.
    },
    [className, saveDayAttendance, bridgeHomeroomDayAttendance, students, showToast],
  );

  // ── 출석번호 무결성 (한 명 → 전원 오염 방어) ──
  const numberIssues = useMemo(
    () => detectStudentNumberIssues(students.map((s) => ({ number: s.studentNumber }))),
    [students],
  );
  // 번호 정리는 비활성 학생을 포함한 전체 명단에 적용해야 저장 시 명단이 잘리지 않는다.
  const allStudents = useStudentStore((s) => s.students);
  const updateStudents = useStudentStore((s) => s.updateStudents);
  const renumberPlan = useMemo(() => {
    const fixed = renumberHomeroomStudents(allStudents);
    let changed = 0;
    for (let i = 0; i < allStudents.length; i += 1) {
      if (allStudents[i]!.studentNumber !== fixed[i]!.studentNumber) changed += 1;
    }
    return { fixed, changed };
  }, [allStudents]);
  const [renumbering, setRenumbering] = useState(false);
  const [showRenumberConfirm, setShowRenumberConfirm] = useState(false);

  const handleRenumber = useCallback(async () => {
    setRenumbering(true);
    try {
      await updateStudents(renumberPlan.fixed);
      showToast('출석번호를 정리했어요. 이제 출결이 학생별로 따로 저장됩니다.', 'success');
      setShowRenumberConfirm(false);
    } catch {
      showToast('번호 정리에 실패했어요. 다시 시도해주세요.', 'error');
    } finally {
      setRenumbering(false);
    }
  }, [updateStudents, renumberPlan, showToast]);

  // ── 여러 날 출결 패널 (§3.6 이관 — 출결 탭이 유일한 출결 입력구) ──
  const [showMultiDay, setShowMultiDay] = useState(false);
  const [multiInitialType, setMultiInitialType] =
    useState<Exclude<AttendanceStatus, 'present'>>('absent');

  // 명령 팔레트 "여러 날 출결" intent 소비 (구 InputMode → AttendanceMode 이동, §3.10-7)
  const intentPending = useMultiDateAttendanceIntentStore((s) => s.pending);
  const intentPreferredType = useMultiDateAttendanceIntentStore((s) => s.preferredAttendanceType);
  const consumeIntent = useMultiDateAttendanceIntentStore((s) => s.consume);
  useEffect(() => {
    if (!intentPending) return;
    consumeIntent();
    if (numberIssues.hasCollisionRisk) {
      showToast('출석번호가 겹치거나 비어 있어요. 먼저 번호를 정리해주세요.', 'info');
      return;
    }
    setMultiInitialType(TYPE_FROM_KR[intentPreferredType] ?? 'absent');
    setShowMultiDay(true);
  }, [intentPending, intentPreferredType, consumeIntent, numberIssues.hasCollisionRisk, showToast]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <DateNavigator selectedDate={selectedDate} onDateChange={onDateChange} pastBadge />
        {className && gridStudents.length > 0 && (
          <button
            type="button"
            disabled={numberIssues.hasCollisionRisk}
            onClick={() => {
              setMultiInitialType('absent');
              setShowMultiDay(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border transition-colors hover:border-sp-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              numberIssues.hasCollisionRisk
                ? '출석번호가 겹치거나 비어 있어요. 먼저 번호를 정리해주세요.'
                : '입원·체험학습 등 여러 날 출결을 한 번에 입력'
            }
          >
            <span className="material-symbols-outlined text-sm">date_range</span>
            여러 날 입력
          </button>
        )}
      </div>

      {!className ? (
        <Notice variant="info" title="담임반을 먼저 설정해주세요">
          <span className="text-sp-muted">
            설정에서 담임 학급을 입력하면 이 화면에서 오늘 출결을 바로 입력할 수 있어요.
          </span>
        </Notice>
      ) : gridStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
          <p className="text-sm">명렬표에 학생을 먼저 등록해주세요.</p>
        </div>
      ) : numberIssues.hasCollisionRisk ? (
        /* 렌더 게이트: 번호 충돌 시 그리드에서 학생 행이 병합돼 편집 자체가 오염되므로
           그리드 대신 정리 안내를 렌더한다 (저장 차단만으로는 부족). */
        <div className="flex items-center gap-3 rounded-lg bg-sp-surface border border-sp-border px-4 py-3">
          <span className="material-symbols-outlined text-sp-accent">warning</span>
          <p className="flex-1 text-xs text-sp-muted leading-relaxed">
            출석번호가 겹치거나 비어 있어 출결 표를 열 수 없어요. 번호가 겹치면 서로 다른 학생의
            출결이 한 줄로 합쳐져 잘못 저장됩니다.
          </p>
          <button
            type="button"
            onClick={() => setShowRenumberConfirm(true)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">format_list_numbered</span>
            번호 정리하기
          </button>
        </div>
      ) : (
        /* 현황 요약 배너는 '조회' 탭으로 이동(피드백 2026-07) — 출결 표 영역을 넓게 확보.
           overflow-auto를 두지 않아 팔레트·도구 바가 고정되고 표만 내부 스크롤된다. */
        <div className="flex-1 min-h-0 flex flex-col">
          <HomeroomAttendanceGrid
            students={gridStudents}
            classId={className}
            date={selectedDate}
            loadDayRecords={loadGridDayRecords}
            onSaveDay={saveGridDay}
            periods={gridPeriods}
            seating={seatingProp}
          />
        </div>
      )}

      {/* ── 출석번호 정리 확인 모달 ── */}
      {showRenumberConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="text-base font-bold text-sp-text flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-sp-accent">format_list_numbered</span>
              출석번호 정리
            </h3>
            <div className="space-y-2 mb-4 text-sm">
              <p className="text-sp-text">
                번호가 비었거나 겹친 학생에게{' '}
                <span className="text-sp-accent font-bold">사용하지 않는 번호</span>를 새로
                부여해요. 이미 번호가 올바른 학생은 그대로 둡니다.
              </p>
              <p className="text-sp-muted">
                번호가 바뀌는 학생:{' '}
                <span className="text-sp-text font-medium">{renumberPlan.changed}명</span>
              </p>
              <p className="text-xs text-sp-muted">
                예전에 이 반 출결을 입력한 적이 있다면, 번호가 바뀐 학생의 지난 기록은 한 번
                확인해주세요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRenumberConfirm(false)}
                disabled={renumbering}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sp-surface text-sp-muted
                         hover:text-sp-text hover:bg-sp-surface/80 transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => void handleRenumber()}
                disabled={renumbering || renumberPlan.changed === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-sp-accent text-white
                         hover:bg-sp-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {renumbering ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">
                      progress_activity
                    </span>
                    정리 중...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">check</span>
                    번호 정리하기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 여러 날 출결 입력 패널 ── */}
      {showMultiDay && className && (
        <MultiDayAttendancePanel
          students={students}
          className={className}
          regularPeriodCount={periodCount}
          periods={gridPeriods}
          defaultDate={selectedDate}
          initialType={multiInitialType}
          onClose={() => setShowMultiDay(false)}
        />
      )}
    </div>
  );
}
