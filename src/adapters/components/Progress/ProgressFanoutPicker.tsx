import { useState } from 'react';
import type { FanoutCandidate, FanoutPreviewRow } from './useProgressFanout';

/**
 * "이 진도를 다른 반에도 함께 기록" 선택 UI.
 * 진도 탭 추가 폼과 진도 캘린더 빠른 입력 모달이 공유한다.
 */

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS[d.getDay()]})`;
}

const KIND_HINT: Record<string, string> = {
  'same-slot': '같은 시간',
  'same-day': '같은 날 다른 교시',
  'next-lesson': '다음 수업으로',
  'no-timetable': '시간표 없음 · 같은 날짜',
};

interface ProgressFanoutPickerProps {
  candidates: readonly FanoutCandidate[];
  selectedIds: ReadonlySet<string>;
  onToggle: (classId: string) => void;
  onClear: () => void;
  /** 저장 시 각 반이 어디에 들어갈지 (선택이 없으면 빈 배열) */
  preview: readonly FanoutPreviewRow[];
  compact?: boolean;
}

export function ProgressFanoutPicker({
  candidates,
  selectedIds,
  onToggle,
  onClear,
  preview,
  compact = false,
}: ProgressFanoutPickerProps) {
  const [expanded, setExpanded] = useState(selectedIds.size > 0);

  if (candidates.length === 0) return null;

  const selectedNames = candidates
    .filter((c) => selectedIds.has(c.classId))
    .map((c) => c.name)
    .join(', ');

  return (
    <div className="rounded-lg border border-sp-border bg-sp-card">
      {/* 헤더 — 접기/펼치기 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 ${compact ? 'px-3 py-2' : 'px-3 py-2.5'} text-left`}
      >
        <span className="material-symbols-outlined text-base text-sp-muted">library_add</span>
        <span className="text-xs font-medium text-sp-text">다른 반에도 함께 기록</span>
        {selectedIds.size > 0 && (
          <span className="rounded-full bg-sp-accent/15 px-2 py-0.5 text-xs text-sp-accent">
            {selectedIds.size}개 반
          </span>
        )}
        {!expanded && selectedIds.size > 0 && (
          <span className="min-w-0 flex-1 truncate text-xs text-sp-muted">{selectedNames}</span>
        )}
        <span className="material-symbols-outlined ml-auto text-base text-sp-muted">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-sp-border px-3 py-2.5">
          {/* 반 선택 칩 */}
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.classId);
              return (
                <button
                  key={c.classId}
                  type="button"
                  onClick={() => onToggle(c.classId)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'border-sp-accent/50 bg-sp-accent/15 text-sp-accent'
                      : 'border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text'
                  }`}
                  title={`${c.subject} · ${c.name}`}
                >
                  {c.name}
                  {!c.sameSubject && <span className="ml-1 opacity-60">· {c.subject}</span>}
                </button>
              );
            })}
          </div>

          {selectedIds.size === 0 ? (
            <p className="text-xs text-sp-muted/70">
              선택한 반에는 그 반 시간표에 맞춰 날짜와 교시가 자동으로 정해집니다.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-sp-muted">이렇게 들어갑니다</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="ml-auto text-xs text-sp-muted transition-colors hover:text-sp-text"
                >
                  선택 해제
                </button>
              </div>
              {preview.map((row) => (
                <div key={row.classId} className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-sp-text">{row.name}</span>
                  <span className="text-sp-muted/60">→</span>
                  {row.placement.ok ? (
                    <>
                      <span className="text-sp-text">
                        {formatDate(row.placement.date)} {row.placement.period}교시
                      </span>
                      <span className="truncate text-sp-muted/60">
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
