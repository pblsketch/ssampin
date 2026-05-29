import { useState, useCallback } from 'react';
import type { Settings, SchoolLevel } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { PeriodPreset } from '@domain/rules/periodRules';
import {
  getDefaultPreset,
  generatePeriodTimes,
  parseMinutes,
  formatTime,
  PERIOD_DURATION,
  getDefaultLunchTime,
  moveLunchToAfterPeriod,
  inferLunchAfterPeriod,
} from '@domain/rules/periodRules';
import { getLunchBreakIndex, formatLunchBreakTime } from '@adapters/presenters/timetablePresenter';
import { useToastStore } from '@adapters/components/common/Toast';
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
        const duration =
          draft.schoolLevel === 'custom' && draft.customPeriodDuration
            ? draft.customPeriodDuration
            : PERIOD_DURATION[draft.schoolLevel];
        const startMin = parseMinutes(value);
        const endH = Math.floor((startMin + duration) / 60);
        const endM = (startMin + duration) % 60;
        const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        arr[index] = { period: existing.period, start: value, end: endStr };
      } else {
        arr[index] = {
          period: existing.period,
          start: existing.start,
          end: existing.end,
          [field]: value,
        };
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

  const deletePeriod = useCallback(
    (index: number) => {
      const arr = draft.periodTimes.filter((_, i) => i !== index);
      const renumbered = arr.map((p, i) => ({ ...p, period: i + 1 }));
      patch({ periodTimes: renumbered, maxPeriods: renumbered.length });
    },
    [draft.periodTimes, patch],
  );

  const lunchIndex = getLunchBreakIndex(
    draft.periodTimes,
    draft.lunchStart,
    draft.lunchEnd,
    draft.lunchAfterPeriod,
  );

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
        patch({ periodTimes: arr, lunchEnd: value });
      } else if (field === 'start') {
        const newLunchStart = parseMinutes(value);
        arr[lunchIndex - 1] = {
          ...prevPeriod,
          end: formatTime(newLunchStart),
        };
        patch({ periodTimes: arr, lunchStart: value });
      }
    },
    [draft.periodTimes, lunchIndex, patch],
  );

  const showToast = useToastStore((s) => s.show);

  const handleMoveLunch = useCallback(
    (direction: 'up' | 'down') => {
      const currentAfter = draft.lunchAfterPeriod ?? inferLunchAfterPeriod(draft.periodTimes);
      if (currentAfter === null || currentAfter === undefined) {
        showToast('점심 위치를 인식할 수 없습니다.', 'error');
        return;
      }

      const target = direction === 'up' ? currentAfter - 1 : currentAfter + 1;

      const inRange = currentAfter >= 1 && currentAfter < draft.periodTimes.length;
      const lunchStartStr =
        draft.lunchStart ?? (inRange ? draft.periodTimes[currentAfter - 1]!.end : '');
      const lunchEndStr = draft.lunchEnd ?? (inRange ? draft.periodTimes[currentAfter]!.start : '');
      const lunchDur =
        lunchStartStr && lunchEndStr ? parseMinutes(lunchEndStr) - parseMinutes(lunchStartStr) : 0;

      const result = moveLunchToAfterPeriod(draft.periodTimes, currentAfter, target, lunchDur);

      if (result.status === 'noop' || result.status === 'boundary') {
        return;
      }
      if (result.status === 'invalid-duration') {
        showToast('점심 길이를 먼저 설정해주세요.', 'error');
        return;
      }
      if (result.status === 'overflow') {
        showToast('점심 위치를 옮길 수 없습니다 (시간 범위 초과).', 'error');
        return;
      }

      patch({
        periodTimes: result.periodTimes,
        lunchStart: result.lunchStart,
        lunchEnd: result.lunchEnd,
        lunchAfterPeriod: result.lunchAfterPeriod,
      });
    },
    [draft.periodTimes, draft.lunchAfterPeriod, draft.lunchStart, draft.lunchEnd, patch, showToast],
  );

  const resolvedLunchAfter =
    draft.lunchAfterPeriod ?? inferLunchAfterPeriod(draft.periodTimes) ?? 0;
  const canMoveUp = resolvedLunchAfter > 1;
  const canMoveDown = resolvedLunchAfter >= 1 && resolvedLunchAfter < draft.periodTimes.length - 1;

  const handleApplyPreset = useCallback(() => {
    const generated = generatePeriodTimes(preset);
    const lunchPeriod = generated[preset.lunchAfterPeriod - 1];
    const afterLunch = generated[preset.lunchAfterPeriod];
    patch({
      schoolLevel: preset.schoolLevel,
      periodTimes: generated,
      maxPeriods: generated.length,
      customPeriodDuration:
        preset.schoolLevel === 'custom' ? preset.customPeriodDuration : undefined,
      lunchStart: lunchPeriod?.end,
      lunchEnd: afterLunch?.start,
      lunchAfterPeriod: preset.lunchAfterPeriod,
    });
    setShowPreset(false);
  }, [preset, patch]);

  const handleSchoolLevelChange = useCallback((level: SchoolLevel) => {
    const newPreset = getDefaultPreset(level);
    setPreset(newPreset);
  }, []);

  return (
    <>
      <SettingsSection
        icon="schedule"
        iconColor="bg-emerald-500/10 text-emerald-400"
        title="교시 시간 설정"
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPreset((v) => !v)}
              className={`text-xs font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-colors ${
                showPreset
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
              }`}
            >
              <span className="material-symbols-outlined text-icon">auto_fix_high</span>
              빠른 설정
            </button>
            <button
              type="button"
              onClick={addPeriod}
              className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-icon">add</span>
              교시 추가
            </button>
          </div>
        }
      >
        {/* 빠른 설정 패널 */}
        {showPreset && (
          <div className="mb-6 p-5 rounded-lg bg-sp-surface/80 border border-emerald-500/20 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-emerald-400 text-icon-md">
                auto_fix_high
              </span>
              <span className="text-sm font-bold text-sp-text">학교급 선택</span>
              <span className="text-xs text-sp-muted ml-auto">
                학교급에 맞게 교시 시간을 자동으로 생성합니다
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {SCHOOL_LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSchoolLevelChange(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    preset.schoolLevel === opt.value
                      ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
                      : 'border-sp-border hover:border-sp-muted/50 hover:bg-sp-text/5'
                  }`}
                >
                  <div
                    className={`text-sm font-bold ${preset.schoolLevel === opt.value ? 'text-emerald-400' : 'text-sp-text'}`}
                  >
                    {opt.label}
                  </div>
                  <div className="text-detail text-sp-muted mt-0.5">{opt.desc}</div>
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
                  onChange={(e) =>
                    setPreset((p) => ({ ...p, breakDuration: Number(e.target.value) }))
                  }
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-sp-muted">점심 시작 (N교시 후)</label>
                <select
                  value={preset.lunchAfterPeriod}
                  onChange={(e) =>
                    setPreset((p) => ({ ...p, lunchAfterPeriod: Number(e.target.value) }))
                  }
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {Array.from({ length: preset.totalPeriods - 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}교시 후
                    </option>
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
                  onChange={(e) =>
                    setPreset((p) => ({ ...p, lunchDuration: Number(e.target.value) }))
                  }
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-caption text-sp-muted/70 leading-relaxed">
                  쉬는 시간({preset.breakDuration}분)이 별도로 추가됩니다. 실제 점심 간격:{' '}
                  {preset.lunchDuration + preset.breakDuration}분
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
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        customPeriodDuration: Math.max(20, Math.min(120, Number(e.target.value))),
                      }))
                    }
                    className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <p className="text-caption text-sp-muted/70">20~120분</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-sp-muted">총 교시 수</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={preset.totalPeriods}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        totalPeriods: Math.max(1, Math.min(12, Number(e.target.value))),
                      }))
                    }
                    className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <p className="text-caption text-sp-muted/70">1~12교시</p>
                </div>
              </div>
            )}

            {/* 미리보기 */}
            <div className="mt-1 p-3 rounded-lg bg-sp-bg/50 border border-sp-border/50">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-outlined text-icon-sm text-sp-muted">
                  preview
                </span>
                <span className="text-caption font-medium text-sp-muted uppercase tracking-wider">
                  미리보기
                </span>
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
                          <span className="text-sp-text font-mono text-detail">{pt.start}</span>
                          <span className="text-sp-muted">~</span>
                          <span className="text-sp-text font-mono text-detail">{pt.end}</span>
                        </div>
                        {isBeforeLunch && (
                          <div className="flex items-center gap-3 py-0.5 text-amber-700">
                            <span className="w-10 text-center">🍱</span>
                            <span className="font-mono text-detail">{pt.end}</span>
                            <span className="text-amber-600">~</span>
                            <span className="font-mono text-detail">
                              {formatTime(parseMinutes(pt.end) + preset.lunchDuration)}
                            </span>
                            <span className="text-caption text-amber-600">
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

            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
              <span className="material-symbols-outlined text-icon text-red-400 shrink-0">
                warning
              </span>
              <span>
                적용하면 직접 편집한 교시 시간이 모두 초기화됩니다. 일부 시간만 조정하고 싶다면
                아래의 표에서 직접 수정하세요.
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-sp-border">
              <div className="text-xs text-sp-muted">
                {preset.totalPeriods}교시 · {preset.firstPeriodStart} 시작 ·{' '}
                {preset.lunchAfterPeriod}교시 후 점심 {preset.lunchDuration}분
              </div>
              <button
                type="button"
                onClick={handleApplyPreset}
                className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-icon">auto_fix_high</span>
                자동 생성
              </button>
            </div>
          </div>
        )}

        {/* 주말 수업 설정 */}
        <div className="mb-4 p-4 rounded-lg bg-sp-surface/60 border border-sp-border">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📅</span>
            <div>
              <span className="text-sm font-bold text-sp-text">주말 수업</span>
              <p className="text-detail text-sp-muted mt-0.5">
                시간표에 토요일/일요일 컬럼을 추가합니다
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(['토', '일'] as const).map((day) => {
              const current = draft.enableWeekendDays ?? [];
              const checked = current.includes(day);
              return (
                <label key={day} className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => {
                      const next = checked ? current.filter((d) => d !== day) : [...current, day];
                      patch({ enableWeekendDays: next.length > 0 ? next : undefined });
                    }}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      checked
                        ? 'bg-sp-accent border-sp-accent'
                        : 'border-sp-border hover:border-sp-muted'
                    }`}
                  >
                    {checked && (
                      <span className="material-symbols-outlined text-white text-sm">check</span>
                    )}
                  </button>
                  <span
                    className={`text-sm font-medium ${checked ? 'text-sp-text' : 'text-sp-muted'}`}
                  >
                    {day}요일
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 점심시간 설정 */}
        <div className="mb-4 p-4 rounded-lg bg-sp-surface/60 border border-sp-border">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🍱</span>
            <span className="text-sm font-bold text-sp-text">점심시간</span>
            {resolvedLunchAfter >= 1 && (
              <span className="text-xs text-amber-400 font-medium ml-auto">
                현재 위치: {resolvedLunchAfter}교시 후
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={draft.lunchStart ?? getDefaultLunchTime(draft.schoolLevel).start}
              onChange={(e) => patch({ lunchStart: e.target.value })}
              className="bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-amber-500/50 [color-scheme:dark]"
            />
            <span className="text-sm text-sp-muted">~</span>
            <input
              type="time"
              value={draft.lunchEnd ?? getDefaultLunchTime(draft.schoolLevel).end}
              onChange={(e) => patch({ lunchEnd: e.target.value })}
              className="bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-amber-500/50 [color-scheme:dark]"
            />
            <span className="text-xs text-sp-muted">
              (
              {(() => {
                const s = parseMinutes(
                  draft.lunchStart ?? getDefaultLunchTime(draft.schoolLevel).start,
                );
                const e = parseMinutes(
                  draft.lunchEnd ?? getDefaultLunchTime(draft.schoolLevel).end,
                );
                return e > s ? `${e - s}분` : '';
              })()}
              )
            </span>
          </div>
          <p className="mt-2 text-detail text-sp-muted/80 leading-relaxed flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm text-sp-muted">info</span>
            아래 표의 점심 행에서 ↑↓ 버튼으로 위치를 옮기세요.
          </p>
        </div>

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
                const lunchTimeStr = isAfterLunch
                  ? formatLunchBreakTime(draft.periodTimes, lunchIndex)
                  : '';
                return (
                  <PeriodRows
                    key={pt.period}
                    period={pt}
                    index={i}
                    showLunchBefore={isAfterLunch}
                    lunchTimeStr={lunchTimeStr}
                    onChangeStart={(v) => updatePeriod(i, 'start', v)}
                    onChangeEnd={(v) => updatePeriod(i, 'end', v)}
                    onChangeLunchStart={
                      isAfterLunch ? (v) => updateLunchTime('start', v) : undefined
                    }
                    onChangeLunchEnd={isAfterLunch ? (v) => updateLunchTime('end', v) : undefined}
                    onDelete={() => deletePeriod(i)}
                    canDelete={draft.periodTimes.length > 1}
                    onMoveLunchUp={isAfterLunch ? () => handleMoveLunch('up') : undefined}
                    onMoveLunchDown={isAfterLunch ? () => handleMoveLunch('down') : undefined}
                    canMoveLunchUp={isAfterLunch ? canMoveUp : undefined}
                    canMoveLunchDown={isAfterLunch ? canMoveDown : undefined}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      {/* NEIS 시간표 동기화 안내 — 일정 탭으로 이동됨 */}
      {draft.schoolLevel !== 'custom' && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-sp-accent/5 border border-sp-accent/20 mt-2">
          <span className="material-symbols-outlined text-sp-accent text-lg mt-0.5">info</span>
          <div>
            <p className="text-sm text-sp-text font-medium">NEIS 학급 시간표 자동 동기화</p>
            <p className="text-xs text-sp-muted mt-0.5">
              학급 시간표(담임용) 동기화 설정은{' '}
              <strong className="text-sp-accent">일정·연동</strong> 탭의 외부 연동 섹션으로
              이동했습니다.
            </p>
          </div>
        </div>
      )}
    </>
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
  onMoveLunchUp,
  onMoveLunchDown,
  canMoveLunchUp,
  canMoveLunchDown,
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
  onMoveLunchUp?: () => void;
  onMoveLunchDown?: () => void;
  canMoveLunchUp?: boolean;
  canMoveLunchDown?: boolean;
}) {
  return (
    <>
      {showLunchBefore && (
        <tr
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && canMoveLunchUp && onMoveLunchUp) {
              e.preventDefault();
              onMoveLunchUp();
            } else if (e.key === 'ArrowDown' && canMoveLunchDown && onMoveLunchDown) {
              e.preventDefault();
              onMoveLunchDown();
            }
          }}
          className="bg-amber-100 border-y-2 border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
        >
          <td className="px-4 py-2 font-medium text-amber-700 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-icon">restaurant</span>
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
          <td className="px-4 py-2">
            <div className="flex items-center gap-2 justify-center">
              <button
                type="button"
                onClick={onMoveLunchUp}
                disabled={!canMoveLunchUp}
                aria-label="점심을 한 교시 위로 옮기기"
                aria-disabled={!canMoveLunchUp}
                title={canMoveLunchUp ? '점심을 한 교시 위로' : '점심은 1교시 전에 둘 수 없습니다'}
                className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                  canMoveLunchUp
                    ? 'text-amber-700 hover:bg-amber-200 cursor-pointer'
                    : 'text-amber-400/40 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm">arrow_upward</span>
              </button>
              <button
                type="button"
                onClick={onMoveLunchDown}
                disabled={!canMoveLunchDown}
                aria-label="점심을 한 교시 아래로 옮기기"
                aria-disabled={!canMoveLunchDown}
                title={
                  canMoveLunchDown
                    ? '점심을 한 교시 아래로'
                    : '점심은 마지막 교시 뒤에 둘 수 없습니다'
                }
                className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                  canMoveLunchDown
                    ? 'text-amber-700 hover:bg-amber-200 cursor-pointer'
                    : 'text-amber-400/40 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm">arrow_downward</span>
              </button>
              <span className="text-caption text-amber-600 font-medium ml-1">
                {(() => {
                  const parts = lunchTimeStr.split(' ~ ');
                  if (parts.length === 2 && parts[0] && parts[1]) {
                    const diff = parseMinutes(parts[1]) - parseMinutes(parts[0]);
                    return `${diff}분`;
                  }
                  return '';
                })()}
              </span>
            </div>
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
              <span className="material-symbols-outlined text-icon-md">close</span>
            </button>
          )}
        </td>
      </tr>
    </>
  );
}
