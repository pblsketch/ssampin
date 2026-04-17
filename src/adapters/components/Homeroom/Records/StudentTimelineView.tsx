import { useMemo } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { InlineRecordEditor } from './InlineRecordEditor';
import { StatItem } from './RecordStatCards';
import {
  type RecordEditProps,
  formatDateKR,
  formatTimeKR,
  formatAttendancePeriodLines,
  getMethodIcon,
  getRecordTagClass,
  getCategoryDotColor,
} from './recordUtils';

interface StudentTimelineViewProps extends RecordEditProps {
  student: Student;
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  studentMap: Map<string, Student>;
  stats: { absent: number; late: number; earlyLeave: number; resultAbsent: number; praise: number; counseling: number; total: number } | null;
  onEdit: (record: StudentRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFollowUp: (id: string) => Promise<void>;
  onToggleNeisReport: (id: string) => Promise<void>;
  onToggleDocumentSubmitted: (id: string) => Promise<void>;
}

function StudentTimelineView({
  student, records, categories, stats,
  onEdit, onDelete, onToggleFollowUp, onToggleNeisReport, onToggleDocumentSubmitted,
  editingId, editContent, setEditContent,
  editCategory, setEditCategory, editSubcategory, setEditSubcategory,
  editReportedToNeis, setEditReportedToNeis,
  editDocumentSubmitted, setEditDocumentSubmitted,
  editFollowUp, setEditFollowUp, editFollowUpDate, setEditFollowUpDate,
  editAttendancePeriods, setEditAttendancePeriods, regularPeriodCount,
  onEditSave, onEditCancel,
}: StudentTimelineViewProps) {
  const studentIdx = student.studentNumber ?? 0;

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of records) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    return Array.from(map.entries());
  }, [records]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
      {/* 프로필 카드 */}
      <div className="rounded-xl bg-sp-card p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-sp-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-sp-accent">{student.name.charAt(0)}</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-sp-text">{student.name}</h3>
          <p className="text-xs text-sp-muted">{studentIdx}번 · 총 {records.length}건 기록</p>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-sp-muted">기록이 없습니다</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* 세로선 */}
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-sp-border" />

            {grouped.map(([date, dateRecords]) => (
              <div key={date} className="mb-6">
                {/* 날짜 구분 */}
                <div className="flex items-center gap-3 mb-3 -ml-6">
                  <div className="w-[22px] h-[22px] rounded-full bg-sp-surface border-2 border-sp-border flex items-center justify-center z-10">
                    <span className="text-micro text-sp-muted">{'\uD83D\uDCC5'}</span>
                  </div>
                  <span className="text-xs font-semibold text-sp-muted">{formatDateKR(date)}</span>
                </div>

                <div className="space-y-2 ml-2">
                  {dateRecords.map((record) => {
                    const isEditing = editingId === record.id;
                    const periodLines = record.category === 'attendance'
                      ? formatAttendancePeriodLines(record.attendancePeriods)
                      : [];
                    return (
                      <div key={record.id} className="relative">
                        {/* 도트 */}
                        <div className={`absolute -left-[23px] top-3 w-2.5 h-2.5 rounded-full ${getCategoryDotColor(record.category, categories)} z-10`} />

                        <div className={`group rounded-lg bg-sp-card p-3 hover:bg-sp-card/80 transition-all ${
                          isEditing ? 'ring-1 ring-sp-accent/40' : editingId ? 'opacity-60' : ''
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={getRecordTagClass(record.category, categories)}>
                              {record.subcategory}
                            </span>
                            {periodLines.length > 0 && (
                              <span
                                className="text-detail font-medium text-sp-muted rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 whitespace-nowrap tabular-nums"
                                title={periodLines.join(' · ')}
                              >
                                {periodLines.join(' · ')}
                              </span>
                            )}
                            {record.method && (
                              <span className="text-xs text-sp-muted">
                                {getMethodIcon(record.method)}
                              </span>
                            )}
                            {record.followUp && (
                              <span className="text-xs" title={record.followUp}>
                                {record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}
                              </span>
                            )}
                            {record.category === 'attendance' && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); void onToggleNeisReport(record.id); }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                                    record.reportedToNeis
                                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                      : 'bg-red-500/10 text-red-400/70 hover:bg-red-500/20'
                                  }`}
                                  title={record.reportedToNeis ? '나이스 반영 완료 (클릭하여 취소)' : '나이스 미반영 (클릭하여 반영 처리)'}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                    {record.reportedToNeis ? 'check_circle' : 'pending'}
                                  </span>
                                  {record.reportedToNeis ? '나이스' : '미반영'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); void onToggleDocumentSubmitted(record.id); }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                                    record.documentSubmitted
                                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                      : 'bg-orange-500/10 text-orange-400/70 hover:bg-orange-500/20'
                                  }`}
                                  title={record.documentSubmitted ? '서류 제출 완료 (클릭하여 취소)' : '서류 미제출 (클릭하여 제출 처리)'}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                    {record.documentSubmitted ? 'description' : 'draft'}
                                  </span>
                                  {record.documentSubmitted ? '서류' : '미제출'}
                                </button>
                              </>
                            )}
                            <span className="text-detail text-sp-muted ml-auto">
                              {formatTimeKR(record.createdAt)}
                            </span>
                          </div>

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
                              editReportedToNeis={editReportedToNeis}
                              setEditReportedToNeis={setEditReportedToNeis}
                              editDocumentSubmitted={editDocumentSubmitted}
                              setEditDocumentSubmitted={setEditDocumentSubmitted}
                              editFollowUp={editFollowUp}
                              setEditFollowUp={setEditFollowUp}
                              editFollowUpDate={editFollowUpDate}
                              setEditFollowUpDate={setEditFollowUpDate}
                              attendancePeriods={
                                record.category === 'attendance' ? editAttendancePeriods : undefined
                              }
                              setAttendancePeriods={
                                record.category === 'attendance' ? setEditAttendancePeriods : undefined
                              }
                              regularPeriodCount={regularPeriodCount}
                              onSave={() => void onEditSave(record)}
                              onCancel={onEditCancel}
                            />
                          ) : (
                            <>
                              {record.content && (
                                <p className="text-sm text-sp-muted">{record.content}</p>
                              )}
                              {record.followUp && (
                                <div className="mt-1 flex items-center gap-2 text-xs">
                                  <span className="text-sp-muted">{'\uD83D\uDCCC'} {record.followUp}</span>
                                  {record.followUpDate && (
                                    <span className="text-sp-muted">({formatDateKR(record.followUpDate)})</span>
                                  )}
                                  <button
                                    onClick={() => void onToggleFollowUp(record.id)}
                                    className={`px-1.5 py-0.5 rounded text-caption ${
                                      record.followUpDone
                                        ? 'bg-green-500/15 text-green-400'
                                        : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
                                    }`}
                                  >
                                    {record.followUpDone ? '완료됨' : '완료'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  onClick={() => onEdit(record)}
                                  className="p-0.5 rounded text-sp-muted/50 hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
                                  title="수정"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                                <button
                                  onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void onDelete(record.id); }}
                                  className="p-0.5 rounded text-sp-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="삭제"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 통계 요약 */}
      {stats && (
        <div className="rounded-xl bg-sp-card p-4 flex items-center gap-6">
          <span className="text-sm font-bold text-sp-text">{student.name} 현황</span>
          <div className="flex gap-4">
            <StatItem label="결석" value={stats.absent} color="text-red-400" />
            <StatItem label="지각" value={stats.late} color="text-orange-400" />
            <StatItem label="상담" value={stats.counseling} color="text-blue-400" />
            <StatItem label="칭찬" value={stats.praise} color="text-green-400" />
          </div>
        </div>
      )}
    </div>
  );
}

export { StudentTimelineView };
