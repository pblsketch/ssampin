import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import {
  settingsLevelToNeisLevel,
  getGradeRange,
  getCurrentAcademicYear,
  getCurrentSemester,
  getCurrentWeekRange,
} from '@domain/entities/NeisTimetable';
import type { NeisClassInfo } from '@domain/entities/NeisTimetable';
import {
  transformToClassSchedule,
  getMaxPeriod,
} from '@domain/rules/neisTransformRules';
import { smartAutoAssignColors, extractSubjectsFromSchedule } from '@domain/rules/subjectColorRules';
import { DEFAULT_SUBJECT_COLORS } from '@domain/valueObjects/SubjectColor';
import { getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-sp-accent' : 'bg-sp-border'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export function NeisTimetableAutoSyncSection() {
  const { settings, update: updateSettings } = useSettingsStore();
  const updateClassSchedule = useScheduleStore((s) => s.updateClassSchedule);
  const { show: showToast } = useToastStore();

  const [syncing, setSyncing] = useState(false);
  const [classList, setClassList] = useState<readonly NeisClassInfo[]>([]);
  const [classListLoading, setClassListLoading] = useState(false);

  const hasSchoolInfo = Boolean(settings.neis.atptCode && settings.neis.schoolCode);
  const autoSync = settings.neis.autoSync;
  const neisLevel = settingsLevelToNeisLevel(settings.schoolLevel);
  const gradeRange = getGradeRange(neisLevel);

  // 학년 변경 시 반 목록 로드
  useEffect(() => {
    if (!hasSchoolInfo || !autoSync?.grade) return;

    setClassListLoading(true);
    void neisPort
      .getClassList({
        apiKey: NEIS_API_KEY,
        officeCode: settings.neis.atptCode,
        schoolCode: settings.neis.schoolCode,
        academicYear: getCurrentAcademicYear(),
        grade: autoSync.grade,
      })
      .then(setClassList)
      .catch(() => setClassList([]))
      .finally(() => setClassListLoading(false));
  }, [hasSchoolInfo, autoSync?.grade, settings.neis.atptCode, settings.neis.schoolCode]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (enabled && !hasSchoolInfo) {
      showToast('먼저 학교를 검색해주세요.', 'error');
      return;
    }

    await updateSettings({
      neis: {
        ...settings.neis,
        autoSync: {
          ...(autoSync ?? { enabled: false, grade: '', className: '', lastSyncDate: '', lastSyncWeek: '', syncTarget: 'class' as const }),
          enabled,
        },
      },
    });

    if (enabled) {
      showToast('시간표 자동 동기화가 켜졌습니다.', 'info');
    }
  }, [hasSchoolInfo, settings.neis, autoSync, updateSettings, showToast]);

  const handleGradeChange = useCallback(async (grade: string) => {
    await updateSettings({
      neis: {
        ...settings.neis,
        autoSync: {
          ...(autoSync ?? { enabled: false, grade: '', className: '', lastSyncDate: '', lastSyncWeek: '', syncTarget: 'class' as const }),
          grade,
          className: '', // 학년 변경 시 반 초기화
        },
      },
    });
  }, [settings.neis, autoSync, updateSettings]);

  const handleClassChange = useCallback(async (className: string) => {
    await updateSettings({
      neis: {
        ...settings.neis,
        autoSync: {
          ...(autoSync ?? { enabled: false, grade: '', className: '', lastSyncDate: '', lastSyncWeek: '', syncTarget: 'class' as const }),
          className,
        },
      },
    });
  }, [settings.neis, autoSync, updateSettings]);

  const handleSyncNow = useCallback(async () => {
    if (!hasSchoolInfo || !autoSync?.grade || !autoSync?.className) {
      showToast('학년/반을 선택해주세요.', 'error');
      return;
    }

    setSyncing(true);
    try {
      const { fromDate, toDate } = getCurrentWeekRange();
      const rows = await neisPort.getTimetable({
        apiKey: NEIS_API_KEY,
        officeCode: settings.neis.atptCode,
        schoolCode: settings.neis.schoolCode,
        schoolLevel: neisLevel,
        academicYear: getCurrentAcademicYear(),
        semester: getCurrentSemester(),
        grade: autoSync.grade,
        className: autoSync.className,
        fromDate,
        toDate,
      });

      if (rows.length === 0) {
        showToast('해당 기간의 시간표 데이터가 없습니다.', 'error');
        return;
      }

      const maxPeriods = getMaxPeriod(rows);
      const data = transformToClassSchedule(rows, maxPeriods);
      await updateClassSchedule(data);

      // 새 과목 색상 배정
      const currentColors = settings.subjectColors ?? {};
      const allSubjects = extractSubjectsFromSchedule(data);
      const newSubjects = allSubjects.filter(
        (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
      );
      if (newSubjects.length > 0) {
        const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
        await updateSettings({ subjectColors: updatedColors });
      }

      // maxPeriods + lastSync 업데이트
      await updateSettings({
        ...(maxPeriods > settings.maxPeriods ? { maxPeriods } : {}),
        neis: {
          ...settings.neis,
          autoSync: {
            ...autoSync,
            lastSyncDate: new Date().toISOString().slice(0, 10),
            lastSyncWeek: getCurrentISOWeek(),
          },
        },
      });

      showToast('시간표를 성공적으로 동기화했습니다!', 'success');
    } catch {
      showToast('시간표 동기화에 실패했습니다.', 'error');
    } finally {
      setSyncing(false);
    }
  }, [hasSchoolInfo, autoSync, settings, neisLevel, updateClassSchedule, updateSettings, showToast]);

  const formatLastSync = (date: string): string => {
    if (!date) return '동기화한 적 없음';
    return date;
  };

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-sp-accent/10 text-sp-accent">
          <span className="material-symbols-outlined">sync</span>
        </div>
        <h3 className="text-lg font-bold text-sp-text">NEIS 시간표 자동 동기화</h3>
      </div>

      <div className="space-y-5">
        {/* 메인 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-sp-text">시간표 자동 동기화</p>
            <p className="text-xs text-sp-muted mt-0.5">
              매주 앱 시작 시 이번 주 시간표를 자동으로 가져옵니다
            </p>
          </div>
          <Toggle checked={autoSync?.enabled ?? false} onChange={(v) => void handleToggle(v)} />
        </div>

        {/* OFF + 학교 미설정 안내 */}
        {!autoSync?.enabled && !hasSchoolInfo && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <span className="material-symbols-outlined text-yellow-500 text-[18px] mt-0.5">info</span>
            <p className="text-xs text-yellow-200/80">
              먼저 위의 &quot;학교/학급 정보&quot; 섹션에서 학교를 검색해주세요.
            </p>
          </div>
        )}

        {/* ON 시 상세 설정 */}
        {autoSync?.enabled && (
          <>
            {/* 학년/반 설정 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sp-muted">학년</label>
                <select
                  value={autoSync.grade}
                  onChange={(e) => void handleGradeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                >
                  <option value="">선택</option>
                  {gradeRange.map((g) => (
                    <option key={g} value={String(g)}>{g}학년</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sp-muted">반</label>
                {classListLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sp-muted text-sm">
                    <div className="w-4 h-4 border-2 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
                    로딩 중...
                  </div>
                ) : (
                  <select
                    value={autoSync.className}
                    onChange={(e) => void handleClassChange(e.target.value)}
                    disabled={!autoSync.grade || classList.length === 0}
                    className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-40"
                  >
                    <option value="">선택</option>
                    {classList.map((c) => (
                      <option key={c.CLASS_NM} value={c.CLASS_NM}>{c.CLASS_NM}반</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* 동기화 상태 */}
            <div className="p-4 rounded-lg bg-sp-surface/60 border border-sp-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {autoSync.lastSyncDate ? (
                    <span className="material-symbols-outlined text-green-400 text-[18px]">check_circle</span>
                  ) : (
                    <span className="material-symbols-outlined text-sp-muted text-[18px]">sync</span>
                  )}
                  <div>
                    <p className="text-xs text-sp-muted">마지막 동기화</p>
                    <p className="text-sm text-sp-text font-medium">
                      {formatLastSync(autoSync.lastSyncDate)}
                    </p>
                  </div>
                </div>
                {autoSync.grade && autoSync.className && (
                  <div className="text-right">
                    <p className="text-xs text-sp-muted">대상</p>
                    <p className="text-sm text-sp-text font-bold">
                      {autoSync.grade}학년 {autoSync.className}반
                    </p>
                  </div>
                )}
              </div>

              {/* 동기화 버튼 */}
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={syncing || !autoSync.grade || !autoSync.className}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sp-accent hover:bg-sp-accent/20 text-sm font-medium transition-all disabled:opacity-50"
              >
                {syncing ? (
                  <div className="w-4 h-4 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                )}
                {syncing ? '동기화 중...' : '지금 동기화'}
              </button>
            </div>

            <p className="text-xs text-sp-muted">
              매주 월요일부터 금요일까지의 시간표를 NEIS에서 자동으로 가져옵니다. 새 과목이 있으면 색상이 자동으로 배정됩니다.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
