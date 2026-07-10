import { useState, useMemo, useCallback } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentAttendance } from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { detectStudentNumberIssues } from '@domain/rules/studentNumberRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import { DateNavigator } from '@adapters/components/StudentRecords/DateNavigator';
import { Notice } from '@adapters/components/common/Notice';
import { HomeroomAttendanceGrid } from './HomeroomAttendanceGrid';
import { renumberHomeroomStudents } from './recordUtils';

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
      const recordsByPeriod = new Map<number, StudentAttendance[]>();
      for (const [p, arr] of byPeriod) recordsByPeriod.set(p, [...arr]);
      await saveDayAttendance(className, date, recordsByPeriod);
      // 미러: bridge 가 students(id+번호)로 number→studentId 재매핑을 수행해
      // att-{studentId}-{date} StudentRecord 를 조립한다.
      await bridgeHomeroomDayAttendance({ className, date, recordsByPeriod, students });
      showToast('출결을 저장했어요', 'success');
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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <DateNavigator selectedDate={selectedDate} onDateChange={onDateChange} pastBadge />

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
        <div className="flex-1 min-h-0 overflow-auto">
          <HomeroomAttendanceGrid
            students={gridStudents}
            classId={className}
            date={selectedDate}
            loadDayRecords={loadGridDayRecords}
            onSaveDay={saveGridDay}
            periods={gridPeriods}
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
    </div>
  );
}
