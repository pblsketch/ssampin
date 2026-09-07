import { useMemo, useState, useCallback } from 'react';
import type { ObservationRecord } from '@domain/entities/Observation';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { allSlotsForContext } from '@domain/rules/observationSlots';
import { resolveRecordTopic } from '@domain/services/recordTopicLabel';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { ObservationAttachmentList } from './ObservationAttachmentList';

interface ObservationCardProps {
  record: ObservationRecord;
  /** 이 기록의 주인. 주제 소속을 근거에서 찾을 때 학생을 한 번 더 거르는 데 쓴다. */
  studentRef?: string;
}

export function ObservationCard({ record, studentRef }: ObservationCardProps) {
  const [editing, setEditing] = useState(false);
  // 관찰 슬롯 — 저장한 장면을 **보고 고칠 수 있어야** 한다. 되돌릴 길이 없으면 탭을 망설이게 된다.
  const customSlots = useObservationStore((s) => s.customSlots);
  const allSlots = useMemo(() => allSlotsForContext('teaching', customSlots), [customSlots]);
  const [editSlots, setEditSlots] = useState<string[]>([...(record.slots ?? [])]);
  const [editContent, setEditContent] = useState(record.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateRecord = useObservationStore((s) => s.updateRecord);
  const deleteRecord = useObservationStore((s) => s.deleteRecord);

  // 주제 소속은 **저장된 근거**에서 찾는다. 원본에 남은 옛 threadId 를 믿지 않는다(계획 §4.3).
  const evidenceRecords = useRecordEvidenceStore((s) => s.records);
  const threads = useInquiryThreadStore((s) => s.records);
  const topic = useMemo(
    () =>
      studentRef === undefined
        ? null
        : resolveRecordTopic(record.id, studentRef, evidenceRecords, threads),
    [record.id, studentRef, evidenceRecords, threads],
  );

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    // 슬롯을 모두 해제하면 칸 자체를 지운다 — 빈 배열로 남기지 않는다(부재 != 빈 배열).
    const { slots: _prev, ...rest } = record;
    await updateRecord({
      ...rest,
      content: trimmed.slice(0, 500),
      ...(editSlots.length > 0 ? { slots: editSlots } : {}),
    });
    setEditing(false);
  }, [editContent, editSlots, record, updateRecord]);

  const handleDelete = useCallback(async () => {
    // deleteRecord 가 연결된 첨부까지 함께 정리한다(store cascade)
    await deleteRecord(record.id);
    setShowDeleteConfirm(false);
  }, [record.id, deleteRecord]);

  const dateDisplay = record.date.replace(/^\d{4}-/, '').replace('-', '/');

  return (
    <div className="bg-sp-surface border border-sp-border rounded-xl p-3 group">
      {/* 헤더: 날짜 + 태그 + 액션 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-sp-muted font-medium">{dateDisplay}</span>
        <div className="flex gap-1 flex-1 min-w-0 overflow-hidden">
          {record.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-sp-accent/10 text-sp-accent shrink-0"
            >
              {tag}
            </span>
          ))}
          {/* 주제 소속 — 저장된 근거 기준. 고아 주제는 "없다"가 아니라 "확인 중"이다. */}
          {topic !== null && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium text-sp-accent ring-1 ring-blue-500/30"
              title={
                topic.kind === 'unknown-thread'
                  ? '연결된 주제를 찾지 못했습니다. 다른 기기의 변경이 아직 안 왔을 수 있습니다.'
                  : '이 기록이 묶인 주제'
              }
            >
              {topic.kind === 'thread'
                ? topic.title
                : topic.kind === 'unknown-thread'
                  ? '주제 확인 중'
                  : '주제 미지정'}
            </span>
          )}
          {/* 슬롯은 태그와 다른 축이라 테두리형으로 구분한다(색 하나 더 쓰지 않는다). */}
          {(record.slots ?? []).map((slot) => (
            <span
              key={slot}
              className="px-1.5 py-0.5 rounded-full text-xs font-medium text-sp-muted ring-1 ring-sp-border shrink-0"
              title="관찰 장면"
            >
              {slot}
            </span>
          ))}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
          {/* 오탭한 장면을 여기서 되돌린다 — 전부 해제하면 칸이 지워진다. */}
          <div className="flex flex-wrap gap-1">
            {allSlots.map((slot) => {
              const on = editSlots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setEditSlots((prev) =>
                      prev.includes(slot) ? prev.filter((v) => v !== slot) : [...prev, slot],
                    )
                  }
                  className={`px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    on ? 'bg-sp-accent text-white' : 'bg-sp-bg text-sp-muted ring-1 ring-sp-border'
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => void handleSaveEdit()}
              disabled={!editContent.trim()}
              className="px-3 py-1 text-xs bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 disabled:opacity-40"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-xs text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-sp-text leading-relaxed whitespace-pre-wrap">{record.content}</p>
      )}

      {/* 첨부 자료 */}
      <ObservationAttachmentList observationId={record.id} />

      {/* 삭제 확인 */}
      {showDeleteConfirm && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400 mb-2">이 기록을 삭제하시겠습니까?</p>
          <div className="flex gap-1">
            <button
              onClick={() => void handleDelete()}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              삭제
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 text-xs text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
