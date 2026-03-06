import { useEffect, useState, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { usePinStore } from '@adapters/stores/usePinStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { Settings, WidgetSettings, SystemSettings, NeisSettings, WeatherSettings, SchoolLevel } from '@domain/entities/Settings';
import type { PinSettings, ProtectedFeatures, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { PROTECTABLE_PAGES } from '@adapters/components/Layout/Sidebar';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import type { PeriodPreset } from '@domain/rules/periodRules';
import { getDefaultPreset, generatePeriodTimes, parseMinutes, PERIOD_DURATION } from '@domain/rules/periodRules';
import type { SchoolSearchResult } from '@domain/entities/Meal';
import { getLunchBreakIndex, formatLunchBreakTime } from '@adapters/presenters/timetablePresenter';
import { AppInfoSection } from './AppInfoSection';
import { CalendarSettings } from './CalendarSettings';
import { NeisScheduleSection } from './NeisScheduleSection';
import { SeatRelationSection } from './SeatRelationSection';
/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-sp-accent' : 'bg-sp-surface'
        }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
      />
    </button>
  );
}

/* ─── Number Stepper ─── */
function NumberStepper({
  value,
  min = 1,
  max = 10,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center bg-sp-surface rounded-lg border border-sp-border p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-sp-text hover:bg-sp-text/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">remove</span>
      </button>
      <span className="flex-1 text-center text-sp-text font-bold text-lg">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-sp-text hover:bg-sp-text/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
}

/* ─── Korean Cities for Weather ─── */
const KOREAN_CITIES: { name: string; lat: number; lon: number }[] = [
  { name: '서울', lat: 37.5665, lon: 126.978 },
  { name: '부산', lat: 35.1796, lon: 129.0756 },
  { name: '대구', lat: 35.8714, lon: 128.6014 },
  { name: '인천', lat: 37.4563, lon: 126.7052 },
  { name: '광주', lat: 35.1595, lon: 126.8526 },
  { name: '대전', lat: 36.3504, lon: 127.3845 },
  { name: '울산', lat: 35.5384, lon: 129.3114 },
  { name: '세종', lat: 36.48, lon: 127.2553 },
  { name: '수원', lat: 37.2636, lon: 127.0286 },
  { name: '성남', lat: 37.4201, lon: 127.1265 },
  { name: '고양', lat: 37.6584, lon: 126.832 },
  { name: '용인', lat: 37.2411, lon: 127.1776 },
  { name: '창원', lat: 35.2281, lon: 128.6811 },
  { name: '청주', lat: 36.6424, lon: 127.489 },
  { name: '천안', lat: 36.8151, lon: 127.1139 },
  { name: '전주', lat: 35.8242, lon: 127.148 },
  { name: '포항', lat: 36.019, lon: 129.3435 },
  { name: '제주', lat: 33.4996, lon: 126.5312 },
  { name: '김해', lat: 35.2285, lon: 128.8894 },
  { name: '춘천', lat: 37.8813, lon: 127.7298 },
  { name: '원주', lat: 37.342, lon: 127.9201 },
  { name: '강릉', lat: 37.7519, lon: 128.8761 },
  { name: '목포', lat: 34.8118, lon: 126.3922 },
  { name: '여수', lat: 34.7604, lon: 127.6622 },
  { name: '순천', lat: 34.9506, lon: 127.4873 },
  { name: '안동', lat: 36.5684, lon: 128.7295 },
  { name: '경주', lat: 35.8562, lon: 129.2247 },
  { name: '군산', lat: 35.9676, lon: 126.7369 },
  { name: '익산', lat: 35.9483, lon: 126.9577 },
  { name: '서귀포', lat: 33.2541, lon: 126.56 },
];

/* ─── Color Map ─── */
const COLOR_MAP: Record<string, { bg: string; shadow: string; ring: string }> = {
  blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]', ring: 'ring-blue-500' },
  green: { bg: 'bg-green-500', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]', ring: 'ring-green-500' },
  yellow: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]', ring: 'ring-amber-500' },
  purple: { bg: 'bg-purple-500', shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]', ring: 'ring-purple-500' },
  red: { bg: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]', ring: 'ring-red-500' },
  pink: { bg: 'bg-pink-500', shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]', ring: 'ring-pink-500' },
  indigo: { bg: 'bg-indigo-500', shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]', ring: 'ring-indigo-500' },
  teal: { bg: 'bg-teal-500', shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]', ring: 'ring-teal-500' },
  gray: { bg: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]', ring: 'ring-slate-400' },
};

function colorDot(color: string, size = 'w-3 h-3') {
  const fallback = COLOR_MAP['gray']!;
  const c = COLOR_MAP[color] ?? fallback;
  return `${size} rounded-full ${c.bg} ${c.shadow}`;
}

/* ─── Default Category IDs ─── */
const DEFAULT_CAT_IDS = new Set(['school', 'class', 'department', 'treeSchool', 'etc']);

/* ─── School Level Labels ─── */
const SCHOOL_LEVEL_OPTIONS: { value: SchoolLevel; label: string; desc: string }[] = [
  { value: 'elementary', label: '초등학교', desc: '40분 수업 · 6교시' },
  { value: 'middle', label: '중학교', desc: '45분 수업 · 7교시' },
  { value: 'high', label: '고등학교', desc: '50분 수업 · 7교시' },
];

export function SettingsPage() {
  const { settings, loaded, load, update } = useSettingsStore();
  const {
    categories,
    load: loadEvents,
    addCategory,
    deleteCategory,
  } = useEventsStore();

  /* local draft state — only persisted on "저장" click */
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  /* category add form */
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>('blue');

  /* NEIS school search */
  const [schoolQuery, setSchoolQuery] = useState('');
  const [showSchoolSearch, setShowSchoolSearch] = useState(false);
  const { searchResults, searching, searchError, searchSchools, clearSearch } = useMealStore();

  /* period preset */
  const [preset, setPreset] = useState<PeriodPreset>(() => getDefaultPreset(settings.schoolLevel));
  const [showPreset, setShowPreset] = useState(false);

  /* PIN lock */
  const pinStore = usePinStore();
  const [pinMode, setPinMode] = useState<'idle' | 'setup' | 'change' | 'remove'>('idle');
  const [pinStep, setPinStep] = useState<'input' | 'confirm' | 'old'>('input');
  const [pinDigits, setPinDigits] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinOld, setPinOld] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    load();
    loadEvents();
  }, [load, loadEvents]);

  useEffect(() => {
    if (loaded) setDraft(settings);
  }, [loaded, settings]);

  /* ── helpers ── */
  const patch = useCallback((p: Partial<Settings>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const patchWidget = useCallback((p: Partial<WidgetSettings>) => {
    setDraft((prev) => ({ ...prev, widget: { ...prev.widget, ...p } }));
  }, []);

  const patchSystem = useCallback((p: Partial<SystemSettings>) => {
    setDraft((prev) => ({ ...prev, system: { ...prev.system, ...p } }));
  }, []);

  const patchNeis = useCallback((p: Partial<NeisSettings>) => {
    setDraft((prev) => ({ ...prev, neis: { ...prev.neis, ...p } }));
  }, []);

  const patchWeather = useCallback((p: Partial<WeatherSettings>) => {
    setDraft((prev) => ({ ...prev, weather: { ...prev.weather, ...p } }));
  }, []);

  const handleSchoolSearch = useCallback(() => {
    if (!schoolQuery.trim()) return;
    void searchSchools(schoolQuery.trim());
  }, [schoolQuery, searchSchools]);

  const handleSelectSchool = useCallback((school: SchoolSearchResult) => {
    patchNeis({
      schoolCode: school.schoolCode,
      atptCode: school.atptCode,
      schoolName: `${school.schoolName} (${school.address.split(' ').slice(0, 2).join(' ')})`,
    });
    setSchoolQuery('');
    setShowSchoolSearch(false);
    clearSearch();
  }, [patchNeis, clearSearch]);

  const updatePeriod = useCallback(
    (index: number, field: 'start' | 'end', value: string) => {
      setDraft((prev) => {
        const arr = [...prev.periodTimes] as PeriodTime[];
        const existing = arr[index];
        if (!existing) return prev;

        if (field === 'start' && prev.schoolLevel) {
          const duration = PERIOD_DURATION[prev.schoolLevel];
          const startMin = parseMinutes(value);
          const endH = Math.floor((startMin + duration) / 60);
          const endM = (startMin + duration) % 60;
          const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          arr[index] = { period: existing.period, start: value, end: endStr };
        } else {
          arr[index] = { period: existing.period, start: existing.start, end: existing.end, [field]: value };
        }

        return { ...prev, periodTimes: arr };
      });
    },
    [],
  );

  const addPeriod = useCallback(() => {
    setDraft((prev) => {
      const next = prev.periodTimes.length + 1;
      const newPeriod: PeriodTime = { period: next, start: '', end: '' };
      return {
        ...prev,
        periodTimes: [...prev.periodTimes, newPeriod],
        maxPeriods: next,
      };
    });
  }, []);

  const deletePeriod = useCallback((index: number) => {
    setDraft((prev) => {
      const arr = prev.periodTimes.filter((_, i) => i !== index);
      // re-number periods
      const renumbered = arr.map((p, i) => ({ ...p, period: i + 1 }));
      return { ...prev, periodTimes: renumbered, maxPeriods: renumbered.length };
    });
  }, []);

  const showToast = useToastStore((s) => s.show);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(draft);
      showToast('설정이 저장되었습니다.', 'success');
    } catch {
      showToast('설정 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(settings);
    setShowReset(false);
  };

  const handleApplyPreset = useCallback(() => {
    const generated = generatePeriodTimes(preset);
    setDraft((prev) => ({
      ...prev,
      schoolLevel: preset.schoolLevel,
      periodTimes: generated,
      maxPeriods: generated.length,
    }));
    setShowPreset(false);
  }, [preset]);

  const handleSchoolLevelChange = useCallback((level: SchoolLevel) => {
    const newPreset = getDefaultPreset(level);
    setPreset(newPreset);
  }, []);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim(), newCatColor);
    setNewCatName('');
    setNewCatColor('blue');
    setShowCatForm(false);
  };

  if (!loaded) {
    return (
      <div className="-m-8 flex h-[calc(100%+4rem)] items-center justify-center">
        <p className="text-sp-muted">설정을 불러오는 중...</p>
      </div>
    );
  }

  /* ── 점심시간 row insertion logic ── */
  const lunchIndex = getLunchBreakIndex(draft.periodTimes);

  return (
    <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 sticky top-0 bg-sp-bg/95 backdrop-blur-sm z-10 border-b border-sp-border">
        <div>
          <h2 className="text-3xl font-black text-sp-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-muted">settings</span>
            설정
          </h2>
          <p className="text-sp-muted text-sm mt-1">앱의 환경설정을 관리하세요.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="px-5 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:bg-sp-text/5 hover:text-sp-text font-medium text-sm transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            초기화
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm shadow-lg shadow-sp-accent/25 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 pb-32">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* ── 섹션 1: 학교/학급 정보 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <span className="material-symbols-outlined">school</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">학교/학급 정보</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 학교명 — NEIS 검색 연동 */}
              <div className="space-y-2 relative md:col-span-2">
                <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
                  학교명
                </label>
                {draft.neis.schoolName && !showSchoolSearch ? (
                  <div className="flex items-center gap-3 bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5">
                    <span className="material-symbols-outlined text-teal-400 text-[18px]">school</span>
                    <span className="text-sm text-sp-text flex-1 truncate">{draft.neis.schoolName}</span>
                    <button
                      type="button"
                      onClick={() => setShowSchoolSearch(true)}
                      className="text-xs text-sp-accent hover:text-blue-400 font-medium shrink-0"
                    >
                      변경
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={schoolQuery}
                        onChange={(e) => { setSchoolQuery(e.target.value); clearSearch(); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSchoolSearch()}
                        placeholder="학교명을 입력하세요"
                        className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5 text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleSchoolSearch}
                        disabled={searching || !schoolQuery.trim()}
                        className="px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                      >
                        {searching ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-[18px]">search</span>
                        )}
                        검색
                      </button>
                    </div>

                    {/* 검색 에러 */}
                    {searchError && searchResults.length === 0 && (
                      <p className="text-xs text-sp-muted mt-1">{searchError}</p>
                    )}

                    {/* 검색 결과 드롭다운 */}
                    {searchResults.length > 0 && (
                      <div className="absolute z-20 top-full left-0 mt-1 w-full bg-sp-card rounded-lg border border-sp-border shadow-2xl max-h-60 overflow-y-auto">
                        {searchResults.map((school) => (
                          <button
                            key={`${school.atptCode}-${school.schoolCode}`}
                            type="button"
                            onClick={() => {
                              handleSelectSchool(school);
                              patch({ schoolName: school.schoolName });
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-sp-text/5 transition-colors border-b border-sp-border last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-sp-text">{school.schoolName}</span>
                              <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">
                                {school.schoolType}
                              </span>
                            </div>
                            <p className="text-xs text-sp-muted mt-0.5">{school.address}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {showSchoolSearch && draft.neis.schoolName && (
                      <button
                        type="button"
                        onClick={() => { setShowSchoolSearch(false); setSchoolQuery(''); clearSearch(); }}
                        className="text-xs text-sp-muted hover:text-sp-text"
                      >
                        취소
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* 나머지 필드 */}
              {([
                ['className', '학급명'] as const,
                ['teacherName', '교사명'] as const,
                ['subject', '담당 과목'] as const,
              ]).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={draft[key]}
                    onChange={(e) => patch({ [key]: e.target.value })}
                    placeholder={label}
                    className="w-full bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5 text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── 섹션 2: 교시 시간 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 xl:row-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <h3 className="text-lg font-bold text-sp-text">교시 시간 설정</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPreset((v) => !v)}
                  className={`text-xs font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-colors ${showPreset
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                    }`}
                >
                  <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                  빠른 설정
                </button>
                <button
                  type="button"
                  onClick={addPeriod}
                  className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  교시 추가
                </button>
              </div>
            </div>

            {/* ── 빠른 설정 패널 ── */}
            {showPreset && (
              <div className="mb-6 p-5 rounded-lg bg-sp-surface/80 border border-emerald-500/20 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-emerald-400 text-[18px]">auto_fix_high</span>
                  <span className="text-sm font-bold text-sp-text">학교급 선택</span>
                  <span className="text-xs text-sp-muted ml-auto">학교급에 맞게 교시 시간을 자동으로 생성합니다</span>
                </div>

                {/* School level buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {SCHOOL_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSchoolLevelChange(opt.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${preset.schoolLevel === opt.value
                        ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
                        : 'border-sp-border hover:border-sp-muted/50 hover:bg-sp-text/5'
                        }`}
                    >
                      <div className={`text-sm font-bold ${preset.schoolLevel === opt.value ? 'text-emerald-400' : 'text-sp-text'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-sp-muted mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Detail options */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sp-muted">1교시 시작</label>
                    <input
                      type="time"
                      value={preset.firstPeriodStart}
                      onChange={(e) => setPreset((p) => ({ ...p, firstPeriodStart: e.target.value }))}
                      className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sp-muted">쉬는 시간 (분)</label>
                    <input
                      type="number"
                      min={5}
                      max={30}
                      value={preset.breakDuration}
                      onChange={(e) => setPreset((p) => ({ ...p, breakDuration: Number(e.target.value) }))}
                      className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sp-muted">점심 시작 (N교시 후)</label>
                    <select
                      value={preset.lunchAfterPeriod}
                      onChange={(e) => setPreset((p) => ({ ...p, lunchAfterPeriod: Number(e.target.value) }))}
                      className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      {Array.from({ length: preset.totalPeriods - 1 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}교시 후</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sp-muted">점심 시간 (분)</label>
                    <input
                      type="number"
                      min={30}
                      max={90}
                      value={preset.lunchDuration}
                      onChange={(e) => setPreset((p) => ({ ...p, lunchDuration: Number(e.target.value) }))}
                      className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                {/* Preview + Apply */}
                <div className="flex items-center justify-between pt-3 border-t border-sp-border">
                  <div className="text-xs text-sp-muted">
                    {preset.totalPeriods}교시 · {preset.firstPeriodStart} 시작 · {preset.lunchAfterPeriod}교시 후 점심 {preset.lunchDuration}분
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyPreset}
                    className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                    자동 생성
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-sp-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-sp-bg/80 text-xs text-sp-muted uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 w-20">교시</th>
                    <th className="px-4 py-3">시작</th>
                    <th className="px-4 py-3">종료</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sp-border">
                  {draft.periodTimes.map((pt, i) => {
                    const isAfterLunch = lunchIndex >= 0 && i === lunchIndex;
                    const lunchTimeStr = isAfterLunch ? formatLunchBreakTime(draft.periodTimes, lunchIndex) : '';
                    return (
                      <PeriodRows
                        key={pt.period}
                        period={pt}
                        index={i}
                        showLunchBefore={isAfterLunch}
                        lunchTimeStr={lunchTimeStr}
                        onChangeStart={(v) => updatePeriod(i, 'start', v)}
                        onChangeEnd={(v) => updatePeriod(i, 'end', v)}
                        onDelete={() => deletePeriod(i)}
                        canDelete={draft.periodTimes.length > 1}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 섹션 3: 위젯 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <span className="material-symbols-outlined">widgets</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">위젯 설정</h3>
            </div>
            <div className="space-y-6">
              {/* Opacity slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-sp-text">기본 투명도</span>
                  <span className="text-sm font-bold text-sp-accent">{Math.round(draft.widget.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(draft.widget.opacity * 100)}
                  onChange={(e) => patchWidget({ opacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 bg-sp-border rounded-full appearance-none cursor-pointer accent-sp-accent"
                />
              </div>
              {/* Card Opacity slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-sp-text">카드 배경 투명도</span>
                  <span className="text-sm font-bold text-sp-accent">{Math.round((draft.widget.cardOpacity ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((draft.widget.cardOpacity ?? 1) * 100)}
                  onChange={(e) => patchWidget({ cardOpacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 bg-sp-border rounded-full appearance-none cursor-pointer accent-sp-accent"
                />
              </div>
              {/* Always on top */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sp-text">항상 위에 표시</span>
                  <span className="text-xs text-sp-muted">다른 창보다 항상 위에 고정합니다.</span>
                </div>
                <Toggle
                  checked={draft.widget.alwaysOnTop}
                  onChange={(v) => patchWidget({ alwaysOnTop: v })}
                />
              </div>
              {/* Close to widget */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sp-text">닫기 시 위젯 전환</span>
                  <span className="text-xs text-sp-muted">X 버튼을 누르면 위젯 모드로 전환합니다.</span>
                </div>
                <Toggle
                  checked={draft.widget.closeToWidget}
                  onChange={(v) => patchWidget({ closeToWidget: v })}
                />
              </div>
              {/* Start in widget mode */}
              <div className="flex items-center justify-between pt-4 border-t border-sp-border">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sp-text">시작 시 위젯 모드</span>
                  <span className="text-xs text-sp-muted">앱 실행 시 전체화면 대신 위젯으로 시작합니다.</span>
                </div>
                <Toggle
                  checked={draft.widget.transparent}
                  onChange={(v) => patchWidget({ transparent: v })}
                />
              </div>

              {/* 위젯 표시 안내 */}
              <div className="pt-4 border-t border-sp-border">
                <p className="text-sm font-medium text-sp-text mb-1">위젯 표시 항목</p>
                <p className="text-xs text-sp-muted">위젯 모드는 대시보드 화면의 카드 설정을 그대로 따릅니다. 대시보드 편집 모드에서 카드를 추가/제거하세요.</p>
              </div>
            </div>
          </section>

          {/* ── 섹션 4: 좌석 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                <span className="material-symbols-outlined">chair</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">좌석 설정</h3>
            </div>
            <div className="flex items-center justify-between gap-8">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-sp-muted">행 수 (Rows)</label>
                <NumberStepper
                  value={draft.seatingRows}
                  onChange={(v) => patch({ seatingRows: v })}
                />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-sp-muted">열 수 (Columns)</label>
                <NumberStepper
                  value={draft.seatingCols}
                  onChange={(v) => patch({ seatingCols: v })}
                />
              </div>
            </div>
          </section>

          {/* ── 섹션 5: 시스템 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400">
                <span className="material-symbols-outlined">settings_applications</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">시스템</h3>
            </div>
            <div className="space-y-4 divide-y divide-sp-border/30">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-sp-text">시작 시 자동 실행</span>
                <Toggle
                  checked={draft.system.autoLaunch}
                  onChange={(v) => patchSystem({ autoLaunch: v })}
                />
              </div>
              <div className="flex items-center justify-between py-4">
                <span className="text-sm font-medium text-sp-text">알림 소리</span>
                <Toggle
                  checked={draft.system.notificationSound}
                  onChange={(v) => patchSystem({ notificationSound: v })}
                />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sp-text">방해 금지 시간</span>
                  <span className="text-xs text-sp-muted">지정된 시간에는 알림을 끄도록 설정합니다.</span>
                </div>
                <div className="flex items-center gap-2 bg-sp-surface px-3 py-1.5 rounded-lg border border-sp-border">
                  <input
                    type="time"
                    value={draft.system.doNotDisturbStart}
                    onChange={(e) => patchSystem({ doNotDisturbStart: e.target.value })}
                    className="bg-transparent text-sm text-sp-text focus:outline-none p-0 w-[60px] [color-scheme:dark]"
                  />
                  <span className="text-sp-muted text-sm">~</span>
                  <input
                    type="time"
                    value={draft.system.doNotDisturbEnd}
                    onChange={(e) => patchSystem({ doNotDisturbEnd: e.target.value })}
                    className="bg-transparent text-sm text-sp-text focus:outline-none p-0 w-[60px] [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── 섹션 6: PIN 잠금 설정 ── */}
          <PinLockSection
            draft={draft}
            patch={patch}
            pinMode={pinMode}
            setPinMode={setPinMode}
            pinStep={pinStep}
            setPinStep={setPinStep}
            pinDigits={pinDigits}
            setPinDigits={setPinDigits}
            pinConfirm={pinConfirm}
            setPinConfirm={setPinConfirm}
            pinOld={pinOld}
            setPinOld={setPinOld}
            pinError={pinError}
            setPinError={setPinError}
            pinStore={pinStore}
          />

          {/* ── 섹션 6.5: 좌석 관계 설정 ── */}
          <SeatRelationSection />

          {/* ── 그룹: 일정 관리 ── */}
          <div className="flex items-center gap-3 mt-4 -mb-2">
            <span className="material-symbols-outlined text-sp-accent text-[20px]">event</span>
            <h2 className="text-sm font-bold text-sp-accent uppercase tracking-wider">일정 관리</h2>
            <div className="flex-1 border-t border-sp-border/50" />
          </div>

          {/* ── 섹션 7: 일정 카테고리 관리 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                  <span className="material-symbols-outlined">category</span>
                </div>
                <h3 className="text-lg font-bold text-sp-text">일정 카테고리 관리</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCatForm(true)}
                className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                카테고리 추가
              </button>
            </div>
            <div className="space-y-2">
              {categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  isDefault={DEFAULT_CAT_IDS.has(cat.id)}
                  onDelete={() => deleteCategory(cat.id)}
                />
              ))}

              {/* Add form */}
              {showCatForm && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-sp-surface border border-sp-border">
                  <div className="flex gap-1.5">
                    {CATEGORY_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewCatColor(c)}
                        className={`w-5 h-5 rounded-full ${COLOR_MAP[c]?.bg ?? 'bg-slate-400'} ${newCatColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card' : ''
                          }`}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    placeholder="카테고리 이름"
                    className="flex-1 bg-transparent text-sm text-sp-text placeholder-sp-muted focus:outline-none border-none p-0"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="text-sp-accent hover:text-blue-400 text-xs font-medium"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCatForm(false); setNewCatName(''); }}
                    className="text-sp-muted hover:text-sp-text text-xs"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </section>
          {/* ── 섹션 7.5: NEIS 학사일정 ── */}
          <NeisScheduleSection />

          {/* ── 섹션 7.6: 구글 캘린더 연동 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <CalendarSettings />
          </section>

          {/* ── 섹션 8: 날씨 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                <span className="material-symbols-outlined">cloud</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">날씨</h3>
            </div>

            <div className="space-y-5">
              {/* 지역 선택 */}
              <div>
                <label className="block text-sm text-sp-muted mb-2">지역 선택</label>
                <select
                  value={draft.weather.location ? `${draft.weather.location.lat},${draft.weather.location.lon}` : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      patchWeather({ location: null });
                      return;
                    }
                    const parts = val.split(',').map(Number);
                    const lat = parts[0] ?? 0;
                    const lon = parts[1] ?? 0;
                    const selected = KOREAN_CITIES.find((c) => c.lat === lat && c.lon === lon);
                    patchWeather({ location: { lat, lon, name: selected?.name ?? '' } });
                  }}
                  className="w-full px-4 py-3 bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:ring-2 focus:ring-sp-accent focus:border-transparent outline-none"
                >
                  <option value="">지역을 선택하세요</option>
                  {KOREAN_CITIES.map((city) => (
                    <option key={`${city.lat},${city.lon}`} value={`${city.lat},${city.lon}`}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 갱신 주기 */}
              <div>
                <label className="block text-sm text-sp-muted mb-2">갱신 주기</label>
                <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
                  {([
                    { value: 15, label: '15분' },
                    { value: 30, label: '30분' },
                    { value: 60, label: '1시간' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patchWeather({ refreshIntervalMin: opt.value })}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${draft.weather.refreshIntervalMin === opt.value
                          ? 'bg-sp-accent text-white shadow-md'
                          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 현재 상태 표시 */}
              {draft.weather.location && (
                <div className="p-3 bg-sp-surface/50 rounded-lg border border-sp-border">
                  <p className="text-xs text-sp-muted">
                    <span className="material-symbols-outlined text-sm align-middle mr-1">location_on</span>
                    {draft.weather.location.name} · {draft.weather.refreshIntervalMin}분 간격 자동 갱신
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── 섹션 9: 디스플레이 (테마 및 글꼴) ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 xl:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                <span className="material-symbols-outlined">palette</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">디스플레이</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* 테마 설정 */}
              <div>
                <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">테마 (Theme)</h4>
                <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
                  {([
                    { value: 'system', label: '시스템 설정', icon: 'brightness_auto' },
                    { value: 'light', label: '라이트 테마', icon: 'light_mode' },
                    { value: 'dark', label: '다크 테마', icon: 'dark_mode' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch({ theme: opt.value })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${draft.theme === opt.value
                        ? 'bg-sp-accent text-white shadow-md'
                        : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 글꼴 크기 설정 */}
              <div>
                <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">글꼴 크기 (Font Size)</h4>
                <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
                  {([
                    { value: 'small', label: '작게', iconSize: 'text-[14px]' },
                    { value: 'medium', label: '보통', iconSize: 'text-[16px]' },
                    { value: 'large', label: '크게', iconSize: 'text-[18px]' },
                    { value: 'xlarge', label: '매우 크게', iconSize: 'text-[20px]' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch({ fontSize: opt.value })}
                      className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-md text-sm font-medium transition-all ${draft.fontSize === opt.value
                        ? 'bg-sp-accent text-white shadow-md'
                        : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                        }`}
                    >
                      <span className={`material-symbols-outlined ${opt.iconSize}`}>format_size</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── 섹션 10: 앱 정보 ── */}
          <AppInfoSection />

        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sp-muted text-xs">SsamPin v{__APP_VERSION__}</p>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showReset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-sp-text mb-2">설정 초기화</h3>
            <p className="text-sm text-sp-muted mb-6">
              변경사항을 저장하지 않고 마지막 저장 상태로 되돌리시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Period Row (with optional lunch separator) ─── */
function PeriodRows({
  period,
  index,
  showLunchBefore,
  lunchTimeStr,
  onChangeStart,
  onChangeEnd,
  onDelete,
  canDelete,
}: {
  period: PeriodTime;
  index: number;
  showLunchBefore: boolean;
  lunchTimeStr: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <>
      {showLunchBefore && (
        <tr className="bg-sp-surface/80 border-y-2 border-sp-border">
          <td className="px-4 py-3 font-medium text-sp-muted italic">점심</td>
          <td className="px-4 py-3 text-sp-muted">{lunchTimeStr.split(' ~ ')[0] || ''}</td>
          <td className="px-4 py-3 text-sp-muted">{lunchTimeStr.split(' ~ ')[1] || ''}</td>
          <td className="px-4 py-3" />
        </tr>
      )}
      <tr className="bg-sp-card hover:bg-sp-text/5 transition-colors">
        <td className="px-4 py-2 font-medium text-sp-text">{index + 1}교시</td>
        <td className="px-4 py-2">
          <input
            type="time"
            value={period.start}
            onChange={(e) => onChangeStart(e.target.value)}
            className="bg-transparent text-sp-text focus:text-sp-text focus:outline-none border-none p-0 w-full [color-scheme:dark]"
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="time"
            value={period.end}
            onChange={(e) => onChangeEnd(e.target.value)}
            className="bg-transparent text-sp-text focus:text-sp-text focus:outline-none border-none p-0 w-full [color-scheme:dark]"
          />
        </td>
        <td className="px-4 py-2 text-center">
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-sp-muted hover:text-red-400 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </td>
      </tr>
    </>
  );
}

/* ─── Category Row ─── */
function CategoryRow({
  category,
  isDefault,
  onDelete,
}: {
  category: CategoryItem;
  isDefault: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-sp-surface/80 hover:bg-sp-surface transition-colors group border border-transparent hover:border-sp-border">
      <div className="flex items-center gap-3">
        <div className={colorDot(category.color)} />
        <span className="text-sm font-medium text-sp-text">{category.name}</span>
        {isDefault && (
          <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">기본</span>
        )}
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={onDelete}
          className="text-sp-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}
    </div>
  );
}

/* ─── Auto Lock Options ─── */
const AUTO_LOCK_OPTIONS = [
  { value: 0, label: '즉시 (매번)' },
  { value: 1, label: '1분' },
  { value: 3, label: '3분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
];

/** NAV_ITEMS에서 자동 파생 — 사이드바에 메뉴 추가 시 PIN 설정에도 자동 반영 */
const FEATURE_LABELS: { key: ProtectedFeatureKey; icon: string; label: string }[] =
  PROTECTABLE_PAGES.map((p) => ({ key: p.featureKey, icon: p.icon, label: p.label }));

/* ─── PIN Lock Settings Section ─── */
interface PinLockSectionProps {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
  pinMode: 'idle' | 'setup' | 'change' | 'remove';
  setPinMode: (m: 'idle' | 'setup' | 'change' | 'remove') => void;
  pinStep: 'input' | 'confirm' | 'old';
  setPinStep: (s: 'input' | 'confirm' | 'old') => void;
  pinDigits: string;
  setPinDigits: (d: string) => void;
  pinConfirm: string;
  setPinConfirm: (d: string) => void;
  pinOld: string;
  setPinOld: (d: string) => void;
  pinError: string;
  setPinError: (e: string) => void;
  pinStore: {
    verify: (pin: string) => boolean;
    setupPin: (newPin: string, features: ProtectedFeatures, autoLockMinutes: number, oldPin?: string) => { success: boolean; error?: string };
    removePin: (currentPin: string) => { success: boolean; error?: string };
    updateProtectedFeatures: (features: Partial<ProtectedFeatures>) => void;
    updateAutoLockMinutes: (minutes: number) => void;
    lock: () => void;
  };
}

function PinLockSection({
  draft,
  patch,
  pinMode,
  setPinMode,
  pinStep,
  setPinStep,
  pinDigits,
  setPinDigits,
  pinConfirm,
  setPinConfirm,
  pinOld,
  setPinOld,
  pinError,
  setPinError,
  pinStore,
}: PinLockSectionProps) {
  const pinEnabled = draft.pin.enabled && draft.pin.pinHash !== null;

  const resetPinForm = () => {
    setPinMode('idle');
    setPinStep('input');
    setPinDigits('');
    setPinConfirm('');
    setPinOld('');
    setPinError('');
  };

  const handleSetupStart = () => {
    setPinMode('setup');
    setPinStep('input');
    setPinDigits('');
    setPinConfirm('');
    setPinError('');
  };

  const handleChangeStart = () => {
    setPinMode('change');
    setPinStep('old');
    setPinOld('');
    setPinDigits('');
    setPinConfirm('');
    setPinError('');
  };

  const handleRemoveStart = () => {
    setPinMode('remove');
    setPinStep('old');
    setPinOld('');
    setPinError('');
  };

  const handlePinSubmit = () => {
    if (pinMode === 'remove') {
      const result = pinStore.removePin(pinOld);
      if (result.success) {
        patch({
          pin: {
            enabled: false,
            pinHash: null,
            protectedFeatures: { timetable: false, seating: false, schedule: false, studentRecords: false, meal: false, memo: false, todo: false },
            autoLockMinutes: 5,
          },
        });
        resetPinForm();
      } else {
        setPinError(result.error ?? 'PIN이 일치하지 않습니다');
        setPinOld('');
      }
      return;
    }

    if (pinStep === 'old') {
      const ok = pinStore.verify(pinOld);
      if (ok) {
        setPinStep('input');
        setPinError('');
      } else {
        setPinError('기존 PIN이 일치하지 않습니다');
        setPinOld('');
      }
      return;
    }

    if (pinStep === 'input') {
      if (pinDigits.length !== 4) {
        setPinError('4자리 숫자를 입력해주세요');
        return;
      }
      setPinStep('confirm');
      setPinError('');
      return;
    }

    if (pinStep === 'confirm') {
      if (pinDigits !== pinConfirm) {
        setPinError('PIN이 일치하지 않습니다');
        setPinConfirm('');
        return;
      }
      const result = pinStore.setupPin(
        pinDigits,
        draft.pin.protectedFeatures,
        draft.pin.autoLockMinutes,
        pinMode === 'change' ? pinOld : undefined,
      );
      if (result.success) {
        resetPinForm();
      } else {
        setPinError(result.error ?? '오류가 발생했습니다');
      }
    }
  };

  const patchPin = (p: Partial<PinSettings>) => {
    patch({ pin: { ...draft.pin, ...p } });
  };

  const patchFeature = (key: keyof ProtectedFeatures, value: boolean) => {
    pinStore.updateProtectedFeatures({ [key]: value });
    patchPin({
      protectedFeatures: { ...draft.pin.protectedFeatures, [key]: value },
    });
  };

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
          <span className="material-symbols-outlined">lock</span>
        </div>
        <h3 className="text-lg font-bold text-sp-text">PIN 잠금 설정</h3>
        {pinEnabled && (
          <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">
            활성화됨
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* PIN 미설정 시 */}
        {!pinEnabled && pinMode === 'idle' && (
          <button
            type="button"
            onClick={handleSetupStart}
            className="w-full px-4 py-3 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sp-accent hover:bg-sp-accent/20 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">lock</span>
            PIN 설정하기
          </button>
        )}

        {/* PIN 설정됨: 변경/해제 버튼 */}
        {pinEnabled && pinMode === 'idle' && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleChangeStart}
              className="flex-1 px-4 py-2.5 rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              PIN 변경
            </button>
            <button
              type="button"
              onClick={handleRemoveStart}
              className="flex-1 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">lock_open</span>
              PIN 해제
            </button>
          </div>
        )}

        {/* PIN 입력 폼 */}
        {pinMode !== 'idle' && (
          <div className="p-4 rounded-lg bg-sp-surface/80 border border-sp-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-sp-text">
                {pinMode === 'remove' ? '현재 PIN 입력' :
                  pinStep === 'old' ? '현재 PIN 입력' :
                    pinStep === 'input' ? '새 PIN 입력 (4자리)' :
                      'PIN 확인 (한 번 더)'}
              </span>
              <button
                type="button"
                onClick={resetPinForm}
                className="text-xs text-sp-muted hover:text-sp-text"
              >
                취소
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={
                  pinStep === 'old' || pinMode === 'remove' ? pinOld :
                    pinStep === 'confirm' ? pinConfirm :
                      pinDigits
                }
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  if (pinStep === 'old' || pinMode === 'remove') setPinOld(v);
                  else if (pinStep === 'confirm') setPinConfirm(v);
                  else setPinDigits(v);
                  setPinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePinSubmit();
                }}
                placeholder="····"
                className="flex-1 bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 text-sp-text text-center text-xl tracking-[0.5em] placeholder-sp-border focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                autoFocus
              />
              <button
                type="button"
                onClick={handlePinSubmit}
                className="px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                {pinStep === 'confirm' ? '완료' :
                  pinMode === 'remove' ? '해제' : '다음'}
              </button>
            </div>

            {/* PIN dots indicator */}
            <div className="flex justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => {
                const currentValue = pinStep === 'old' || pinMode === 'remove' ? pinOld :
                  pinStep === 'confirm' ? pinConfirm : pinDigits;
                return (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${i < currentValue.length
                        ? 'bg-sp-accent'
                        : 'bg-sp-border/50'
                      }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs text-red-400 text-center">{pinError}</p>
            )}
          </div>
        )}

        {/* 기능별 보호 설정 */}
        {pinEnabled && (
          <>
            <div className="pt-4 border-t border-sp-border">
              <h4 className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">
                기능별 PIN 보호
              </h4>
              <div className="space-y-3">
                {FEATURE_LABELS.map(({ key, icon, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sp-muted text-[18px]">{icon}</span>
                      <span className="text-sm font-medium text-sp-text">{label}</span>
                    </div>
                    <Toggle
                      checked={draft.pin.protectedFeatures[key]}
                      onChange={(v) => patchFeature(key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 자동 잠금 시간 */}
            <div className="pt-4 border-t border-sp-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-sp-text">자동 잠금 시간</span>
                  <p className="text-xs text-sp-muted mt-0.5">
                    마지막 PIN 입력 후 설정 시간이 지나면 다시 잠깁니다
                  </p>
                </div>
                <select
                  value={draft.pin.autoLockMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    pinStore.updateAutoLockMinutes(val);
                    patchPin({ autoLockMinutes: val });
                  }}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
                >
                  {AUTO_LOCK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 수동 잠금 버튼 */}
            <div className="pt-4 border-t border-sp-border">
              <button
                type="button"
                onClick={() => pinStore.lock()}
                className="w-full px-4 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:bg-sp-text/5 hover:text-sp-text text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">lock</span>
                지금 잠그기
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
