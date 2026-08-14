import { useState } from 'react';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { DAY_LABELS } from '@mobile/utils/date';
import type { FanoutCandidate, FanoutPreviewRow } from '@domain/rules/progressFanout';

/**
 * "이 진도를 다른 반에도 함께 기록" 선택 UI — 모바일판.
 * 데스크톱 판박이는 @adapters/components/Progress/ProgressFanoutPicker.
 * 손가락으로 누르는 화면이라 칩·헤더 모두 최소 44px 터치 영역을 지킨다.
 */

/** `YYYY-MM-DD` → `8/13(목)` — 좁은 화면용 짧은 표기 */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS[d.getDay()]})`;
}

const KIND_HINT: Record<string, string> = {
  'same-slot': '같은 시간',
  'same-day': '같은 날 다른 교시',
  'next-lesson': '다음 수업으로',
  'no-timetable': '시간표 없음 · 같은 날짜',
};

interface ProgressFanoutSelectorProps {
  candidates: readonly FanoutCandidate[];
  selectedIds: ReadonlySet<string>;
  onToggle: (classId: string) => void;
  onClear: () => void;
  preview: readonly FanoutPreviewRow[];
  /** 교시 이름 표시용 */
  periodTimes?: readonly PeriodTime[];
}

export function ProgressFanoutSelector({
  candidates,
  selectedIds,
  onToggle,
  onClear,
  preview,
  periodTimes,
}: ProgressFanoutSelectorProps) {
  const [expanded, setExpanded] = useState(selectedIds.size > 0);

  if (candidates.length === 0) return null;

  const selectedNames = candidates
    .filter((c) => selectedIds.has(c.classId))
    .map((c) => c.name)
    .join(', ');

  return (
    <div className="border border-sp-border rounded-lg bg-sp-surface/60">
      {/* 헤더 — 접기/펼치기 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{ minHeight: 44 }}
        aria-expanded={expanded}
      >
        <span className="material-symbols-outlined text-base text-sp-muted">library_add</span>
        <span className="text-sm text-sp-text">다른 반에도 함께</span>
        {selectedIds.size > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-sp-accent/15 text-sp-accent text-xs shrink-0">
            {selectedIds.size}개 반
          </span>
        )}
        {!expanded && selectedIds.size > 0 && (
          <span className="flex-1 min-w-0 truncate text-xs text-sp-muted">{selectedNames}</span>
        )}
        <span className="material-symbols-outlined ml-auto text-base text-sp-muted">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 border-t border-sp-border space-y-2">
          {/* 반 선택 칩 */}
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.classId);
              return (
                <button
                  key={c.classId}
                  type="button"
                  onClick={() => onToggle(c.classId)}
                  className={`px-3 rounded-lg border text-sm transition-colors active:scale-95 ${
                    isSelected
                      ? 'border-sp-accent/50 bg-sp-accent/15 text-sp-accent'
                      : 'border-sp-border bg-sp-card text-sp-muted'
                  }`}
                  style={{ minHeight: 40 }}
                  aria-pressed={isSelected}
                >
                  {c.name}
                  {!c.sameSubject && <span className="ml-1 opacity-60">· {c.subject}</span>}
                </button>
              );
            })}
          </div>

          {selectedIds.size === 0 ? (
            <p className="text-xs text-sp-muted">
              고른 반에는 그 반 시간표에 맞춰 날짜와 교시가 자동으로 정해집니다.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-sp-muted">이렇게 들어갑니다</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="ml-auto px-2 py-1 text-xs text-sp-muted"
                  style={{ minHeight: 32 }}
                >
                  선택 해제
                </button>
              </div>
              {preview.map((row) => (
                <div key={row.classId} className="flex items-center gap-1.5 text-xs">
                  <span className="shrink-0 text-sp-text">{row.name}</span>
                  <span className="text-sp-muted">→</span>
                  {row.placement.ok ? (
                    <>
                      <span className="text-sp-text shrink-0">
                        {formatShortDate(row.placement.date)}{' '}
                        {resolvePeriodLabel(row.placement.period, periodTimes)}
                      </span>
                      <span className="text-sp-muted truncate">
                        {KIND_HINT[row.placement.kind]}
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-400">이미 진도가 있어 건너뜁니다</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
