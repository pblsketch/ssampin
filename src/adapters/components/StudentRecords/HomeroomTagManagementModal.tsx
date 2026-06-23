import { useState, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { DEFAULT_HOMEROOM_RECORD_TAGS } from '@domain/entities/StudentRecord';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface Props {
  onClose: () => void;
}

/**
 * Q2 태그 관리 — 담임 누가기록의 세부 분류(태그) 추가/이름변경/삭제.
 *  - 내장 태그(DEFAULT_HOMEROOM_RECORD_TAGS): 표시만, 삭제 불가.
 *  - 커스텀 태그(Settings.homeroomRecordTags): 추가/이름변경/삭제.
 *  - 이름변경·삭제는 기존 기록의 tags 에도 카스케이드(치환/제거).
 */
export function HomeroomTagManagementModal({ onClose }: Props) {
  const customTags = useSettingsStore((s) => s.settings.homeroomRecordTags) ?? [];
  const updateSettings = useSettingsStore((s) => s.update);
  const records = useStudentRecordsStore((s) => s.records);
  const cascadeTagChange = useStudentRecordsStore((s) => s.cascadeTagChange);
  const showToast = useToastStore((s) => s.show);

  const [newTag, setNewTag] = useState('');
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null);

  const builtinSet = useMemo(() => new Set<string>(DEFAULT_HOMEROOM_RECORD_TAGS), []);
  const tagUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) {
      for (const t of r.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [records]);

  const handleAdd = async () => {
    const v = newTag.trim();
    if (!v) return;
    if (builtinSet.has(v) || customTags.includes(v)) {
      showToast('이미 있는 태그입니다', 'info');
      return;
    }
    await updateSettings({ homeroomRecordTags: [...customTags, v] });
    setNewTag('');
  };

  const handleRename = async () => {
    if (!editing) return;
    const oldTag = editing.tag;
    const v = editing.value.trim();
    setEditing(null);
    if (!v || v === oldTag) return;
    if (builtinSet.has(v) || customTags.includes(v)) {
      showToast('이미 있는 태그입니다', 'info');
      return;
    }
    await updateSettings({
      homeroomRecordTags: customTags.map((t) => (t === oldTag ? v : t)),
    });
    const n = await cascadeTagChange(oldTag, v);
    showToast(
      n > 0 ? `태그 이름을 바꿨습니다 (기록 ${n}건 반영)` : '태그 이름을 바꿨습니다',
      'success',
    );
  };

  const handleDelete = async (tag: string) => {
    const n = tagUsage.get(tag) ?? 0;
    const msg =
      n > 0
        ? `'${tag}' 태그를 삭제하면 기록 ${n}건에서 이 태그가 사라집니다. 계속할까요?`
        : `'${tag}' 태그를 삭제할까요?`;
    if (!window.confirm(msg)) return;
    await updateSettings({ homeroomRecordTags: customTags.filter((t) => t !== tag) });
    if (n > 0) await cascadeTagChange(tag, null);
    showToast(n > 0 ? `태그를 삭제했습니다 (기록 ${n}건 반영)` : '태그를 삭제했습니다', 'success');
  };

  return (
    <Modal isOpen onClose={onClose} title="태그 관리" srOnlyTitle size="md">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">sell</span>
            태그 관리
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 내장 태그 */}
          <div>
            <p className="text-xs font-semibold text-sp-muted mb-2">기본 태그 (삭제 불가)</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_HOMEROOM_RECORD_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-sp-surface text-sp-muted"
                >
                  {tag}
                  {(tagUsage.get(tag) ?? 0) > 0 && (
                    <span className="text-caption text-sp-muted/60">{tagUsage.get(tag)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* 커스텀 태그 */}
          <div>
            <p className="text-xs font-semibold text-sp-muted mb-2">내 태그</p>
            {customTags.length === 0 ? (
              <p className="text-xs text-sp-muted/70">직접 추가한 태그가 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {customTags.map((tag) => {
                  const isEditing = editing?.tag === tag;
                  return isEditing ? (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-sp-surface border border-sp-accent/40"
                    >
                      <input
                        value={editing.value}
                        onChange={(e) =>
                          setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        autoFocus
                        className="w-20 bg-sp-card border border-sp-border rounded px-1.5 py-0.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                      />
                      <button
                        onClick={() => void handleRename()}
                        className="text-xs text-sp-accent hover:text-sp-accent/80"
                      >
                        저장
                      </button>
                    </span>
                  ) : (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-sp-accent/10 text-sp-accent"
                    >
                      {tag}
                      {(tagUsage.get(tag) ?? 0) > 0 && (
                        <span className="text-caption text-sp-accent/60">{tagUsage.get(tag)}</span>
                      )}
                      <button
                        onClick={() => setEditing({ tag, value: tag })}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="이름 변경"
                      >
                        <span className="material-symbols-outlined text-icon-xs">edit</span>
                      </button>
                      <button
                        onClick={() => void handleDelete(tag)}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="삭제"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 새 태그 추가 */}
        <div className="px-6 py-4 border-t border-sp-border">
          <p className="text-xs font-semibold text-sp-muted mb-3">새 태그 추가</p>
          <div className="flex items-center gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd();
              }}
              placeholder="태그 이름..."
              className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <button
              onClick={() => void handleAdd()}
              className="px-4 py-2 bg-sp-accent text-white rounded-lg text-sm font-medium hover:bg-sp-accent/90 transition-colors"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
