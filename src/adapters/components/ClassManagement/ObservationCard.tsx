import { useState, useCallback } from 'react';
import type { ObservationRecord } from '@domain/entities/Observation';
import { useObservationStore } from '@adapters/stores/useObservationStore';

interface ObservationCardProps {
  record: ObservationRecord;
}

export function ObservationCard({ record }: ObservationCardProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(record.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateRecord = useObservationStore((s) => s.updateRecord);
  const deleteRecord = useObservationStore((s) => s.deleteRecord);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    await updateRecord({ ...record, content: trimmed.slice(0, 500) });
    setEditing(false);
  }, [editContent, record, updateRecord]);

  const handleDelete = useCallback(async () => {
    await deleteRecord(record.id);
    setShowDeleteConfirm(false);
  }, [record.id, deleteRecord]);

  const dateDisplay = record.date.replace(/^\d{4}-/, '').replace('-', '/');

  return (
    <div className="bg-sp-surface border border-sp-border rounded-xl p-3 group">
      {/* 헤더: 날짜 + 태그 + 액션 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-caption text-sp-muted font-medium">{dateDisplay}</span>
        <div className="flex gap-1 flex-1 min-w-0 overflow-hidden">
          {record.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sp-accent/10 text-sp-accent shrink-0"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setEditContent(record.content);
              setEditing(!editing);
            }}
            className="p-0.5 text-sp-muted hover:text-sp-text"
            title="수정"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-0.5 text-sp-muted hover:text-red-400"
            title="삭제"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* 내용 */}
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            className="w-full bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text resize-none focus:outline-none focus:border-sp-accent"
          />
          <div className="flex gap-1">
            <button
              onClick={() => void handleSaveEdit()}
              disabled={!editContent.trim()}
              className="px-3 py-1 text-caption bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 disabled:opacity-40"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-caption text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-sp-text leading-relaxed whitespace-pre-wrap">
          {record.content}
        </p>
      )}

      {/* 삭제 확인 */}
      {showDeleteConfirm && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-caption text-red-400 mb-2">이 기록을 삭제하시겠습니까?</p>
          <div className="flex gap-1">
            <button
              onClick={() => void handleDelete()}
              className="px-3 py-1 text-caption bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              삭제
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 text-caption text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
