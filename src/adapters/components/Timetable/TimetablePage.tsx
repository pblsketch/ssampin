import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import {
  buildWeeklyProgressGrid,
  summarizeClassProgress,
  cellKey,
  type ClassProgressSummary,
} from '@domain/rules/progressCalendarRules';
import { ProgressCellOverlay } from '@adapters/components/Progress/ProgressCellOverlay';
import { ProgressQuickEntryModal } from '@adapters/components/Progress/ProgressQuickEntryModal';
import { useProgressQuickEntry } from '@adapters/components/Progress/useProgressQuickEntry';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { toLocalDateString } from '@shared/utils/localDate';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { formatTermKo } from '@domain/rules/academicCalendar';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';
import { decideTimetableTermRefresh } from '@domain/rules/timetableTermRefresh';
import { TimetableTermRefreshBanner } from './TimetableTermRefreshBanner';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import { periodTimesToSettingsPatch } from '@domain/rules/comciganRules';
import type { ParsedComciganPeriodTimes } from '@domain/rules/comciganRules';
import type { DayOfWeekFull } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { periodTimeLabel } from '@domain/rules/periodLabel';
import type { TeacherPeriod, ClassPeriod, TimetableOverride } from '@domain/entities/Timetable';
import type { SubjectColorMap, SubjectColorId } from '@domain/valueObjects/SubjectColor';
import { DEFAULT_SUBJECT_COLORS } from '@domain/valueObjects/SubjectColor';
import {
  getSubjectStyle,
  getCellStyle,
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import {
  smartAutoAssignColors,
  extractSubjectsFromSchedule,
  extractClassroomsFromSchedule,
  autoAssignClassroomColors,
} from '@domain/rules/subjectColorRules';
import { getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';
import { checkComciganTimetableChange } from '@adapters/hooks/useComciganAutoSync';
import { checkAppinTimetableChange } from '@adapters/hooks/useAppinAutoSync';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { ComciganTeacherFingerprint } from '@domain/entities/Settings';
import { TimetableEditor } from './TimetableEditor';
import { TempChangeModal } from './TempChangeModal';
import { TimetableOverridesPanel } from './TimetableOverridesPanel';
import { InlineColorPalette } from './InlineColorPalette';
import { NeisImportModal } from './NeisImportModal';
import { ComciganImportModal } from './ComciganImportModal';
import { ComciganClassImportModal } from './ComciganClassImportModal';
import { AppinClassImportModal } from './AppinClassImportModal';
import { AppinTeacherImportModal } from './AppinTeacherImportModal';
import { NeisTeacherImportModal } from './NeisTeacherImportModal';
import { ImportSourceMenu, type ImportSource } from './ImportSourceMenu';
import { TeacherExcelPreviewModal } from './TeacherExcelPreviewModal';
/* eslint-disable no-restricted-imports */
import {
  exportClassScheduleToExcel,
  exportTeacherScheduleToExcel,
} from '@infrastructure/export/ExcelExporter';
import {
  exportClassScheduleToHwpx,
  exportTeacherScheduleToHwpx,
} from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */

type TabType = 'class' | 'teacher';

/**
 * 시간표 페이지 진입 의도.
 * - 'sync-review': 위젯 새로고침에서 감지한 시간표 변동을 이어서 검토하러 왔다.
 *   감지 결과(검토 대기 상태)는 창별 메모리라 위젯 → 메인으로 넘어오지 못하므로,
 *   여기 도착한 뒤 이미 대기 중인 검토가 있으면 바로 열고, 없으면 한 번 더 확인한다.
 */
export type TimetableInitialIntent = 'sync-review';

interface TimetablePageProps {
  readonly initialIntent?: TimetableInitialIntent | null;
  readonly onIntentConsumed?: () => void;
}

export function TimetablePage({ initialIntent = null, onIntentConsumed }: TimetablePageProps = {}) {
  const {
    classSchedule,
    teacherSchedule,
    overrides,
    load: loadSchedule,
    addOverride,
    addSwapPair,
    updateOverride,
    deleteOverride,
    getEffectiveClassSchedule,
    getEffectiveTeacherSchedule,
  } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const { classes, progressEntries, load: loadClasses } = useTeachingClassStore();
  useAnalytics();
  const [tab, setTabState] = useState<TabType>(
    settings.timetableDefaultView ?? (settings.schoolLevel === 'elementary' ? 'class' : 'teacher'),
  );
  /** 진도 보기 오버레이 (교사 탭 전용) */
  const [showProgress, setShowProgress] = useState(false);
  const tabInitializedRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    void loadSchedule();
    void loadSettings();
    void loadClasses();
  }, [loadSchedule, loadSettings, loadClasses]);

  // Settings 비동기 로드 완료 후 초기 탭을 한 번만 동기화
  useEffect(() => {
    if (tabInitializedRef.current) return;
    if (settings.timetableDefaultView || settings.schoolLevel) {
      setTabState(
        settings.timetableDefaultView ??
          (settings.schoolLevel === 'elementary' ? 'class' : 'teacher'),
      );
      tabInitializedRef.current = true;
    }
  }, [settings.timetableDefaultView, settings.schoolLevel]);

  // 색상 모드: schoolLevel 기반 기본값
  const colorBy =
    settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');
  const classroomColors = settings.classroomColors;

  // 기존 사용자 마이그레이션: 색상 미배정 과목 자동 배정
  useEffect(() => {
    const currentColors = settings.subjectColors ?? {};
    const allSubjects = extractSubjectsFromSchedule(classSchedule);
    const uncolored = allSubjects.filter(
      (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
    );
    if (uncolored.length > 0) {
      const updated = smartAutoAssignColors(currentColors, uncolored);
      void updateSettings({ subjectColors: updated });
    }
  }, [classSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // 학반 색상 자동 배정
  useEffect(() => {
    if (colorBy !== 'classroom') return;
    const currentColors = settings.classroomColors ?? {};
    const allClassrooms = extractClassroomsFromSchedule(teacherSchedule);
    const uncolored = allClassrooms.filter((c) => !(c in currentColors));
    if (uncolored.length > 0) {
      const updated = autoAssignClassroomColors(currentColors, uncolored);
      void updateSettings({ classroomColors: updated });
    }
  }, [teacherSchedule, colorBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1분마다 현재 시각 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const weekendDays = settings.enableWeekendDays;
  const activeDays = useMemo(() => getActiveDays(weekendDays), [weekendDays]);

  const dayOfWeek = useMemo(() => getDayOfWeek(now, weekendDays), [now, weekendDays]);
  const currentPeriod = useMemo(
    () => (dayOfWeek ? getCurrentPeriod(settings.periodTimes, now) : null),
    [dayOfWeek, settings.periodTimes, now],
  );

  // 이번 주 월~토(또는 금) 날짜 계산
  const weekDates = useMemo(() => {
    const d = new Date(now);
    const jsDay = d.getDay(); // 0=일 ... 6=토
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    return activeDays.map((_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return toLocalDateString(date);
    });
  }, [now, activeDays]);

  // 오버라이드 맵: 날짜+교시 → override (우클릭 셀 UI에서 "이미 변동 있음" 표시용)
  const overrideMap = useMemo(() => {
    const map = new Map<string, TimetableOverride>();
    for (const o of overrides) {
      // 현재 탭 기준으로 적용되는 override만 지도에 포함
      const scope = o.scope ?? 'both';
      const applies = scope === 'both' || scope === (tab === 'class' ? 'class' : 'teacher');
      if (applies) {
        map.set(`${o.date}:${o.period}`, o);
      }
    }
    return map;
  }, [overrides, tab]);

  // 이번 주 날짜별 유효 시간표 (scope 필터 적용)
  const effectiveClassByDate = useMemo(() => {
    const map = new Map<string, readonly ClassPeriod[]>();
    weekDates.forEach((date) => {
      map.set(date, getEffectiveClassSchedule(date, weekendDays));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates, classSchedule, overrides, weekendDays]);

  const effectiveTeacherByDate = useMemo(() => {
    const map = new Map<string, readonly (TeacherPeriod | null)[]>();
    weekDates.forEach((date) => {
      map.set(date, getEffectiveTeacherSchedule(date, weekendDays));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates, teacherSchedule, overrides, weekendDays]);

  /* ── 진도 보기 오버레이 (교사 탭 전용) ── */
  const periodNumbers = useMemo(
    () => settings.periodTimes.slice(0, settings.maxPeriods).map((pt) => pt.period),
    [settings.periodTimes, settings.maxPeriods],
  );

  // 유효(변동 머지) 교사 시간표를 도메인 셀렉터에 주입 — base 시간표를 넘기면 자습 셀 오표시(Critic 캐비엇)
  const progressGrid = useMemo(() => {
    if (!showProgress) return null;
    const dayTeacherSchedules = weekDates.map((date) => effectiveTeacherByDate.get(date) ?? []);
    return buildWeeklyProgressGrid({
      weekDates,
      periods: periodNumbers,
      dayTeacherSchedules,
      progressEntries,
      classes,
    });
  }, [showProgress, weekDates, effectiveTeacherByDate, periodNumbers, progressEntries, classes]);

  const progressClassSummaries = useMemo(() => {
    if (!showProgress) return null;
    const map = new Map<string, ClassProgressSummary>();
    for (const cls of classes) {
      map.set(cls.id, summarizeClassProgress(progressEntries.filter((e) => e.classId === cls.id)));
    }
    return map;
  }, [showProgress, classes, progressEntries]);

  // 진도 빠른 입력/편집 상태 머신 — B안(수업 관리 캘린더)과 공유
  const {
    modal: progressModal,
    openAdd: openProgressAdd,
    openEntry: openProgressEntry,
    submit: handleProgressSubmit,
    remove: handleProgressDelete,
    close: closeProgressModal,
    accentFor: progressAccentFor,
    fanout: progressFanout,
  } = useProgressQuickEntry({
    colorBy,
    subjectColors: settings.subjectColors,
    classroomColors: settings.classroomColors,
  });

  // 셀별 진도 오버레이 렌더프롭 — 셀은 진도 데이터를 모르고, 이 클로저만 grid를 조회한다
  const renderCellOverlay = useCallback(
    (dayIdx: number, period: number): ReactNode => {
      if (!showProgress || tab !== 'teacher' || !progressGrid) return null;
      const cell = progressGrid.get(cellKey(dayIdx, period));
      if (!cell || !cell.matchedClass) return null;
      return (
        <ProgressCellOverlay
          cell={cell}
          classSummary={progressClassSummaries?.get(cell.matchedClass.id)}
          asOverlay
          onAddClick={() => openProgressAdd(cell)}
          onEntryClick={() => openProgressEntry(cell)}
        />
      );
    },
    [showProgress, tab, progressGrid, progressClassSummaries, openProgressAdd, openProgressEntry],
  );

  // 임시 변경 모달 상태
  const [tempChangeTarget, setTempChangeTarget] = useState<{
    date: string;
    period: number;
    dayIdx: number;
    subject: string;
    classroom?: string;
  } | null>(null);

  // 변동 시간표 관리 패널 상태
  const [overridesPanelOpen, setOverridesPanelOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimetableOverride | null>(null);
  /** 드로어 "+ 변동 추가"에서 열리는 모달 (slotEditable=true) */
  const [addFromPanelOpen, setAddFromPanelOpen] = useState(false);

  // 미래 변동 개수 (뱃지용)
  const futureOverrideCount = useMemo(() => {
    const today = toLocalDateString(new Date());
    return overrides.filter((o) => o.date >= today).length;
  }, [overrides]);

  const lunchIndex = useMemo(
    () =>
      getLunchBreakIndex(
        settings.periodTimes,
        settings.lunchStart,
        settings.lunchEnd,
        settings.lunchAfterPeriod,
      ),
    [settings.periodTimes, settings.lunchStart, settings.lunchEnd, settings.lunchAfterPeriod],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(settings.periodTimes, lunchIndex) : ''),
    [settings.periodTimes, lunchIndex],
  );

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 색상 팔레트 상태: 어떤 셀이 열려있는지 (day index + period number)
  const [openPalette, setOpenPalette] = useState<{ dayIdx: number; period: number } | null>(null);

  // 색상 팔레트 외부 클릭 등으로 닫힐 때 사용
  const closePalette = useCallback(() => setOpenPalette(null), []);

  // 외부 클릭 시 드롭다운 닫기
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

  const handleExport = useCallback(
    async (format: 'excel' | 'hwpx') => {
      setShowExportMenu(false);
      try {
        let data: ArrayBuffer | Uint8Array;
        let defaultFileName: string;

        if (format === 'excel') {
          if (tab === 'class') {
            data = await exportClassScheduleToExcel(
              classSchedule,
              settings.maxPeriods,
              settings.subjectColors,
              settings.periodTimes,
            );
            defaultFileName = '학급시간표.xlsx';
          } else {
            data = await exportTeacherScheduleToExcel(
              teacherSchedule,
              settings.maxPeriods,
              settings.subjectColors,
              colorBy,
              classroomColors,
              settings.periodTimes,
            );
            defaultFileName = '교사시간표.xlsx';
          }
        } else {
          if (tab === 'class') {
            data = await exportClassScheduleToHwpx(
              classSchedule,
              settings.maxPeriods,
              settings.periodTimes,
            );
            defaultFileName = '학급시간표.hwpx';
          } else {
            data = await exportTeacherScheduleToHwpx(
              teacherSchedule,
              settings.maxPeriods,
              settings.periodTimes,
            );
            defaultFileName = '교사시간표.hwpx';
          }
        }

        const normalized: ArrayBuffer | string =
          data instanceof Uint8Array
            ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
            : data;

        if (window.electronAPI) {
          const ext = format === 'excel' ? 'xlsx' : 'hwpx';
          const filterName = format === 'excel' ? 'Excel 파일' : '한글 문서';
          const saved = await window.electronAPI.showSaveDialog({
            title: '내보내기',
            defaultPath: defaultFileName,
            filters: [{ name: filterName, extensions: [ext] }],
          });
          if (saved) {
            await window.electronAPI.writeFile(saved.handle, normalized);
            showToast('파일이 저장되었습니다', 'success', {
              label: '파일 열기',
              onClick: () => window.electronAPI?.openFile(saved.handle),
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
    },
    [tab, classSchedule, teacherSchedule, settings.maxPeriods, showToast],
  );

  const updateSettings = useSettingsStore((s) => s.update);
  const updateClassSchedule = useScheduleStore((s) => s.updateClassSchedule);

  // 시간표 탭 전환 — 상태 반영 + 다음 진입 시 기억되도록 Settings에 저장
  const handleTabChange = useCallback(
    (next: TabType) => {
      setTabState(next);
      tabInitializedRef.current = true;
      void updateSettings({ timetableDefaultView: next });
    },
    [updateSettings],
  );

  // 보기 모드 색상 변경 핸들러
  const handleViewColorChange = useCallback(
    (key: string, colorId: SubjectColorId) => {
      if (colorBy === 'classroom') {
        void updateSettings({
          classroomColors: { ...settings.classroomColors, [key]: colorId },
        });
      } else {
        void updateSettings({
          subjectColors: { ...settings.subjectColors, [key]: colorId },
        });
      }
      setOpenPalette(null);
    },
    [settings.subjectColors, settings.classroomColors, colorBy, updateSettings],
  );

  // ── 나이스 불러오기 모달 ──
  const [showNeisImport, setShowNeisImport] = useState(false);

  // ── 컴시간 교사 시간표 불러오기 모달 ──
  const [showComciganImport, setShowComciganImport] = useState(false);

  // ── 컴시간 학급 시간표 불러오기 모달 ──
  const [showComciganClassImport, setShowComciganClassImport] = useState(false);

  // ── 압핀 학급 시간표 불러오기 모달 ──
  const [showAppinClassImport, setShowAppinClassImport] = useState(false);

  // ── 압핀 교사 시간표 불러오기 모달 ──
  const [showAppinTeacherImport, setShowAppinTeacherImport] = useState(false);

  // ── 나이스 교사 시간표(학급 재조합) 불러오기 모달 ──
  const [showNeisTeacherImport, setShowNeisTeacherImport] = useState(false);

  // ── 불러오기 소스(현재 탭 기준) — 단일 '불러오기' 드롭다운에 넘김 ──
  const importSources = useMemo<readonly ImportSource[]>(() => {
    if (tab === 'class') {
      const list: ImportSource[] = [];
      if (settings.schoolLevel !== 'custom') {
        list.push({
          key: 'neis',
          label: '나이스에서 불러오기',
          hint: '우리 반 시간표를 나이스에서',
          onSelect: () => setShowNeisImport(true),
        });
      }
      list.push({
        key: 'comcigan',
        label: '컴시간에서 불러오기',
        hint: '컴시간 쓰는 학교 — 담당 교사까지 채워요',
        onSelect: () => setShowComciganClassImport(true),
      });
      list.push({
        key: 'appin',
        label: '압핀에서 불러오기',
        hint: '압핀 쓰는 학교',
        onSelect: () => setShowAppinClassImport(true),
      });
      return list;
    }
    // 교사 시간표 탭
    const list: ImportSource[] = [
      {
        key: 'comcigan',
        label: '컴시간에서 불러오기',
        hint: '이름으로 검색해서 불러와요',
        onSelect: () => setShowComciganImport(true),
      },
      {
        key: 'appin',
        label: '압핀에서 불러오기',
        hint: '교사 번호로 불러와요',
        onSelect: () => setShowAppinTeacherImport(true),
      },
    ];
    // 나이스는 교사 시간표 API가 없어 수업반 과목으로 학급 시간표를 재조합한다(베타).
    // 학교급(초/중/고)이 정해져야 올바른 엔드포인트를 쓸 수 있어 '직접 설정'에선 제외.
    if (settings.schoolLevel !== 'custom') {
      list.push({
        key: 'neis',
        label: '나이스에서 불러오기',
        hint: '수업반으로 재조합 (베타)',
        onSelect: () => setShowNeisTeacherImport(true),
      });
    }
    return list;
  }, [tab, settings.schoolLevel]);

  const hasExistingData = useMemo(() => {
    return activeDays.some((day) =>
      (classSchedule[day] ?? []).some((cp) => cp.subject.trim() !== ''),
    );
  }, [classSchedule, activeDays]);

  /* ── 새 학기 시간표 갱신 확인 ──────────────────────────────────────────────
     시간표는 학기가 바뀌어도 자동으로 갱신되지 않는다(원본은 학교가 올려야 한다). 학급·교사 중
     어느 쪽이든 내용이 있으면 갱신 여부를 묻는다. 판정은 domain 순수 규칙이 한다. */
  const [termBannerDismissed, setTermBannerDismissed] = useState(false);

  const hasAnyTimetableData = useMemo(() => {
    const teacherFilled = activeDays.some((day) =>
      (teacherSchedule[day] ?? []).some((tp) => tp !== null && tp.subject.trim() !== ''),
    );
    return hasExistingData || teacherFilled;
  }, [hasExistingData, teacherSchedule, activeDays]);

  // 개학일을 등록한 학교는 8월 개학도 여기서 2학기로 답한다 — 그래야 갱신 배너가 9월을
  // 기다리지 않고 개학 주에 뜬다(달력만 보던 시절엔 8월 개학 학교가 지난 학기 표를 계속 봤다).
  const currentTermLabel = useCurrentTerm();

  const termRefresh = useMemo(
    () =>
      decideTimetableTermRefresh({
        currentTerm: currentTermLabel,
        ackedTerm: settings.timetableTermAck,
        hasTimetableData: hasAnyTimetableData,
      }),
    [currentTermLabel, settings.timetableTermAck, hasAnyTimetableData],
  );

  // 스탬프가 없거나(구버전 이력) 물을 것이 없으면 배너 없이 조용히 채운다.
  useEffect(() => {
    if (termRefresh.kind !== 'silent-stamp') return;
    void updateSettings({ timetableTermAck: termRefresh.term });
  }, [termRefresh, updateSettings]);

  const ackTimetableTerm = useCallback(() => {
    void updateSettings({ timetableTermAck: currentTermLabel });
  }, [updateSettings, currentTermLabel]);

  /**
   * 시간표가 실제로 바뀌면 그것으로 "이번 학기 확인"이 끝난 것으로 본다.
   *
   * 시간표를 쓰는 경로가 9곳(불러오기 3종·자동연동 3종·직접 편집·엑셀·검토 적용)이라 각 지점에
   * 스탬프를 심으면 새 경로가 생길 때마다 빠진다. 스토어 값 변화 한 곳에서 관측한다.
   *
   * ⚠️ `loaded` 이후 **두 번째 관측부터**만 사용자의 갱신으로 센다 — 앱 시작 시 디스크에서 채워지는
   * 첫 변화까지 갱신으로 세면 배너가 아무에게도 안 뜬다.
   */
  const scheduleLoaded = useScheduleStore((s) => s.loaded);
  const seenSchedulesRef = useRef<{ cls: ClassScheduleData; tea: TeacherScheduleData } | null>(
    null,
  );

  useEffect(() => {
    if (!scheduleLoaded) return;
    const prev = seenSchedulesRef.current;
    seenSchedulesRef.current = { cls: classSchedule, tea: teacherSchedule };
    if (prev === null) return; // 로드 직후 첫 관측 — 사용자의 갱신이 아니다
    if (prev.cls === classSchedule && prev.tea === teacherSchedule) return;
    if (settings.timetableTermAck === currentTermLabel) return;
    void updateSettings({ timetableTermAck: currentTermLabel });
    setTermBannerDismissed(true);
  }, [
    scheduleLoaded,
    classSchedule,
    teacherSchedule,
    settings.timetableTermAck,
    currentTermLabel,
    updateSettings,
  ]);

  const handleNeisImport = useCallback(
    async (data: ClassScheduleData, maxPeriods: number) => {
      await updateClassSchedule(data);
      if (maxPeriods !== settings.maxPeriods) {
        await updateSettings({ maxPeriods });
      }
      const currentColors = settings.subjectColors ?? {};
      const allSubjects = extractSubjectsFromSchedule(data);
      const newSubjects = allSubjects.filter(
        (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
      );
      if (newSubjects.length > 0) {
        const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
        await updateSettings({ subjectColors: updatedColors });
      }
    },
    [updateClassSchedule, settings.maxPeriods, settings.subjectColors, updateSettings],
  );

  const handleEnableAutoSync = useCallback(
    async (grade: string, className_: string) => {
      await updateSettings({
        neis: {
          ...settings.neis,
          autoSync: {
            enabled: true,
            grade,
            className: className_,
            lastSyncDate: toLocalDateString(),
            lastSyncWeek: getCurrentISOWeek(),
            syncTarget: 'class',
          },
        },
      });
      showToast('자동 동기화가 설정되었습니다!', 'success');
    },
    [settings.neis, updateSettings, showToast],
  );

  /* ── 교사 시간표 불러오기 미리보기 (컴시간 경로 — 메인 페이지) ── */
  const updateTeacherSchedule = useScheduleStore((s) => s.updateTeacherSchedule);
  const [showExcelPreview, setShowExcelPreview] = useState(false);
  const [previewSchedule, setPreviewSchedule] = useState<TeacherScheduleData | null>(null);
  // 컴시간 교사 불러오기에서 '교시 시각 함께 가져오기' 선택 시 확정 단계에 적용할 payload
  const [previewPeriodTimes, setPreviewPeriodTimes] = useState<ParsedComciganPeriodTimes | null>(
    null,
  );
  // 컴시간 자동연동: 확정 시 저장할 교사 지문(자동 변경감지용). 미리보기가 컴시간 경로일 때만 셋.
  const [previewFingerprint, setPreviewFingerprint] = useState<ComciganTeacherFingerprint | null>(
    null,
  );

  // ── 컴시간 변경 감지: 대기 중 검토 + 수동 확인 ──
  const pendingComciganReview = useScheduleStore((s) => s.pendingComciganReview);
  const setPendingComciganReview = useScheduleStore((s) => s.setPendingComciganReview);
  const [checkingComcigan, setCheckingComcigan] = useState(false);
  const comciganAutoSyncOn = settings.comcigan?.autoSync?.enabled === true;

  // 감지된 변경을 미리보기(비파괴)로 연다 — 지문은 이미 저장돼 있어 재저장 안 함
  const handleReviewComcigan = useCallback(() => {
    if (!pendingComciganReview) return;
    setPreviewSchedule(pendingComciganReview.schedule);
    setPreviewPeriodTimes(null);
    setPreviewFingerprint(null);
    setShowExcelPreview(true);
  }, [pendingComciganReview]);

  // 수동 '컴시간 변동 확인' — 지금 다시 확인(스로틀 무시)
  const handleComciganCheck = useCallback(async () => {
    if (checkingComcigan) return;
    setCheckingComcigan(true);
    try {
      await checkComciganTimetableChange({ manual: true });
    } finally {
      setCheckingComcigan(false);
    }
  }, [checkingComcigan]);

  // ── 압핀 자동연동 (변동 확인 + 검토) ──
  const pendingAppinReview = useScheduleStore((s) => s.pendingAppinReview);
  const setPendingAppinReview = useScheduleStore((s) => s.setPendingAppinReview);
  const [checkingAppin, setCheckingAppin] = useState(false);
  const appinAutoSyncOn = settings.appin?.autoSync?.enabled === true;
  const appinTarget = settings.appin?.autoSync?.target;

  // 감지된 압핀 변경 적용 — 교사는 미리보기로, 학급은 바로 적용(비파괴 검토 소비)
  const handleReviewAppin = useCallback(() => {
    if (!pendingAppinReview) return;
    if (pendingAppinReview.target === 'teacher') {
      setPreviewSchedule(pendingAppinReview.schedule as TeacherScheduleData);
      setPreviewPeriodTimes(null);
      setPreviewFingerprint(null);
      setShowExcelPreview(true);
    } else {
      // 학급 재적용도 import 경로(handleNeisImport)로 통일 — 새 주차 교시 수가 늘면
      // maxPeriods 를 함께 올려 초과 교시가 표에서 잘리지 않게 한다.
      const classSched = pendingAppinReview.schedule as ClassScheduleData;
      const maxFromData = Math.max(
        0,
        ...Object.values(classSched).map((periods) => periods.length),
      );
      void handleNeisImport(classSched, maxFromData > 0 ? maxFromData : settings.maxPeriods);
      showToast('압핀에서 바뀐 학급 시간표를 적용했어요.', 'success');
    }
    setPendingAppinReview(null);
  }, [pendingAppinReview, handleNeisImport, settings.maxPeriods, setPendingAppinReview, showToast]);

  // 수동 '압핀 변동 확인'
  const handleAppinCheck = useCallback(async () => {
    if (checkingAppin) return;
    setCheckingAppin(true);
    try {
      await checkAppinTimetableChange({ manual: true });
    } finally {
      setCheckingAppin(false);
    }
  }, [checkingAppin]);

  // ── 위젯 "검토하기"로 진입한 경우(initialIntent='sync-review') 이어받기 ──
  // 위젯이 감지한 검토 대기 상태는 창별 메모리라 여기까지 오지 못한다(메모리 절약 모드면
  // 메인 창 자체가 새로 만들어진다). 그래서 의도만 넘겨받아 여기서 마무리한다.
  // StrictMode 재마운트로 두 번 조회하지 않도록 ref 로 1회만 실행한다.
  const syncIntentHandledRef = useRef(false);
  useEffect(() => {
    if (initialIntent !== 'sync-review') return;
    if (syncIntentHandledRef.current) return;
    syncIntentHandledRef.current = true;
    onIntentConsumed?.();

    const openComciganPreview = (): boolean => {
      const pending = useScheduleStore.getState().pendingComciganReview;
      if (!pending) return false;
      setPreviewSchedule(pending.schedule);
      setPreviewPeriodTimes(null);
      setPreviewFingerprint(null);
      setShowExcelPreview(true);
      return true;
    };

    void (async () => {
      // 메모리 절약 모드에서는 이 창이 방금 만들어졌을 수 있다. 저장된 시간표를 먼저 읽지 않으면
      // 빈 시간표를 기준으로 비교해 "전부 바뀌었다"는 거짓 감지가 난다.
      await Promise.all([useSettingsStore.getState().load(), useScheduleStore.getState().load()]);

      // 메인 창이 살아 있어 이미 감지해 둔 게 있으면 재조회 없이 바로 연다.
      if (openComciganPreview()) return;
      if (useScheduleStore.getState().pendingAppinReview) return; // 압핀 배너로 이미 보임

      if (useSettingsStore.getState().settings.comcigan?.autoSync?.enabled === true) {
        const result = await checkComciganTimetableChange({ manual: true });
        if (result.status === 'pending' && openComciganPreview()) return;
      }
      if (useSettingsStore.getState().settings.appin?.autoSync?.enabled === true) {
        await checkAppinTimetableChange({ manual: true });
      }
    })();
  }, [initialIntent, onIntentConsumed]);

  const handleExcelConfirm = useCallback(async () => {
    if (!previewSchedule) return;
    // 교시 시각을 먼저 적용해 아래 maxPeriods·색상 설정 갱신과 저장이 겹치지 않게 직렬화한다.
    if (previewPeriodTimes) {
      await updateSettings(periodTimesToSettingsPatch(previewPeriodTimes, settings.periodTimes));
    }
    await updateTeacherSchedule(previewSchedule);

    const maxFromData = Math.max(...Object.values(previewSchedule).map((arr) => arr.length), 0);
    if (maxFromData > 0 && maxFromData !== settings.maxPeriods) {
      await updateSettings({ maxPeriods: maxFromData });
    }

    const currentWeekend = settings.enableWeekendDays ?? [];
    const dataKeys = Object.keys(previewSchedule);
    const newWeekend = (['토', '일'] as const).filter((d) => dataKeys.includes(d));
    const weekendChanged =
      newWeekend.length !== currentWeekend.length ||
      newWeekend.some((d) => !currentWeekend.includes(d));
    if (weekendChanged) {
      await updateSettings({ enableWeekendDays: newWeekend });
    }

    const currentColors = settings.subjectColors ?? {};
    const subjects = new Set<string>();
    for (const periods of Object.values(previewSchedule)) {
      for (const p of periods) {
        if (p && p.subject.trim()) subjects.add(p.subject.trim());
      }
    }
    const newSubjects = [...subjects].filter(
      (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
    );
    if (newSubjects.length > 0) {
      const updated = smartAutoAssignColors(currentColors, newSubjects);
      await updateSettings({ subjectColors: updated });
    }

    // 컴시간 경로(수동 불러오기)면 자동 변경감지 활성화 + 교사 지문 저장.
    // 검토하기(pendingReview) 경로는 지문이 이미 있어 previewFingerprint=null → 재저장 안 함.
    if (previewFingerprint) {
      await updateSettings({
        comcigan: {
          autoSync: {
            enabled: true,
            autoApply: settings.comcigan?.autoSync?.autoApply ?? false,
            lastSyncDate: toLocalDateString(),
          },
          fingerprint: previewFingerprint,
        },
      });
    }

    showToast('교사 시간표가 업데이트되었습니다!', 'success');
    setShowExcelPreview(false);
    setPreviewSchedule(null);
    setPreviewPeriodTimes(null);
    setPreviewFingerprint(null);
    setPendingComciganReview(null);
  }, [
    settings.periodTimes,
    previewSchedule,
    previewPeriodTimes,
    previewFingerprint,
    updateTeacherSchedule,
    settings.maxPeriods,
    settings.enableWeekendDays,
    settings.subjectColors,
    settings.comcigan?.autoSync?.autoApply,
    updateSettings,
    showToast,
    setPendingComciganReview,
  ]);

  const { className, teacherName } = settings;
  // 학기 표기는 위에서 정한 현재 학기 하나만 쓴다 — 여기서 월을 다시 세면 앱 안에 학기 규칙이
  // 두 벌 생기고, 하필 답이 갈리면 안 되는 경계(8월·9월 초 개학, 1~2월)에서만 어긋난다.
  const termLabel = formatTermKo(currentTermLabel);
  const infoLabel =
    tab === 'class' && (className || teacherName)
      ? `${className}  |  담임: ${teacherName}  |  ${termLabel}`
      : termLabel;

  if (isEditing) {
    return (
      <TimetableEditor
        tab={tab}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden -m-8">
      <PageHeader
        icon="calendar_view_day"
        iconIsMaterial
        title="시간표"
        leftAddon={
          <span className="text-sp-muted text-sm font-sp-medium">{termLabel} · 주간 시간표</span>
        }
        rightActions={
          <>
            {/* 시간표 불러오기 — 나이스/컴시간/압핀 통합 드롭다운 (탭별 소스는 importSources) */}
            <ImportSourceMenu sources={importSources} />

            {/* 교사 시간표: 컴시간 변동 확인 (이미 불러온 사용자만 — 지금 재확인) */}
            {tab === 'teacher' && comciganAutoSyncOn && (
              <button
                onClick={() => void handleComciganCheck()}
                disabled={checkingComcigan}
                title="컴시간에서 시간표가 바뀌었는지 지금 확인해요"
                className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span
                  className={`material-symbols-outlined text-icon-lg ${checkingComcigan ? 'animate-spin' : ''}`}
                >
                  {checkingComcigan ? 'progress_activity' : 'sync'}
                </span>
                <span className="hidden xl:inline">
                  {checkingComcigan ? '확인 중...' : '컴시간 변동 확인'}
                </span>
              </button>
            )}

            {/* 압핀 변동 확인 (압핀 자동연동 켜진 경우 — 대상 탭에서) */}
            {appinAutoSyncOn && tab === (appinTarget === 'class' ? 'class' : 'teacher') && (
              <button
                onClick={() => void handleAppinCheck()}
                disabled={checkingAppin}
                title="압핀에서 시간표가 바뀌었는지 지금 확인해요"
                className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span
                  className={`material-symbols-outlined text-icon-lg ${checkingAppin ? 'animate-spin' : ''}`}
                >
                  {checkingAppin ? 'progress_activity' : 'sync'}
                </span>
                <span className="hidden xl:inline">
                  {checkingAppin ? '확인 중...' : '압핀 변동 확인'}
                </span>
              </button>
            )}

            {/* 진도 보기 토글 (교사 시간표에서만 — 격자 위 진도 오버레이) */}
            {tab === 'teacher' && (
              <button
                onClick={() => setShowProgress((v) => !v)}
                title="시간표 위에 각 반의 진도를 표시해요"
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all active:scale-95 ${
                  showProgress
                    ? 'bg-sp-accent border-sp-accent text-white shadow-md'
                    : 'bg-sp-surface border-sp-border text-sp-text hover:bg-sp-card'
                }`}
              >
                <span className="material-symbols-outlined text-icon-lg">trending_up</span>
                <span className="hidden xl:inline">진도 보기</span>
              </button>
            )}

            {/* 색상 모드 토글 (교사 시간표에서만 표시) */}
            {tab === 'teacher' && (
              <div className="flex items-center gap-1 bg-sp-surface rounded-xl p-1 border border-sp-border">
                <button
                  onClick={() => void updateSettings({ timetableColorBy: 'subject' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    colorBy === 'subject'
                      ? 'bg-sp-accent text-white shadow-md'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                  title="과목별 색상"
                >
                  과목색
                </button>
                <button
                  onClick={() => void updateSettings({ timetableColorBy: 'classroom' })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    colorBy === 'classroom'
                      ? 'bg-sp-accent text-white shadow-md'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                  title="학반별 색상"
                >
                  학반색
                </button>
              </div>
            )}
            {/* 탭 토글 */}
            <div className="flex rounded-xl bg-sp-surface p-1 border border-sp-border">
              <TabButton
                active={tab === 'teacher'}
                onClick={() => handleTabChange('teacher')}
                label="교사 시간표"
              />
              <TabButton
                active={tab === 'class'}
                onClick={() => handleTabChange('class')}
                label="학급 시간표"
              />
            </div>
            {/* 변동 시간표 버튼 */}
            <button
              onClick={() => setOverridesPanelOpen(true)}
              className="relative flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
              aria-label="변동 시간표 관리"
            >
              <span className="material-symbols-outlined text-icon-lg">swap_horiz</span>
              <span className="hidden xl:inline">변동 시간표</span>
              {futureOverrideCount > 0 && (
                <span
                  className="ml-1 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center text-caption font-bold rounded-full bg-sp-accent text-white"
                  title={`미래 변동 ${futureOverrideCount}건`}
                >
                  {futureOverrideCount}
                </span>
              )}
            </button>
            {/* 직접 편집 버튼 */}
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-icon-lg">edit</span>
              <span className="hidden xl:inline">직접 편집</span>
            </button>
            {/* 내보내기 */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-icon-lg">download</span>
                <span className="hidden xl:inline">내보내기</span>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-sp-card border border-sp-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                  <button
                    onClick={() => void handleExport('excel')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-green-400 text-lg">
                      table_view
                    </span>
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    onClick={() => void handleExport('hwpx')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors border-t border-sp-border"
                  >
                    <span className="material-symbols-outlined text-blue-400 text-lg">
                      description
                    </span>
                    <span>한글 (.hwpx)</span>
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      {/* 시간표 그리드 */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-7xl flex flex-col gap-6">
          {/* 새 학기 시간표 갱신 확인 — 경고가 아니라 질문(학교마다 실제 학기 시작이 다름) */}
          {termRefresh.kind === 'ask' && !termBannerDismissed && (
            <TimetableTermRefreshBanner
              fromTerm={termRefresh.fromTerm}
              toTerm={termRefresh.toTerm}
              onImport={() => {
                // 현재 탭의 첫 불러오기 소스를 바로 연다(드롭다운을 한 번 더 열게 하지 않는다).
                importSources[0]?.onSelect();
              }}
              onConfirmUpToDate={() => {
                ackTimetableTerm();
                setTermBannerDismissed(true);
              }}
              onDismiss={() => setTermBannerDismissed(true)}
            />
          )}

          {/* 컴시간 변경 감지 배너 (비파괴 — 검토 후 적용). 밝은 카드 + amber 좌측 스트라이프
              (다크모드 amber-on-amber 가독성 가드 준수) */}
          {tab === 'teacher' && pendingComciganReview && (
            <div className="flex flex-col gap-3 rounded-xl border border-sp-border border-l-4 border-l-amber-400 bg-sp-card px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="material-symbols-outlined shrink-0 text-xl text-amber-400">
                  sync_problem
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-sp-text">컴시간에서 시간표가 바뀌었어요</p>
                  <p className="mt-0.5 text-xs text-sp-muted">
                    {pendingComciganReview.changeCount}칸이 달라졌어요. 검토 후 적용할 수 있어요 —
                    자동으로 덮어쓰지 않아요.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleReviewComcigan}
                  className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-3.5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-icon-sm">visibility</span>
                  검토하기
                </button>
                <button
                  onClick={() => setPendingComciganReview(null)}
                  className="rounded-lg border border-sp-border px-3 py-2 text-sm font-semibold text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
                >
                  나중에
                </button>
              </div>
            </div>
          )}

          {/* 압핀 변경 감지 배너 (비파괴 — 검토 후 적용). 대상 탭에서만 노출 */}
          {pendingAppinReview &&
            tab === (pendingAppinReview.target === 'class' ? 'class' : 'teacher') && (
              <div className="flex flex-col gap-3 rounded-xl border border-sp-border border-l-4 border-l-amber-400 bg-sp-card px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="material-symbols-outlined shrink-0 text-xl text-amber-400">
                    sync_problem
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-sp-text">압핀에서 시간표가 바뀌었어요</p>
                    <p className="mt-0.5 text-xs text-sp-muted">
                      {pendingAppinReview.changeCount}칸이 달라졌어요. 검토 후 적용할 수 있어요 —
                      자동으로 덮어쓰지 않아요.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleReviewAppin}
                    className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-3.5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                  >
                    <span className="material-symbols-outlined text-icon-sm">visibility</span>
                    {pendingAppinReview.target === 'teacher' ? '검토하기' : '적용하기'}
                  </button>
                  <button
                    onClick={() => setPendingAppinReview(null)}
                    className="rounded-lg border border-sp-border px-3 py-2 text-sm font-semibold text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
                  >
                    나중에
                  </button>
                </div>
              </div>
            )}
          <div className="rounded-2xl border border-sp-border bg-sp-card overflow-hidden shadow-2xl shadow-black/20">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse">
                <TimetableHeader dayOfWeek={dayOfWeek} activeDays={activeDays} />
                <tbody>
                  {settings.periodTimes.slice(0, settings.maxPeriods).map((pt, idx) => {
                    const periodNum = pt.period;
                    const isCurrent = currentPeriod === periodNum;

                    return (
                      <PeriodRow
                        key={periodNum}
                        periodTime={pt}
                        isCurrent={isCurrent}
                        dayOfWeek={dayOfWeek}
                        tab={tab}
                        classPeriods={weekDates.map(
                          (date) => (effectiveClassByDate.get(date) ?? [])[idx] ?? null,
                        )}
                        teacherPeriods={weekDates.map(
                          (date) => (effectiveTeacherByDate.get(date) ?? [])[idx] ?? null,
                        )}
                        lunchBefore={lunchIndex === idx}
                        lunchTimeStr={lunchTimeStr}
                        subjectColors={settings.subjectColors}
                        classroomColors={classroomColors}
                        colorBy={colorBy}
                        weekDates={weekDates}
                        overrideMap={overrideMap}
                        activeDays={activeDays}
                        onTempChange={(date, dayIdx, subject, classroom) =>
                          setTempChangeTarget({
                            date,
                            period: periodNum,
                            dayIdx,
                            subject,
                            classroom,
                          })
                        }
                        onDeleteOverride={(id) => void deleteOverride(id)}
                        openPalette={openPalette}
                        onOpenPalette={setOpenPalette}
                        onClosePalette={closePalette}
                        onViewColorChange={handleViewColorChange}
                        renderCellOverlay={showProgress ? renderCellOverlay : undefined}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 하단 정보 */}
          <div className="flex items-center justify-center py-4 bg-sp-card/50 rounded-xl border border-sp-border border-dashed">
            <span className="text-sp-muted font-medium text-sm">{infoLabel}</span>
          </div>
        </div>
      </div>

      {/* 임시 변경 모달 (셀 우클릭 경로 — 빠른 입력용, 슬롯 고정) */}
      {tempChangeTarget && (
        <TempChangeModal
          date={tempChangeTarget.date}
          period={tempChangeTarget.period}
          currentSubject={tempChangeTarget.subject}
          currentClassroom={tempChangeTarget.classroom}
          maxPeriods={settings.maxPeriods}
          periodTimes={settings.periodTimes}
          defaultScope={tab === 'class' ? 'class' : 'teacher'}
          resolveBaseSubject={(d, p) => {
            const dObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dObj, settings.enableWeekendDays);
            if (!day) return '';
            if (tab === 'class') return classSchedule[day]?.[p - 1]?.subject ?? '';
            return teacherSchedule[day]?.[p - 1]?.subject ?? '';
          }}
          resolveBaseClassroom={(d, p) => {
            const dObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dObj, settings.enableWeekendDays);
            if (!day) return '';
            return teacherSchedule[day]?.[p - 1]?.classroom ?? '';
          }}
          onSaveSingle={(input) => {
            void addOverride({
              date: input.date,
              period: input.period,
              subject: input.subject,
              classroom: input.classroom,
              reason: input.reason,
              kind: input.kind,
              substituteTeacher: input.substituteTeacher,
              scope: input.scope,
            });
          }}
          onSaveSwap={(input) => {
            void addSwapPair(
              {
                date: input.slotA.date,
                period: input.slotA.period,
                subject: input.slotA.subject,
                classroom: input.slotA.classroom,
                reason: input.reason,
                scope: input.scope,
              },
              {
                date: input.slotB.date,
                period: input.slotB.period,
                subject: input.slotB.subject,
                classroom: input.slotB.classroom,
                reason: input.reason,
                scope: input.scope,
              },
            );
          }}
          onClose={() => setTempChangeTarget(null)}
        />
      )}

      {/* 변동 시간표 관리 패널 */}
      <TimetableOverridesPanel
        open={overridesPanelOpen}
        onClose={() => setOverridesPanelOpen(false)}
        onAddNew={() => setAddFromPanelOpen(true)}
        onEdit={(o) => setEditTarget(o)}
      />

      {/* 드로어 "+ 변동 추가"용 모달 */}
      {addFromPanelOpen && (
        <TempChangeModal
          mode="create"
          slotEditable
          maxPeriods={settings.maxPeriods}
          periodTimes={settings.periodTimes}
          defaultScope={tab === 'class' ? 'class' : 'teacher'}
          resolveBaseSubject={(d, p) => {
            const dateObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dateObj, settings.enableWeekendDays);
            if (!day) return '';
            if (tab === 'class') return classSchedule[day]?.[p - 1]?.subject ?? '';
            return teacherSchedule[day]?.[p - 1]?.subject ?? '';
          }}
          resolveBaseClassroom={(d, p) => {
            const dateObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dateObj, settings.enableWeekendDays);
            if (!day) return '';
            return teacherSchedule[day]?.[p - 1]?.classroom ?? '';
          }}
          date={toLocalDateString(new Date())}
          period={1}
          currentSubject=""
          onSaveSingle={(input) => {
            void addOverride({
              date: input.date,
              period: input.period,
              subject: input.subject,
              classroom: input.classroom,
              reason: input.reason,
              kind: input.kind,
              substituteTeacher: input.substituteTeacher,
              scope: input.scope,
            });
          }}
          onSaveSwap={(input) => {
            void addSwapPair(
              {
                date: input.slotA.date,
                period: input.slotA.period,
                subject: input.slotA.subject,
                classroom: input.slotA.classroom,
                reason: input.reason,
                scope: input.scope,
              },
              {
                date: input.slotB.date,
                period: input.slotB.period,
                subject: input.slotB.subject,
                classroom: input.slotB.classroom,
                reason: input.reason,
                scope: input.scope,
              },
            );
          }}
          onClose={() => setAddFromPanelOpen(false)}
        />
      )}

      {/* 변동 시간표 수정 모달 — 날짜·교시 포함 전체 편집 */}
      {editTarget && (
        <TempChangeModal
          mode="edit"
          initialOverride={editTarget}
          date={editTarget.date}
          period={editTarget.period}
          currentSubject={editTarget.subject}
          currentClassroom={editTarget.classroom}
          maxPeriods={settings.maxPeriods}
          periodTimes={settings.periodTimes}
          resolveBaseSubject={(d, p) => {
            const dObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dObj, settings.enableWeekendDays);
            if (!day) return '';
            if (tab === 'class') return classSchedule[day]?.[p - 1]?.subject ?? '';
            return teacherSchedule[day]?.[p - 1]?.subject ?? '';
          }}
          resolveBaseClassroom={(d, p) => {
            const dObj = new Date(d + 'T00:00:00');
            const day = getDayOfWeek(dObj, settings.enableWeekendDays);
            if (!day) return '';
            return teacherSchedule[day]?.[p - 1]?.classroom ?? '';
          }}
          onSaveEdit={async (oldId, input) => {
            const old = overrides.find((o) => o.id === oldId);
            const slotChanged = !old || old.date !== input.date || old.period !== input.period;
            if (slotChanged) {
              // 슬롯(날짜/교시) 변경: 이전 항목 삭제 후 새 슬롯에 upsert
              await deleteOverride(oldId);
              await addOverride({
                date: input.date,
                period: input.period,
                subject: input.subject,
                classroom: input.classroom,
                reason: input.reason,
                kind: input.kind,
                substituteTeacher: input.substituteTeacher,
                scope: input.scope,
              });
            } else {
              // 같은 슬롯 내 필드만 변경
              await updateOverride(oldId, {
                subject: input.subject,
                classroom: input.classroom,
                reason: input.reason,
                kind: input.kind,
                substituteTeacher: input.substituteTeacher,
                scope: input.scope,
              });
            }
          }}
          onClose={() => setEditTarget(null)}
        />
      )}
      <NeisImportModal
        isOpen={showNeisImport}
        onClose={() => setShowNeisImport(false)}
        onImport={(data, maxPeriods) => void handleNeisImport(data, maxPeriods)}
        hasExistingData={hasExistingData}
        onEnableAutoSync={(grade, cls) => void handleEnableAutoSync(grade, cls)}
      />

      {/* 컴시간 교사 시간표 불러오기 — 교사 선택 후 아래 미리보기 모달로 합류 */}
      <ComciganImportModal
        isOpen={showComciganImport}
        onClose={() => setShowComciganImport(false)}
        onImport={(schedule, periodTimes, fingerprint) => {
          setShowComciganImport(false);
          setPreviewSchedule(schedule);
          setPreviewPeriodTimes(periodTimes);
          setPreviewFingerprint(fingerprint);
          setShowExcelPreview(true);
        }}
      />

      {/* 압핀 교사 시간표 불러오기 — 미리보기(TeacherExcelPreviewModal)로 합류. 교시시각·지문 없음 */}
      <AppinTeacherImportModal
        isOpen={showAppinTeacherImport}
        onClose={() => setShowAppinTeacherImport(false)}
        onImport={(schedule) => {
          setShowAppinTeacherImport(false);
          setPreviewSchedule(schedule);
          setPreviewPeriodTimes(null);
          setPreviewFingerprint(null);
          setShowExcelPreview(true);
        }}
      />

      {/* 나이스 교사 시간표(학급 재조합) 불러오기 — 미리보기로 합류. 교시시각·지문 없음 */}
      <NeisTeacherImportModal
        isOpen={showNeisTeacherImport}
        onClose={() => setShowNeisTeacherImport(false)}
        onImport={(schedule) => {
          setShowNeisTeacherImport(false);
          setPreviewSchedule(schedule);
          setPreviewPeriodTimes(null);
          setPreviewFingerprint(null);
          setShowExcelPreview(true);
        }}
      />

      {/* 컴시간 학급 시간표 불러오기 — 나이스와 동일 적용 경로 재사용 */}
      <ComciganClassImportModal
        isOpen={showComciganClassImport}
        onClose={() => setShowComciganClassImport(false)}
        onImport={(data, maxPeriods) => {
          setShowComciganClassImport(false);
          void handleNeisImport(data, maxPeriods);
        }}
        hasExistingData={hasExistingData}
      />

      {/* 압핀 학급 시간표 불러오기 — 나이스와 동일 적용 경로 재사용 */}
      <AppinClassImportModal
        isOpen={showAppinClassImport}
        onClose={() => setShowAppinClassImport(false)}
        onImport={(data, maxPeriods) => {
          setShowAppinClassImport(false);
          void handleNeisImport(data, maxPeriods);
        }}
        hasExistingData={hasExistingData}
      />

      {/* 교사 시간표 불러오기 미리보기 모달 */}
      {showExcelPreview && previewSchedule && (
        <TeacherExcelPreviewModal
          schedule={previewSchedule}
          maxPeriods={settings.maxPeriods}
          periodTimes={settings.periodTimes}
          activeDays={activeDays}
          onConfirm={() => void handleExcelConfirm()}
          onCancel={() => {
            setShowExcelPreview(false);
            setPreviewSchedule(null);
            setPreviewPeriodTimes(null);
            setPreviewFingerprint(null);
            // 검토 취소 시 pendingComciganReview는 유지 — 배너에서 다시 열 수 있게 둔다
          }}
        />
      )}

      {/* 진도 빠른 입력/편집 모달 (진도 보기 오버레이 셀 클릭) */}
      {progressModal && progressModal.cell.matchedClass && (
        <ProgressQuickEntryModal
          mode={progressModal.mode}
          className={`${progressModal.cell.matchedClass.name} · ${progressModal.cell.matchedClass.subject}`}
          initialValues={progressModal.values}
          initialStatus={progressModal.status}
          matchingPeriods={[progressModal.cell.period]}
          accentColor={progressAccentFor(progressModal.cell)}
          maxPeriods={settings.maxPeriods}
          periodTimes={settings.periodTimes}
          fanout={progressFanout}
          onSubmit={handleProgressSubmit}
          onDelete={progressModal.mode === 'edit' ? handleProgressDelete : undefined}
          onClose={closeProgressModal}
        />
      )}
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
        active ? 'bg-sp-accent text-white shadow-md' : 'text-sp-muted hover:text-sp-text'
      }`}
    >
      {label}
    </button>
  );
}

interface TimetableHeaderProps {
  dayOfWeek: DayOfWeekFull | null;
  activeDays: readonly DayOfWeekFull[];
}

function TimetableHeader({ dayOfWeek, activeDays }: TimetableHeaderProps) {
  return (
    <thead>
      <tr className="bg-sp-surface border-b border-sp-border">
        {/* break-keep: 한글은 글자 사이 어디서나 줄바꿈돼서, 이름을 붙이면 열이 최소폭까지
            찌그러지고 "자율탐구활동"이 세로 6줄이 된다. keep-all 로 한 덩어리로 묶으면
            표가 이름 길이에 맞춰 열 너비를 잡아준다(이름이 없으면 그대로 좁게 유지). */}
        <th className="px-2 py-4 text-center text-sp-text font-bold text-sm min-w-[3.5rem] break-keep border-r border-sp-border">
          교시
        </th>
        <th className="px-4 py-4 text-center text-sp-text font-bold text-sm w-24 border-r border-sp-border">
          시간
        </th>
        {activeDays.map((day) => {
          const isToday = day === dayOfWeek;
          return (
            <th
              key={day}
              className={`px-4 py-4 text-center font-bold text-sm border-r border-sp-border relative ${
                isToday ? 'text-sp-accent bg-sp-accent/10' : 'text-sp-text'
              }`}
              style={{ width: `${100 / activeDays.length}%` }}
            >
              {isToday && <div className="absolute top-0 left-0 w-full h-1 bg-sp-accent" />}
              {day}
              {isToday && <span className="ml-1 text-xs font-medium">(Today)</span>}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

interface PeriodRowProps {
  periodTime: PeriodTime;
  isCurrent: boolean;
  dayOfWeek: DayOfWeekFull | null;
  tab: TabType;
  classPeriods: (ClassPeriod | null)[];
  teacherPeriods: (TeacherPeriod | null)[];
  lunchBefore: boolean;
  lunchTimeStr: string;
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
  weekDates: string[];
  overrideMap: Map<string, TimetableOverride>;
  activeDays: readonly DayOfWeekFull[];
  onTempChange: (date: string, dayIdx: number, subject: string, classroom?: string) => void;
  onDeleteOverride: (id: string) => void;
  openPalette: { dayIdx: number; period: number } | null;
  onOpenPalette: (palette: { dayIdx: number; period: number }) => void;
  onClosePalette: () => void;
  onViewColorChange: (key: string, colorId: SubjectColorId) => void;
  /** 진도 보기 오버레이 렌더프롭 — 셀은 진도 데이터를 모르고 이 노드만 렌더한다 (교사 탭 전용) */
  renderCellOverlay?: (dayIdx: number, period: number) => ReactNode;
}

function PeriodRow({
  periodTime,
  isCurrent,
  dayOfWeek,
  tab,
  classPeriods,
  teacherPeriods,
  lunchBefore,
  lunchTimeStr,
  subjectColors,
  classroomColors,
  colorBy,
  weekDates,
  overrideMap,
  activeDays,
  onTempChange,
  onDeleteOverride,
  openPalette,
  onOpenPalette,
  onClosePalette,
  onViewColorChange,
  renderCellOverlay,
}: PeriodRowProps) {
  return (
    <>
      {/* 점심시간 행 */}
      {lunchBefore && (
        <tr className="bg-sp-surface/60 border-b border-sp-border">
          <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-sp-surface border-r border-sp-border">
            점심
          </td>
          <td className="px-4 py-3 text-center text-sp-muted text-sm border-r border-sp-border font-mono">
            {lunchTimeStr.split(' ~ ')[0]}
          </td>
          <td
            className="px-4 py-3 text-center text-sp-muted text-sm font-medium tracking-wide"
            colSpan={activeDays.length}
          >
            🍽️ 점심시간 ({lunchTimeStr})
          </td>
        </tr>
      )}

      {/* 교시 행 */}
      <tr
        className={
          isCurrent
            ? 'relative z-10 border-b border-sp-border'
            : 'group border-b border-sp-border hover:bg-sp-surface/50 transition-colors'
        }
      >
        {/* 교시 셀 */}
        <td
          className={`px-2 py-4 text-center font-medium text-sm break-keep border-r border-sp-border ${
            isCurrent
              ? 'text-amber-400 font-bold border-l-4 border-l-amber-400 bg-sp-card'
              : 'text-sp-muted bg-sp-card'
          }`}
        >
          {periodTimeLabel(periodTime)}
        </td>

        {/* 시간 셀 */}
        <td
          className={`px-4 py-4 text-center text-sm border-r border-sp-border font-mono ${
            isCurrent ? 'text-amber-400 font-bold' : 'text-sp-muted'
          }`}
        >
          {periodTime.start}
        </td>

        {/* 요일별 과목 셀 */}
        {activeDays.map((day, dayIdx) => {
          const isToday = day === dayOfWeek;
          const dateStr = weekDates[dayIdx] ?? '';
          const override = overrideMap.get(`${dateStr}:${periodTime.period}`);

          if (tab === 'class') {
            const cp = classPeriods[dayIdx] ?? null;
            return (
              <SubjectCell
                key={day}
                subject={cp?.subject ?? ''}
                teacher={cp?.teacher ?? ''}
                subjectColors={subjectColors}
                isToday={isToday}
                isCurrent={isCurrent && isToday}
                isLastCol={dayIdx === activeDays.length - 1}
                override={override}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (override) {
                    onDeleteOverride(override.id);
                  } else {
                    onTempChange(dateStr, dayIdx, cp?.subject ?? '', undefined);
                  }
                }}
                isColorPaletteOpen={
                  openPalette?.dayIdx === dayIdx && openPalette?.period === periodTime.period
                }
                onOpenColorPalette={() => onOpenPalette({ dayIdx, period: periodTime.period })}
                onCloseColorPalette={onClosePalette}
                onColorChange={onViewColorChange}
                colorBy="subject"
              />
            );
          }

          const tp = teacherPeriods[dayIdx] ?? null;
          return (
            <TeacherCell
              key={day}
              period={tp}
              isToday={isToday}
              isCurrent={isCurrent && isToday}
              isLastCol={dayIdx === activeDays.length - 1}
              subjectColors={subjectColors}
              classroomColors={classroomColors}
              colorBy={colorBy}
              override={override}
              overlay={renderCellOverlay?.(dayIdx, periodTime.period)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (override) {
                  onDeleteOverride(override.id);
                } else {
                  onTempChange(dateStr, dayIdx, tp?.subject ?? '', tp?.classroom ?? '');
                }
              }}
              isColorPaletteOpen={
                openPalette?.dayIdx === dayIdx && openPalette?.period === periodTime.period
              }
              onOpenColorPalette={() => onOpenPalette({ dayIdx, period: periodTime.period })}
              onCloseColorPalette={onClosePalette}
              onColorChange={onViewColorChange}
            />
          );
        })}
      </tr>
    </>
  );
}

interface SubjectCellProps {
  subject: string;
  teacher: string;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
  subjectColors?: SubjectColorMap;
  override?: TimetableOverride;
  onContextMenu: (e: React.MouseEvent) => void;
  isColorPaletteOpen: boolean;
  onOpenColorPalette: () => void;
  onCloseColorPalette: () => void;
  onColorChange: (key: string, colorId: SubjectColorId) => void;
  colorBy: 'subject' | 'classroom';
}

function SubjectCell({
  subject,
  teacher,
  isToday,
  isCurrent,
  isLastCol,
  subjectColors,
  override,
  onContextMenu,
  isColorPaletteOpen,
  onOpenColorPalette,
  onCloseColorPalette,
  onColorChange,
  colorBy: _colorBy,
}: SubjectCellProps) {
  const isOverridden = override != null;
  const displaySubject = isOverridden ? override.subject || '' : subject;
  const displayTeacher = isOverridden ? '' : teacher;

  if (!displaySubject) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div
          className={`h-14 w-full flex items-center justify-center text-sp-muted text-sm relative ${
            isOverridden ? 'border border-dashed border-amber-400/30 rounded-lg' : ''
          }`}
        >
          {isOverridden ? '자습' : '—'}
          {isOverridden && (
            <span
              className="absolute top-0.5 right-0.5 text-micro text-amber-400"
              title={`임시 변경: ${override.reason ?? ''}`}
            >
              <span className="material-symbols-outlined text-xs">push_pin</span>
            </span>
          )}
        </div>
      </td>
    );
  }

  const style = getSubjectStyle(displaySubject, subjectColors);

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{displaySubject}</span>
      {displayTeacher && <span className="text-sp-muted text-xs">{displayTeacher}</span>}
      {isOverridden && override.reason && (
        <span className="text-amber-300 text-detail font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
          {override.reason}
        </span>
      )}
    </div>
  );

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`h-14 w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex items-center justify-center relative z-20 cursor-pointer ${
            isOverridden ? 'border-dashed' : ''
          }`}
          onClick={onOpenColorPalette}
        >
          {cellContent}
          {isOverridden ? (
            <span className="absolute -top-1 -right-1 text-amber-400">
              <span className="material-symbols-outlined text-icon-sm">push_pin</span>
            </span>
          ) : (
            <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
          )}
        </div>
        {isColorPaletteOpen && (
          <InlineColorPalette
            label={displaySubject}
            currentColorId={(subjectColors?.[displaySubject] ?? 'cyan') as SubjectColorId}
            onSelect={(colorId) => onColorChange(displaySubject, colorId)}
            onClose={onCloseColorPalette}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`h-14 w-full rounded-lg ${style.bg} border ${
          isOverridden ? 'border-dashed border-amber-400/30' : style.border
        } flex items-center justify-center relative cursor-pointer`}
        onClick={onOpenColorPalette}
      >
        {cellContent}
        {isOverridden && (
          <span
            className="absolute top-0.5 right-0.5 text-amber-400"
            title={`임시 변경: ${override.reason ?? ''}`}
          >
            <span className="material-symbols-outlined text-xs">push_pin</span>
          </span>
        )}
      </div>
      {isColorPaletteOpen && (
        <InlineColorPalette
          label={displaySubject}
          currentColorId={(subjectColors?.[displaySubject] ?? 'cyan') as SubjectColorId}
          onSelect={(colorId) => onColorChange(displaySubject, colorId)}
          onClose={onCloseColorPalette}
        />
      )}
    </td>
  );
}

interface TeacherCellProps {
  period: TeacherPeriod | null;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
  override?: TimetableOverride;
  onContextMenu: (e: React.MouseEvent) => void;
  isColorPaletteOpen: boolean;
  onOpenColorPalette: () => void;
  onCloseColorPalette: () => void;
  onColorChange: (key: string, colorId: SubjectColorId) => void;
  /** 진도 보기 오버레이 노드 (셀은 내용 무지 — 절대배치 슬롯으로 렌더만) */
  overlay?: ReactNode;
}

function TeacherCell({
  period,
  isToday,
  isCurrent,
  isLastCol,
  subjectColors,
  classroomColors,
  colorBy,
  override,
  onContextMenu,
  isColorPaletteOpen,
  onOpenColorPalette,
  onCloseColorPalette,
  onColorChange,
  overlay,
}: TeacherCellProps) {
  // 진도 보기 모드 여부 — 호출부가 진도 보기일 때만 overlay(null 포함)를 넘기므로 undefined 비교로 판별.
  // 이 모드에선 셀을 키우고(h-20) 본문을 위 정렬해, 하단 진도 띠가 학반 줄을 덮지 않게 한다.
  const progressMode = overlay !== undefined;
  const isOverridden = override != null;

  // 오버라이드된 경우 override 데이터로 표시
  const displayPeriod: TeacherPeriod | null = isOverridden
    ? override.subject
      ? { subject: override.subject, classroom: override.classroom ?? '' }
      : null
    : period;

  if (!displayPeriod) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div
          className={`w-full flex justify-center text-sp-muted text-xs relative ${
            progressMode ? 'h-20 items-start pt-2' : 'h-14 items-center'
          } ${isOverridden ? 'border border-dashed border-amber-400/30 rounded-lg' : ''}`}
        >
          {isOverridden ? '자습' : '공강'}
          {isOverridden && (
            <span
              className="absolute top-0.5 right-0.5 text-amber-400"
              title={`임시 변경: ${override.reason ?? ''}`}
            >
              <span className="material-symbols-outlined text-xs">push_pin</span>
            </span>
          )}
          {overlay}
        </div>
      </td>
    );
  }

  const style = getCellStyle(
    displayPeriod.subject,
    displayPeriod.classroom,
    colorBy,
    subjectColors,
    classroomColors,
  );
  const colorKey = colorBy === 'classroom' ? displayPeriod.classroom : displayPeriod.subject;
  const colorMap = colorBy === 'classroom' ? classroomColors : subjectColors;

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{displayPeriod.subject}</span>
      <span className="text-sp-muted text-xs">{displayPeriod.classroom}</span>
      {isOverridden && override.reason && (
        <span className="text-amber-300 text-detail font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
          {override.reason}
        </span>
      )}
    </div>
  );

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex justify-center relative z-20 cursor-pointer ${
            progressMode ? 'h-20 items-start pt-2' : 'h-14 items-center'
          } ${isOverridden ? 'border-dashed' : ''}`}
          onClick={onOpenColorPalette}
        >
          {cellContent}
          {isOverridden ? (
            <span className="absolute -top-1 -right-1 text-amber-400">
              <span className="material-symbols-outlined text-icon-sm">push_pin</span>
            </span>
          ) : (
            <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
          )}
          {overlay}
        </div>
        {isColorPaletteOpen && (
          <InlineColorPalette
            label={colorKey}
            currentColorId={(colorMap?.[colorKey] ?? 'cyan') as SubjectColorId}
            onSelect={(colorId) => onColorChange(colorKey, colorId)}
            onClose={onCloseColorPalette}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`w-full rounded-lg ${style.bg} border ${
          isOverridden ? 'border-dashed border-amber-400/30' : style.border
        } flex justify-center relative cursor-pointer ${
          progressMode ? 'h-20 items-start pt-2' : 'h-14 items-center'
        }`}
        onClick={onOpenColorPalette}
      >
        {cellContent}
        {isOverridden && (
          <span
            className="absolute top-0.5 right-0.5 text-amber-400"
            title={`임시 변경: ${override.reason ?? ''}`}
          >
            <span className="material-symbols-outlined text-xs">push_pin</span>
          </span>
        )}
        {overlay}
      </div>
      {isColorPaletteOpen && (
        <InlineColorPalette
          label={colorKey}
          currentColorId={(colorMap?.[colorKey] ?? 'cyan') as SubjectColorId}
          onSelect={(colorId) => onColorChange(colorKey, colorId)}
          onClose={onCloseColorPalette}
        />
      )}
    </td>
  );
}
