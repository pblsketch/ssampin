import { useState } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { todayISO } from '@mobile/utils/date';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

interface ObservationSheetProps {
  mode: 'add' | 'edit';
  tags: readonly string[];
  initialRecord?: ObservationRecord;
  onSave: (date: string, content: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}

export function ObservationSheet({
  mode,
  tags,
  initialRecord,
  onSave,
  onClose,
}: ObservationSheetProps) {
  useBottomSheet(true, onClose);

  const [date, setDate] = useState(initialRecord?.date ?? todayISO());
  const [content, setContent] = useState(initialRecord?.content ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialRecord ? [...initialRecord.tags] : [],
  );
  const [saving, setSaving] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    const trimmed = content.trim().slice(0, 500);
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(date, trimmed, selectedTags);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="px-2 pt-2 flex justify-center">
          <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
        </div>

        <div className="px-5 pt-3 pb-4 space-y-4">
          <h3 className="text-sp-text font-bold text-base">
            {mode === 'add' ? '특기사항 기록 추가' : '특기사항 기록 편집'}
          </h3>

          {/* 날짜 */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2 text-sp-text text-sm"
              style={{ minHeight: 44 }}
            />
          </div>

          {/* 태그 */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">태그 (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isDefaultTag = (DEFAULT_OBSERVATION_TAGS as readonly string[]).includes(tag);
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      isSelected
                        ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                        : isDefaultTag
                          ? 'bg-sp-surface text-sp-text border-sp-border'
                          : 'bg-sp-surface text-sp-muted border-sp-border'
                    }`}
                    style={{ minHeight: 36 }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">
              내용 <span className="tabular-nums">({content.length}/500자)</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              placeholder="학생 관찰 내용을 입력하세요."
              rows={4}
              className="glass-input w-full rounded-xl px-3 py-2 text-sp-text text-sm resize-none"
            />
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !content.trim()}
            className="w-full py-3 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
            style={{ minHeight: 44 }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
