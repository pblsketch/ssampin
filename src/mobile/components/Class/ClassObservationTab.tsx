import { useEffect, useMemo, useState } from 'react';
import { useMobileObservationStore } from '@mobile/stores/useMobileObservationStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { isStudentActive } from '@domain/rules/studentActivity';
import { studentKey } from '@domain/entities/TeachingClass';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

interface ClassObservationTabProps {
  classId: string;
  className: string;
}

type ModalState =
  | { type: 'closed' }
  | { type: 'add' }
  | { type: 'edit'; record: ObservationRecord }
  | { type: 'actionSheet'; record: ObservationRecord }
  | { type: 'confirmDelete'; record: ObservationRecord };

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 학급 상세 화면의 특기사항 서브탭.
 * 학생 선택(가로 스크롤 칩) → 해당 학생 기록 목록 → 작성/편집 BottomSheet → 액션시트 → 삭제 확인.
 */
export function ClassObservationTab({ classId, className }: ClassObservationTabProps) {
  const records = useMobileObservationStore((s) => s.records);
  const loaded = useMobileObservationStore((s) => s.loaded);
  const load = useMobileObservationStore((s) => s.load);
  const addRecord = useMobileObservationStore((s) => s.addRecord);
  const updateRecord = useMobileObservationStore((s) => s.updateRecord);
  const deleteRecord = useMobileObservationStore((s) => s.deleteRecord);
  const allTags = useMobileObservationStore((s) => s.allTags);

  const getClass = useMobileTeachingClassStore((s) => s.getClass);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);

  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ type: 'closed' });

  useEffect(() => {
    void load();
    void loadClasses();
  }, [load, loadClasses]);

  // 활성 학생 목록
  const activeStudents = useMemo<TeachingClassStudent[]>(() => {
    const cls = getClass(classId);
    if (!cls) return [];
    return cls.students.filter(isStudentActive);
  }, [getClass, classId]);

  // 첫 학생 자동 선택
  useEffect(() => {
    if (activeStudents.length > 0 && selectedStudentKey === null) {
      setSelectedStudentKey(studentKey(activeStudents[0]!));
    }
  }, [activeStudents, selectedStudentKey]);

  // 선택 학생 기록 (최신순)
  const studentRecords = useMemo<readonly ObservationRecord[]>(() => {
    if (!selectedStudentKey) return [];
    return records
      .filter((r) => r.studentId === selectedStudentKey && r.classId === classId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, selectedStudentKey, classId]);

  const tags = allTags();

  const handleConfirmDelete = async (record: ObservationRecord) => {
    await deleteRecord(record.id);
    setModalState({ type: 'closed' });
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="material-symbols-outlined text-sp-muted text-3xl animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 학생 선택 — 가로 스크롤 칩 */}
      <div className="px-4 py-3 border-b border-sp-border shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {activeStudents.length === 0 ? (
            <span className="text-sp-muted text-sm">등록된 학생이 없습니다.</span>
          ) : (
            activeStudents.map((s) => {
              const key = studentKey(s);
              const isSelected = key === selectedStudentKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedStudentKey(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-sp-accent text-sp-accent-fg'
                      : 'bg-sp-surface text-sp-muted border border-sp-border'
                  }`}
                  style={{ minHeight: 36 }}
                >
                  {s.number}번 {s.name}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 기록 목록 + 추가 버튼 */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-sp-muted text-xs">
          {selectedStudentKey ? `${studentRecords.length}건의 기록` : '학생을 선택해 주세요'}
        </span>
        {selectedStudentKey && (
          <button
            onClick={() => setModalState({ type: 'add' })}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent shrink-0 active:scale-95 transition-transform"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label={`${className} 특기사항 기록 추가`}
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        )}
      </div>

      {/* 기록 카드 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!selectedStudentKey ? null : studentRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="material-symbols-outlined text-sp-muted text-4xl">sticky_note_2</span>
            <p className="text-sp-muted text-sm">아직 특기사항 기록이 없습니다.</p>
            <button
              onClick={() => setModalState({ type: 'add' })}
              className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform"
            >
              첫 기록 추가
            </button>
          </div>
        ) : (
          <ul className="space-y-3 pt-1">
            {studentRecords.map((record) => (
              <li key={record.id}>
                <ObservationRecordCard
                  record={record}
                  onAction={() => setModalState({ type: 'actionSheet', record })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 작성 BottomSheet */}
      {modalState.type === 'add' && selectedStudentKey && (
        <ObservationSheet
          mode="add"
          tags={tags}
          onSave={async (date, content, selectedTagList) => {
            await addRecord({
              studentId: selectedStudentKey,
              classId,
              date,
              content,
              tags: selectedTagList,
            });
            setModalState({ type: 'closed' });
          }}
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 편집 BottomSheet */}
      {modalState.type === 'edit' && (
        <ObservationSheet
          mode="edit"
          initialRecord={modalState.record}
          tags={tags}
          onSave={async (date, content, selectedTagList) => {
            await updateRecord({
              ...modalState.record,
              date,
              content,
              tags: selectedTagList,
            });
            setModalState({ type: 'closed' });
          }}
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 액션시트 */}
      {modalState.type === 'actionSheet' && (
        <ActionSheet
          onEdit={() => setModalState({ type: 'edit', record: modalState.record })}
          onDelete={() => setModalState({ type: 'confirmDelete', record: modalState.record })}
          onClose={() => setModalState({ type: 'closed' })}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {modalState.type === 'confirmDelete' && (
        <ConfirmDeleteDialog
          record={modalState.record}
          onConfirm={() => void handleConfirmDelete(modalState.record)}
          onCancel={() => setModalState({ type: 'closed' })}
        />
      )}
    </div>
  );
}

/* ──────────────────────── 보조 컴포넌트 ──────────────────────── */

interface ObservationRecordCardProps {
  record: ObservationRecord;
  onAction: () => void;
}

function ObservationRecordCard({ record, onAction }: ObservationRecordCardProps) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sp-muted text-xs mb-1">{formatDateLabel(record.date)}</p>
          <p className="text-sp-text text-sm leading-relaxed whitespace-pre-wrap break-words">
            {record.content}
          </p>
          {record.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {record.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-sp-surface border border-sp-border text-sp-muted text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onAction}
          className="flex items-center justify-center shrink-0 text-sp-muted active:text-sp-text"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="기록 메뉴"
        >
          <span className="material-symbols-outlined text-xl">more_vert</span>
        </button>
      </div>
    </div>
  );
}

interface ObservationSheetProps {
  mode: 'add' | 'edit';
  tags: readonly string[];
  initialRecord?: ObservationRecord;
  onSave: (date: string, content: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}

function ObservationSheet({ mode, tags, initialRecord, onSave, onClose }: ObservationSheetProps) {
  useBottomSheet();

  const [date, setDate] = useState(initialRecord?.date ?? todayString());
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

interface ActionSheetProps {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ActionSheet({ onEdit, onDelete, onClose }: ActionSheetProps) {
  useBottomSheet();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pt-2 flex justify-center">
          <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
        </div>
        <button
          onClick={onEdit}
          className="w-full flex items-center gap-3 px-5 py-4 text-left text-sp-text active:bg-sp-surface"
          style={{ minHeight: 52 }}
        >
          <span className="material-symbols-outlined text-sp-accent">edit</span>
          <span className="text-sm font-medium">편집</span>
        </button>
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-3 px-5 py-4 text-left text-red-400 active:bg-sp-surface"
          style={{ minHeight: 52 }}
        >
          <span className="material-symbols-outlined">delete</span>
          <span className="text-sm font-medium">삭제</span>
        </button>
        <div className="border-t border-sp-border">
          <button
            onClick={onClose}
            className="w-full px-5 py-4 text-sp-muted text-sm font-medium"
            style={{ minHeight: 52 }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDeleteDialogProps {
  record: ObservationRecord;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDeleteDialog({ record, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  useBottomSheet();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-sp-card border border-sp-border rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sp-text font-bold text-base mb-2">기록 삭제</h3>
        <p className="text-sp-muted text-sm mb-5">
          {formatDateLabel(record.date)}의 기록을 삭제하시겠어요?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg"
            style={{ minHeight: 44 }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-sp-error hover:opacity-90 rounded-lg font-medium"
            style={{ minHeight: 44 }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
