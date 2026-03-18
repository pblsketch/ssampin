import { useState, useCallback } from 'react';
import type { Settings, SchoolLevel } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { PeriodPreset } from '@domain/rules/periodRules';
import { getDefaultPreset, generatePeriodTimes, parseMinutes, formatTime, PERIOD_DURATION } from '@domain/rules/periodRules';
import { getLunchBreakIndex, formatLunchBreakTime } from '@adapters/presenters/timetablePresenter';
import { SettingsSection } from '../shared/SettingsSection';
import { SCHOOL_LEVEL_OPTIONS } from '../shared/constants';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function PeriodTab({ draft, patch }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>(() => getDefaultPreset(draft.schoolLevel));
  const [showPreset, setShowPreset] = useState(false);

  const updatePeriod = useCallback(
    (index: number, field: 'start' | 'end', value: string) => {
      const arr = [...draft.periodTimes] as PeriodTime[];
      const existing = arr[index];
      if (!existing) return;

      if (field === 'start' && draft.schoolLevel) {
        const duration = draft.schoolLevel === 'custom' && draft.customPeriodDuration
          ? draft.customPeriodDuration
          : PERIOD_DURATION[draft.schoolLevel];
        const startMin = parseMinutes(value);
        const endH = Math.floor((startMin + duration) / 60);
        const endM = (startMin + duration) % 60;
        const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        arr[index] = { period: existing.period, start: value, end: endStr };
      } else {
        arr[index] = { period: existing.period, start: existing.start, end: existing.end, [field]: value };
      }

      patch({ periodTimes: arr });
    },
    [draft.periodTimes, draft.schoolLevel, patch],
  );

  const addPeriod = useCallback(() => {
    const next = draft.periodTimes.length + 1;
    const newPeriod: PeriodTime = { period: next, start: '', end: '' };
    patch({
      periodTimes: [...draft.periodTimes, newPeriod],
      maxPeriods: next,
    });
  }, [draft.periodTimes, patch]);

  const deletePeriod = useCallback((index: number) => {
    const arr = draft.periodTimes.filter((_, i) => i !== index);
    const renumbered = arr.map((p, i) => ({ ...p, period: i + 1 }));
    patch({ periodTimes: renumbered, maxPeriods: renumbered.length });
  }, [draft.periodTimes, patch]);

  const lunchIndex = getLunchBreakIndex(draft.periodTimes);

  const updateLunchTime = useCallback(
    (field: 'start' | 'end', value: string) => {
      if (lunchIndex < 0) return;
      const arr = [...draft.periodTimes] as PeriodTime[];

      const prevPeriod = arr[lunchIndex - 1];
      const nextPeriod = arr[lunchIndex];
      if (!prevPeriod || !nextPeriod) return;

      if (field === 'end') {
        const newLunchEnd = parseMinutes(value);
        const oldNextStart = parseMinutes(nextPeriod.start);
        const diff = newLunchEnd - oldNextStart;

        for (let i = lunchIndex; i < arr.length; i++) {
          const p = arr[i]!;
          const newStart = parseMinutes(p.start) + diff;
          const newEnd = parseMinutes(p.end) + diff;
          arr[i] = {
            period: p.period,
            start: formatTime(newStart),
            end: formatTime(newEnd),
          };
        }
        patch({ periodTimes: arr });
      } else if (field === 'start') {
        const newLunchStart = parseMinutes(value);
        arr[lunchIndex - 1] = {
          ...prevPeriod,
          end: formatTime(newLunchStart),
        };
        patch({ periodTimes: arr });
      }
    },
    [draft.periodTimes, lunchIndex, patch],
  );

  const handleApplyPreset = useCallback(() => {
    const generated = generatePeriodTimes(preset);
    patch({
      schoolLevel: preset.schoolLevel,
      periodTimes: generated,
      maxPeriods: generated.length,
      customPeriodDuration: preset.schoolLevel === 'custom' ? preset.customPeriodDuration : undefined,
    });
    setShowPreset(false);
  }, [preset, patch]);

  const handleSchoolLevelChange = useCallback((level: SchoolLevel) => {
    const newPreset = getDefaultPreset(level);
    setPreset(newPreset);
  }, []);

  return (
    <SettingsSection
      icon="schedule"
      iconColor="bg-emerald-500/10 text-emerald-400"
      title="교시 시간 설정"
      actions={
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
      }
    >
      {/* 빠른 설정 패널 */}
      {showPreset && (
        <div className="mb-6 p-5 rounded-lg bg-sp-surface/80 border border-emerald-500/20 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">auto_fix_high</span>
            <span className="text-sm font-bold text-sp-text">학교급 선택</span>
            <span className="text-xs text-sp-muted ml-auto">학교급에 맞게 교시 시간을 자동으로 생성합니다</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
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
              <p className="text-[10px] text-sp-muted/70 leading-relaxed">
                쉬는 시간({preset.breakDuration}분)이 별도로 추가됩니다.
                실제 점심 간격: {preset.lunchDuration + preset.breakDuration}분
              </p>
            </div>
          </div>

          {/* custom일 때 수업 시간/교시 수 입력 */}
          {preset.schoolLevel === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-sp-muted">수업 시간 (분)</label>
                <input
                  type="number"
                  min={20}
                  max={120}
                  value={preset.customPeriodDuration ?? 50}
                  onChange={(e) => setPreset((p) => ({
                    ...p,
                    customPeriodDuration: Math.max(20, Math.min(120, Number(e.target.value))),
                  }))}
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-[10px] text-sp-muted/70">20~120분</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-sp-muted">총 교시 수</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={preset.totalPeriods}
                  onChange={(e) => setPreset((p) => ({
                    ...p,
                    totalPeriods: Math.max(1, Math.min(12, Number(e.target.value))),
                  }))}
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-[10px] text-sp-muted/70">1~12교시</p>
              </div>
            </div>
          )}

          {/* 미리보기 */}
          <div className="mt-1 p-3 rounded-lg bg-sp-bg/50 border border-sp-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-[14px] text-sp-muted">preview</span>
              <span className="text-[10px] font-medium text-sp-muted uppercase tracking-wider">미리보기</span>
            </div>
            <div className="space-y-0.5 text-xs">
              {(() => {
                const preview = generatePeriodTimes(preset);
                return preview.map((pt) => {
                  const isBeforeLunch = pt.period === preset.lunchAfterPeriod;
                  return (
                    <div key={pt.period}>
                      <div className="flex items-center gap-3 py-0.5">
                        <span className="w-10 text-sp-muted">{pt.period}교시</span>
                        <span className="text-sp-text font-mono text-[11px]">{pt.start}</span>
                        <span className="text-sp-muted">~</span>
                        <span className="text-sp-text font-mono text-[11px]">{pt.end}</span>
                      </div>
                      {isBeforeLunch && (
                        <div className="flex items-center gap-3 py-0.5 text-amber-700">
                          <span className="w-10 text-center">🍱</span>
                          <span className="font-mono text-[11px]">{pt.end}</span>
                          <span className="text-amber-600">~</span>
                          <span className="font-mono text-[11px]">
                            {formatTime(parseMinutes(pt.end) + preset.lunchDuration)}
                          </span>
                          <span className="text-[10px] text-amber-600">
                            ({preset.lunchDuration}분)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

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
                  onChangeLunchStart={isAfterLunch ? (v) => updateLunchTime('start', v) : undefined}
                  onChangeLunchEnd={isAfterLunch ? (v) => updateLunchTime('end', v) : undefined}
                  onDelete={() => deletePeriod(i)}
                  canDelete={draft.periodTimes.length > 1}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}

function PeriodRows({
  period,
  index,
  showLunchBefore,
  lunchTimeStr,
  onChangeStart,
  onChangeEnd,
  onChangeLunchStart,
  onChangeLunchEnd,
  onDelete,
  canDelete,
}: {
  period: PeriodTime;
  index: number;
  showLunchBefore: boolean;
  lunchTimeStr: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onChangeLunchStart?: (v: string) => void;
  onChangeLunchEnd?: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <>
      {showLunchBefore && (
        <tr className="bg-amber-100 border-y-2 border-amber-300">
          <td className="px-4 py-2 font-medium text-amber-700 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">restaurant</span>
            점심
          </td>
          <td className="px-4 py-2">
            {onChangeLunchStart ? (
              <input
                type="time"
                value={lunchTimeStr.split(' ~ ')[0] || ''}
                onChange={(e) => onChangeLunchStart(e.target.value)}
                className="bg-transparent text-amber-700 focus:outline-none border-none p-0 w-full"
              />
            ) : (
              <span className="text-amber-700">{lunchTimeStr.split(' ~ ')[0] || ''}</span>
            )}
          </td>
          <td className="px-4 py-2">
            {onChangeLunchEnd ? (
              <input
                type="time"
                value={lunchTimeStr.split(' ~ ')[1] || ''}
                onChange={(e) => onChangeLunchEnd(e.target.value)}
                className="bg-transparent text-amber-700 focus:outline-none border-none p-0 w-full"
              />
            ) : (
              <span className="text-amber-700">{lunchTimeStr.split(' ~ ')[1] || ''}</span>
            )}
          </td>
          <td className="px-4 py-2 text-center">
            <span className="text-[10px] text-amber-600 font-medium">
              {(() => {
                const parts = lunchTimeStr.split(' ~ ');
                if (parts.length === 2 && parts[0] && parts[1]) {
                  const diff = parseMinutes(parts[1]) - parseMinutes(parts[0]);
                  return `${diff}분`;
                }
                return '';
              })()}
            </span>
          </td>
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
