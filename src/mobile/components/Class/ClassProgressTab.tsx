import { useEffect, useMemo, useState } from 'react';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { MobileProgressLogModal } from '@mobile/components/Today/MobileProgressLogModal';
import { ActionSheet } from '@mobile/components/common/ActionSheet';
import { ConfirmDialog } from '@mobile/components/common/ConfirmDialog';
import { Spinner } from '@mobile/components/common/Spinner';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { formatDateLabel } from '@mobile/utils/date';
import { ClassProgressEntryItem } from './ClassProgressEntryItem';
import { getMatchingPeriods, type DayTeacherSlot } from '@domain/rules/progressMatching';
import { getDayOfWeek } from '@domain/rules/periodRules';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { TeacherPeriod, ClassScheduleData } from '@domain/entities/Timetable';

const STATUS_CYCLE: Record<ProgressStatus, ProgressStatus> = {
  planned: 'completed',
  completed: 'skipped',
  skipped: 'planned',
};

interface ClassProgressTabProps {
  classId: string;
  className: string;
}

type ModalState =
  | { type: 'closed' }
  | { type: 'add' }
  | { type: 'edit'; entry: ProgressEntry }
  | { type: 'actionSheet'; entry: ProgressEntry }
  | { type: 'confirmDelete'; entry: ProgressEntry };

/**
 * 학급 상세 화면의 진도 서브탭 — 풀 라이프사이클(추가/사이클/편집/삭제) + 시간표 매칭 ✦.
 * Design §3.4
 */
export function ClassProgressTab({ classId, className }: ClassProgressTabProps) {
  const entries = useMobileProgressStore((s) => s.entries);
  const loaded = useMobileProgressStore((s) => s.loaded);
  const load = useMobileProgressStore((s) => s.load);
  const updateEntryStatus = useMobileProgressStore((s) => s.updateEntryStatus);
  const deleteEntry = useMobileProgressStore((s) => s.deleteEntry);

  const classes = useMobileTeachingClassStore((s) => s.classes);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);

  const teacherSchedule = useMobileScheduleStore((s) => s.teacherSchedule);
  const loadSchedule = useMobileScheduleStore((s) => s.load);

  const loadSettings = useMobileSettingsStore((s) => s.load);

  const [modalState, setModalState] = useState<ModalState>({ type: 'closed' });

  useEffect(() => {
    void load();
    void loadClasses();
    void loadSchedule();
    void loadSettings();
  }, [load, loadClasses, loadSchedule, loadSettings]);

  // 해당 학급 진도 항목만 필터, 날짜 내림차순 → 교시 오름차순
  const classEntries = useMemo(() => {
    return entries
      .filter((e) => e.classId === classId)
      .slice()
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return a.period - b.period;
      });
  }, [entries, classId]);

  // 진도 통계
  const stats = useMemo(() => {
    const total = classEntries.length;
    const completed = classEntries.filter((e) => e.status === 'completed').length;
    const planned = classEntries.filter((e) => e.status === 'planned').length;
    const skipped = classEntries.filter((e) => e.status === 'skipped').length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, planned, skipped, percent };
  }, [classEntries]);

  // 날짜별 그룹화
  const grouped = useMemo(() => {
    const groups: { date: string; items: ProgressEntry[] }[] = [];
    let currentDate = '';
    for (const entry of classEntries) {
      if (entry.date !== currentDate) {
        currentDate = entry.date;
        groups.push({ date: currentDate, items: [] });
      }
      groups[groups.length - 1]!.items.push(entry);
    }
    return groups;
  }, [classEntries]);

  // 시간표 매칭 — 그룹 안의 각 날짜별로 매칭 교시 set 계산 (모바일은 변동 머지 미지원이라 baseline만)
  // mobile schedule store는 변동(override) 머지 함수가 없으므로, 요일 기준 baseline 시간표를 그대로 사용한다.
  const matchingPeriodsByDate = useMemo(() => {
    const result = new Map<string, readonly number[]>();
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return result;

    // 모바일에는 settings.enableWeekendDays 필드가 없음 → undefined 전달
    const weekendDays = undefined;
    // 모바일에는 ClassSchedule(우리반 시간표) 데이터가 없음 → 빈 객체 전달 (3단계 폴백 비활성)
    const classSchedule: ClassScheduleData = {};

    for (const { date } of grouped) {
      const dayOfWeek = getDayOfWeek(new Date(date + 'T00:00:00'), weekendDays);
      const baseline = dayOfWeek ? (teacherSchedule[dayOfWeek] ?? []) : [];
      const dayTeacherSchedule = baseline as ReadonlyArray<TeacherPeriod | null>;

      result.set(
        date,
        getMatchingPeriods({
          date,
          className: cls.name,
          classSubject: cls.subject,
          dayTeacherSchedule: dayTeacherSchedule as ReadonlyArray<DayTeacherSlot | null>,
          classSchedule,
          weekendDays,
        }),
      );
    }
    return result;
  }, [grouped, classes, classId, teacherSchedule]);

  const handleCycleStatus = async (entry: ProgressEntry) => {
    const next = STATUS_CYCLE[entry.status];
    await updateEntryStatus(entry, next);
  };

  const handleConfirmDelete = async (entry: ProgressEntry) => {
    await deleteEntry(entry.id);
    setModalState({ type: 'closed' });
  };

  if (!loaded) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* 진도 요약 + 추가 버튼 (헤더 영역) */}
      <div className="px-4 py-3 border-b border-sp-border shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* 진도율 바 */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-2 bg-sp-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-sp-accent transition-all"
                  style={{ width: `${stats.percent}%` }}
                  role="progressbar"
                  aria-valuenow={stats.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`진도율 ${stats.percent}%`}
                />
              </div>
              <span className="text-sp-text text-xs font-medium tabular-nums">
                {stats.percent}%
              </span>
            </div>
            {/* 통계 라벨 */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-400">완료 {stats.completed}</span>
              <span className="text-amber-400">미실시 {stats.skipped}</span>
              <span className="text-blue-400">예정 {stats.planned}</span>
            </div>
          </div>
          {/* + 버튼 — Design §2.2 (MemoPage·TodoPage 일관 패턴) */}
          <button
            onClick={() => setModalState({ type: 'add' })}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent shrink-0 active:scale-95 transition-transform"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label={`${className} 진도 항목 추가`}
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </div>

      {/* 항목 그룹 리스트 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {classEntries.length === 0 ? (
          <EmptyState
            icon="trending_up"
            text="아직 진도 기록이 없습니다."
            actionLabel="첫 진도 기록"
            onAction={() => setModalState({ type: 'add' })}
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(({ date, items }) => {
              const matching = matchingPeriodsByDate.get(date) ?? [];
              return (
                <section key={date}>
                  <h4 className="text-sp-muted text-xs font-medium mb-2 px-1">
                    {formatDateLabel(date)}
                  </h4>
                  <ul className="space-y-2">
                    {items.map((entry) => {
                      const openActionSheet = () => setModalState({ type: 'actionSheet', entry });
                      return (
                        <li key={entry.id}>
                          <ClassProgressEntryItem
                            entry={entry}
                            isMatchingPeriod={matching.includes(entry.period)}
                            onCycleStatus={handleCycleStatus}
                            onLongPress={openActionSheet}
                            onActionMenu={openActionSheet}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* 추가 모달 */}
      {modalState.type === 'add' && (
        <MobileProgressLogModal
          isOpen
          mode="add"
          defaultClassId={classId}
          lockClass
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 편집 모달 */}
      {modalState.type === 'edit' && (
        <MobileProgressLogModal
          isOpen
          mode="edit"
          defaultClassId={classId}
          lockClass
          entryToEdit={modalState.entry}
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 액션시트 (Bottom-Sheet 스타일) */}
      {modalState.type === 'actionSheet' && (
        <ActionSheet
          onEdit={() => setModalState({ type: 'edit', entry: modalState.entry })}
          onDelete={() => setModalState({ type: 'confirmDelete', entry: modalState.entry })}
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {modalState.type === 'confirmDelete' && (
        <ConfirmDialog
          title="진도 항목 삭제"
          message={
            <>
              {modalState.entry.unit} ({modalState.entry.period}교시)을(를) 삭제하시겠어요?
            </>
          }
          onConfirm={() => void handleConfirmDelete(modalState.entry)}
          onCancel={() => setModalState({ type: 'closed' })}
        />
      )}
    </div>
  );
}
