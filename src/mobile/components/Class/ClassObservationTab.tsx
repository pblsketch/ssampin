import { useEffect, useMemo, useState } from 'react';
import { useMobileObservationStore } from '@mobile/stores/useMobileObservationStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { ActionSheet } from '@mobile/components/common/ActionSheet';
import { ConfirmDialog } from '@mobile/components/common/ConfirmDialog';
import { Spinner } from '@mobile/components/common/Spinner';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { ObservationRecordCard } from '@mobile/components/Class/ObservationRecordCard';
import { ObservationSheet } from '@mobile/components/Class/ObservationSheet';
import { formatDateLabel } from '@mobile/utils/date';
import { isStudentActive } from '@domain/rules/studentActivity';
import { studentKey } from '@domain/entities/TeachingClass';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import type { ObservationRecord } from '@domain/entities/Observation';

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
    return <Spinner />;
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
          <EmptyState
            icon="sticky_note_2"
            text="아직 특기사항 기록이 없습니다."
            actionLabel="첫 기록 추가"
            onAction={() => setModalState({ type: 'add' })}
          />
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
        <ConfirmDialog
          title="기록 삭제"
          message={<>{formatDateLabel(modalState.record.date)}의 기록을 삭제하시겠어요?</>}
          onConfirm={() => void handleConfirmDelete(modalState.record)}
          onCancel={() => setModalState({ type: 'closed' })}
        />
      )}
    </div>
  );
}
