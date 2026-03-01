import { useEffect, useState, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import type { Settings, WidgetSettings, SystemSettings, SchoolLevel } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import type { PeriodPreset } from '@domain/rules/periodRules';
import { getDefaultPreset, generatePeriodTimes } from '@domain/rules/periodRules';

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-sp-accent' : 'bg-slate-700'
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
    <div className="flex items-center bg-slate-700/50 rounded-lg border border-sp-border p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-white hover:bg-white/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">remove</span>
      </button>
      <span className="flex-1 text-center text-white font-bold text-lg">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-white hover:bg-white/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
}

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

  /* period preset */
  const [preset, setPreset] = useState<PeriodPreset>(() => getDefaultPreset(settings.schoolLevel));
  const [showPreset, setShowPreset] = useState(false);

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

  const updatePeriod = useCallback(
    (index: number, field: 'start' | 'end', value: string) => {
      setDraft((prev) => {
        const arr = [...prev.periodTimes] as PeriodTime[];
        const existing = arr[index];
        if (!existing) return prev;
        arr[index] = { period: existing.period, start: existing.start, end: existing.end, [field]: value };
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(draft);
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
  // Insert lunch row after the last morning period (period ending at or before 12:30)
  const lunchIndex = draft.periodTimes.findIndex(
    (p, i) => {
      const next = draft.periodTimes[i + 1];
      return i < draft.periodTimes.length - 1 && p.end >= '12:00' && next !== undefined && next.start >= '12:30';
    },
  );

  return (
    <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 sticky top-0 bg-sp-bg/95 backdrop-blur-sm z-10 border-b border-sp-border/30">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-muted">settings</span>
            설정
          </h2>
          <p className="text-sp-muted text-sm mt-1">앱의 환경설정을 관리하세요.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="px-5 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:bg-white/5 hover:text-white font-medium text-sm transition-colors flex items-center gap-2"
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
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <span className="material-symbols-outlined">school</span>
              </div>
              <h3 className="text-lg font-bold text-white">학교/학급 정보</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {([
                ['schoolName', '학교명'] as const,
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
                    className="w-full bg-slate-700/50 border border-sp-border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── 섹션 2: 교시 시간 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6 xl:row-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <h3 className="text-lg font-bold text-white">교시 시간 설정</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPreset((v) => !v)}
                  className={`text-xs font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-colors ${showPreset
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'border-sp-border text-sp-muted hover:text-white hover:bg-white/5'
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
              <div className="mb-6 p-5 rounded-lg bg-slate-800/60 border border-emerald-500/20 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-emerald-400 text-[18px]">auto_fix_high</span>
                  <span className="text-sm font-bold text-white">학교급 선택</span>
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
                          : 'border-sp-border hover:border-sp-muted/50 hover:bg-white/5'
                        }`}
                    >
                      <div className={`text-sm font-bold ${preset.schoolLevel === opt.value ? 'text-emerald-400' : 'text-white'}`}>
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
                      className="w-full bg-slate-700/50 border border-sp-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert"
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
                      className="w-full bg-slate-700/50 border border-sp-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sp-muted">점심 시작 (N교시 후)</label>
                    <select
                      value={preset.lunchAfterPeriod}
                      onChange={(e) => setPreset((p) => ({ ...p, lunchAfterPeriod: Number(e.target.value) }))}
                      className="w-full bg-slate-700/50 border border-sp-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
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
                      className="w-full bg-slate-700/50 border border-sp-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                {/* Preview + Apply */}
                <div className="flex items-center justify-between pt-3 border-t border-sp-border/30">
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
                <thead className="bg-slate-900/50 text-xs text-sp-muted uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 w-20">교시</th>
                    <th className="px-4 py-3">시작</th>
                    <th className="px-4 py-3">종료</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sp-border">
                  {draft.periodTimes.map((pt, i) => {
                    const isAfterLunch = lunchIndex >= 0 && i === lunchIndex + 1;
                    return (
                      <PeriodRows
                        key={pt.period}
                        period={pt}
                        index={i}
                        showLunchBefore={isAfterLunch}
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
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <span className="material-symbols-outlined">widgets</span>
              </div>
              <h3 className="text-lg font-bold text-white">위젯 설정</h3>
            </div>
            <div className="space-y-6">
              {/* Opacity slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-300">기본 투명도</span>
                  <span className="text-sm font-bold text-sp-accent">{draft.widget.opacity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draft.widget.opacity}
                  onChange={(e) => patchWidget({ opacity: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-sp-accent"
                />
              </div>
              {/* Always on top */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-200">항상 위에 표시</span>
                  <span className="text-xs text-slate-500">다른 창보다 항상 위에 고정합니다.</span>
                </div>
                <Toggle
                  checked={draft.widget.alwaysOnTop}
                  onChange={(v) => patchWidget({ alwaysOnTop: v })}
                />
              </div>
              {/* Start in widget mode */}
              <div className="flex items-center justify-between pt-4 border-t border-sp-border/30">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-200">시작 시 위젯 모드</span>
                  <span className="text-xs text-slate-500">앱 실행 시 전체화면 대신 위젯으로 시작합니다.</span>
                </div>
                <Toggle
                  checked={draft.widget.transparent}
                  onChange={(v) => patchWidget({ transparent: v })}
                />
              </div>
            </div>
          </section>

          {/* ── 섹션 4: 좌석 설정 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                <span className="material-symbols-outlined">chair</span>
              </div>
              <h3 className="text-lg font-bold text-white">좌석 설정</h3>
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
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400">
                <span className="material-symbols-outlined">settings_applications</span>
              </div>
              <h3 className="text-lg font-bold text-white">시스템</h3>
            </div>
            <div className="space-y-4 divide-y divide-sp-border/30">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-200">시작 시 자동 실행</span>
                <Toggle
                  checked={draft.system.autoLaunch}
                  onChange={(v) => patchSystem({ autoLaunch: v })}
                />
              </div>
              <div className="flex items-center justify-between py-4">
                <span className="text-sm font-medium text-slate-200">알림 소리</span>
                <Toggle
                  checked={draft.system.notificationSound}
                  onChange={(v) => patchSystem({ notificationSound: v })}
                />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-200">방해 금지 시간</span>
                  <span className="text-xs text-slate-500">지정된 시간에는 알림을 끄도록 설정합니다.</span>
                </div>
                <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded-lg border border-sp-border">
                  <input
                    type="time"
                    value={draft.system.doNotDisturbStart}
                    onChange={(e) => patchSystem({ doNotDisturbStart: e.target.value })}
                    className="bg-transparent text-sm text-white focus:outline-none p-0 w-[60px] [&::-webkit-calendar-picker-indicator]:invert"
                  />
                  <span className="text-sp-muted text-sm">~</span>
                  <input
                    type="time"
                    value={draft.system.doNotDisturbEnd}
                    onChange={(e) => patchSystem({ doNotDisturbEnd: e.target.value })}
                    className="bg-transparent text-sm text-white focus:outline-none p-0 w-[60px] [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── 섹션 6: 일정 카테고리 관리 ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                  <span className="material-symbols-outlined">category</span>
                </div>
                <h3 className="text-lg font-bold text-white">일정 카테고리 관리</h3>
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
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/80 border border-sp-border/50">
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
                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none border-none p-0"
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
                    className="text-sp-muted hover:text-white text-xs"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </section>
          {/* ── 섹션 7: 디스플레이 (테마 및 글꼴) ── */}
          <section className="bg-sp-card rounded-xl ring-1 ring-sp-border/50 p-6 xl:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                <span className="material-symbols-outlined">palette</span>
              </div>
              <h3 className="text-lg font-bold text-white">디스플레이</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* 테마 설정 */}
              <div>
                <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">테마 (Theme)</h4>
                <div className="flex bg-slate-800/50 p-1 rounded-lg border border-sp-border/50">
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
                          : 'text-sp-muted hover:text-white hover:bg-white/5'
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
                <div className="flex bg-slate-800/50 p-1 rounded-lg border border-sp-border/50">
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
                          : 'text-sp-muted hover:text-white hover:bg-white/5'
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
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-slate-600 text-xs">SsamPin v0.1.0</p>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showReset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">설정 초기화</h3>
            <p className="text-sm text-sp-muted mb-6">
              변경사항을 저장하지 않고 마지막 저장 상태로 되돌리시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-white text-sm transition-colors"
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
  onChangeStart,
  onChangeEnd,
  onDelete,
  canDelete,
}: {
  period: PeriodTime;
  index: number;
  showLunchBefore: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <>
      {showLunchBefore && (
        <tr className="bg-slate-800/50 border-y-2 border-slate-700/50">
          <td className="px-4 py-3 font-medium text-slate-400 italic">점심</td>
          <td className="px-4 py-3 text-slate-400">12:00</td>
          <td className="px-4 py-3 text-slate-400">13:00</td>
          <td className="px-4 py-3" />
        </tr>
      )}
      <tr className="bg-sp-card hover:bg-white/5 transition-colors">
        <td className="px-4 py-2 font-medium text-white">{index + 1}교시</td>
        <td className="px-4 py-2">
          <input
            type="time"
            value={period.start}
            onChange={(e) => onChangeStart(e.target.value)}
            className="bg-transparent text-slate-300 focus:text-white focus:outline-none border-none p-0 w-full [&::-webkit-calendar-picker-indicator]:invert"
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="time"
            value={period.end}
            onChange={(e) => onChangeEnd(e.target.value)}
            className="bg-transparent text-slate-300 focus:text-white focus:outline-none border-none p-0 w-full [&::-webkit-calendar-picker-indicator]:invert"
          />
        </td>
        <td className="px-4 py-2 text-center">
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-slate-500 hover:text-red-400 transition-colors"
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
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors group border border-transparent hover:border-sp-border/50">
      <div className="flex items-center gap-3">
        <div className={colorDot(category.color)} />
        <span className="text-sm font-medium text-slate-200">{category.name}</span>
        {isDefault && (
          <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">기본</span>
        )}
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={onDelete}
          className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}
    </div>
  );
}
