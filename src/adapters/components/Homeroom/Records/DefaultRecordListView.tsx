import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { InlineRecordEditor } from './InlineRecordEditor';
import {
  type RecordEditProps,
  formatDateKR,
  formatTimeKR,
  getMethodIcon,
  getSmartTagClass,
  METHOD_OPTIONS,
} from './recordUtils';

interface DefaultRecordListViewProps extends RecordEditProps {
  grouped: [string, StudentRecord[]][];
  categories: readonly RecordCategoryItem[];
  studentMap: Map<string, Student>;
  onEdit: (record: StudentRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFollowUp: (id: string) => Promise<void>;
}

function DefaultRecordListView({
  grouped, categories, studentMap,
  onEdit, onDelete, onToggleFollowUp,
  editingId, editContent, setEditContent,
  editCategory, setEditCategory, editSubcategory, setEditSubcategory,
  onEditSave, onEditCancel,
}: DefaultRecordListViewProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      {grouped.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-sp-muted">기록이 없습니다</p>
        </div>
      ) : (
        grouped.map(([date, dateRecords]) => (
          <div key={date}>
            <h4 className="text-xs font-semibold text-sp-muted mb-2">
              {formatDateKR(date)}
            </h4>
            <div className="space-y-1.5">
              {dateRecords.map((record) => {
                const student = studentMap.get(record.studentId);
                const isEditing = editingId === record.id;
                return (
                  <div
                    key={record.id}
                    className={`group flex items-center gap-3 rounded-lg bg-sp-card p-3 hover:bg-sp-card/80 transition-all ${
                      isEditing ? 'ring-1 ring-sp-accent/40' : editingId ? 'opacity-60' : ''
                    }`}
                  >
                    <span
                      className="text-detail font-medium text-sp-muted rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 whitespace-nowrap tabular-nums flex-shrink-0"
                      title="작성 시간"
                    >
                      {formatTimeKR(record.createdAt)}
                    </span>
                    <span className={getSmartTagClass(record, categories)}>
                      {record.subcategory}
                    </span>
                    {record.method && (
                      <span className="text-xs text-sp-muted" title={METHOD_OPTIONS.find((m) => m.value === record.method)?.label}>
                        {getMethodIcon(record.method)}
                      </span>
                    )}
                    {record.followUp && (
                      <button
                        onClick={() => void onToggleFollowUp(record.id)}
                        className="text-xs"
                        title={`${record.followUp}${record.followUpDate ? ` (${formatDateKR(record.followUpDate)})` : ''}`}
                      >
                        {record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}
                      </button>
                    )}
                    <span className="text-sm text-sp-text font-medium min-w-[60px] flex items-center gap-1.5">
                      {student?.studentNumber != null && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-sp-surface border border-sp-border text-detail font-bold text-sp-muted tabular-nums flex-shrink-0">
                          {student.studentNumber}
                        </span>
                      )}
                      {student?.name ?? '?'}
                    </span>
                    {isEditing ? (
                      <InlineRecordEditor
                        record={record}
                        categories={categories}
                        editContent={editContent}
                        setEditContent={setEditContent}
                        editCategory={editCategory}
                        setEditCategory={setEditCategory}
                        editSubcategory={editSubcategory}
                        setEditSubcategory={setEditSubcategory}
                        onSave={() => void onEditSave(record)}
                        onCancel={onEditCancel}
                      />
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-sp-muted">{record.content || ''}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => onEdit(record)}
                            className="p-1 rounded text-sp-muted/50 hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
                            title="수정"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void onDelete(record.id); }}
                            className="p-1 rounded text-sp-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="삭제"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export { DefaultRecordListView };
