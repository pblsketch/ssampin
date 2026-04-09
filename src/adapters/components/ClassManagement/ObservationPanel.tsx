import { useEffect, useMemo, useState, useCallback } from 'react';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { ObservationForm } from './ObservationForm';
import { ObservationCard } from './ObservationCard';
import { TagFilter } from './TagFilter';
import { UnifiedExportModal } from './UnifiedExportModal';

interface ObservationPanelProps {
  classId: string;
  studentId: string;
  onClose: () => void;
}

export function ObservationPanel({ classId, studentId, onClose }: ObservationPanelProps) {
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showRecords, setShowRecords] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const load = useObservationStore((s) => s.load);
  const allRecords = useObservationStore((s) => s.records);
  const customTags = useObservationStore((s) => s.customTags);
  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);

  const classes = useTeachingClassStore((s) => s.classes);
  const cls = classes.find((c) => c.id === classId);
  const student = cls?.students.find((s) => studentKey(s) === studentId);

  useEffect(() => {
    void load();
  }, [load]);

  const records = useMemo(
    () =>
      allRecords
        .filter((r) => r.studentId === studentId && r.classId === classId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [allRecords, studentId, classId],
  );

  const filteredRecords = useMemo(() => {
    if (filterTags.length === 0) return records;
    return records.filter((r) => r.tags.some((t) => filterTags.includes(t)));
  }, [records, filterTags]);

  const toggleTag = useCallback((tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  return (
    <>
      {/* 인라인 패널 — flex sibling으로 명렬표를 밀어냄 */}
      <div className="w-[340px] shrink-0 bg-sp-card border-l border-sp-border flex flex-col h-full">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sp-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-sp-accent/20 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-sp-accent">
                {student?.number ?? '?'}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-sp-text truncate">
                {student?.name ?? '알 수 없음'}
              </h2>
              <p className="text-[10px] text-sp-muted">
                관찰 기록 {records.length}건
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowExport(true)}
              className="p-1 text-sp-muted hover:text-sp-accent transition-colors"
              title="기록 내보내기"
            >
              <span className="material-symbols-outlined text-lg">download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* 입력 폼 */}
        <ObservationForm classId={classId} studentId={studentId} />

        {/* 기록 목록 (토글) */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {records.length > 0 ? (
            <>
              <button
                onClick={() => setShowRecords((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-sp-muted pt-2 mb-2 uppercase tracking-wide hover:text-sp-text transition-colors w-full"
              >
                <span className="material-symbols-outlined text-sm" style={{ transition: 'transform 0.2s', transform: showRecords ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  chevron_right
                </span>
                최근 기록 ({records.length})
              </button>
              {showRecords && (
                <>
                  {records.length >= 2 && (
                    <div className="mb-2">
                      <TagFilter
                        tags={allTags}
                        activeFilters={filterTags}
                        onToggle={toggleTag}
                        onClear={() => setFilterTags([])}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredRecords.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-sp-muted">
                        <span className="material-symbols-outlined text-3xl mb-2 opacity-30">
                          edit_note
                        </span>
                        <p className="text-xs">필터와 일치하는 기록이 없습니다</p>
                      </div>
                    ) : (
                      filteredRecords.map((record) => (
                        <ObservationCard key={record.id} record={record} />
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-sp-muted">
              <span className="material-symbols-outlined text-3xl mb-2 opacity-30">
                edit_note
              </span>
              <p className="text-xs">아직 관찰 기록이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 내보내기 모달 */}
      {showExport && (
        <UnifiedExportModal
          classId={classId}
          defaultTab="observation"
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}
