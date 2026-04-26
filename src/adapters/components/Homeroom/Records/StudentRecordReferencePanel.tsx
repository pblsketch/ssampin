import { useMemo, useState, useCallback } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { filterByStudent, getAttendanceStats, sortByDateDesc } from '@domain/rules/studentRecordRules';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { StatItem } from './RecordStatCards';
import {
  formatDateKR,
  formatTimeKR,
  getMethodIcon,
  getRecordTagClass,
  getCategoryDotColor,
} from './recordUtils';

interface StudentRecordReferencePanelProps {
  student: Student;
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
}

export function StudentRecordReferencePanel({
  student,
  records,
  categories,
}: StudentRecordReferencePanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const { updateRecord } = useStudentRecordsStore();

  const studentRecords = useMemo(() => {
    const filtered = filterByStudent(records, student.id);
    return sortByDateDesc(filtered);
  }, [records, student.id]);

  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of studentRecords) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    return Array.from(map.entries());
  }, [studentRecords]);

  const stats = useMemo(() => {
    const att = getAttendanceStats(records, student.id);
    const counseling = filterByStudent(records, student.id).filter(
      (r) => r.category === 'counseling',
    ).length;
    return { ...att, counseling, total: studentRecords.length };
  }, [records, student.id, studentRecords.length]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const studentIdx = student.studentNumber ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-4 border-b border-sp-border shrink-0">
        <div className="w-10 h-10 rounded-full bg-sp-accent/20 flex items-center justify-center">
          <span className="text-base font-bold text-sp-accent">
            {student.name.charAt(0)}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-sp-text">{student.name}</h3>
          <p className="text-xs text-sp-muted">
            {studentIdx}번 · 총 {studentRecords.length}건 기록
          </p>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-sp-border shrink-0">
        <StatItem label="결석" value={stats.absent} color="text-red-400" />
        <StatItem label="지각" value={stats.late} color="text-orange-400" />
        <StatItem label="상담" value={stats.counseling} color="text-blue-400" />
        <StatItem label="칭찬" value={stats.praise} color="text-green-400" />
      </div>

      {/* 타임라인 */}
      <div className="flex-1 overflow-y-auto p-4">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
            <span className="material-symbols-outlined text-3xl mb-2">description</span>
            <p className="text-sm">기록이 없습니다</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-sp-border" />

            {grouped.map(([date, dateRecords]) => (
              <div key={date} className="mb-5">
                <div className="flex items-center gap-3 mb-2 -ml-6">
                  <div className="w-[22px] h-[22px] rounded-full bg-sp-surface border-2 border-sp-border flex items-center justify-center z-10">
                    <span className="text-caption text-sp-muted">{'\uD83D\uDCC5'}</span>
                  </div>
                  <span className="text-xs font-semibold text-sp-muted">
                    {formatDateKR(date)}
                  </span>
                </div>

                <div className="space-y-1.5 ml-2">
                  {dateRecords.map((record) => (
                    <div key={record.id} className="relative">
                      <div
                        className={`absolute -left-[26px] top-3 w-2.5 h-2.5 rounded-full ${getCategoryDotColor(record.category, categories)} z-10`}
                      />
                      <div className="rounded-lg bg-sp-surface/50">
                        {/* Clickable header */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(record.id)}
                          aria-expanded={expandedIds.has(record.id)}
                          className="w-full flex items-center gap-2 p-2.5 text-left"
                        >
                          <span className={getRecordTagClass(record.category, categories)}>
                            {record.subcategory}
                          </span>
                          {record.method && (
                            <span className="text-xs text-sp-muted">
                              {getMethodIcon(record.method)}
                            </span>
                          )}
                          <span className="text-detail text-sp-muted ml-auto">
                            {formatTimeKR(record.createdAt)}
                          </span>
                          <span className={`material-symbols-outlined text-sm text-sp-muted transition-transform ${expandedIds.has(record.id) ? 'rotate-180' : ''}`}>
                            expand_more
                          </span>
                        </button>

                        {/* Expandable content */}
                        {expandedIds.has(record.id) && (
                          <div className="px-2.5 pb-2.5 border-t border-sp-border/50">
                            {editingId === record.id ? (
                              // Edit mode
                              <div className="mt-2 space-y-2">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="w-full bg-sp-bg border border-sp-border rounded-lg text-sm text-sp-text px-3 py-2 resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-sp-accent"
                                  rows={3}
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-2.5 py-1 rounded-lg text-xs text-sp-muted hover:text-sp-text"
                                  >취소</button>
                                  <button
                                    onClick={() => {
                                      void updateRecord({ ...record, content: editingContent });
                                      setEditingId(null);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-xs bg-sp-accent text-white hover:bg-sp-accent/80"
                                  >저장</button>
                                </div>
                              </div>
                            ) : (
                              // View mode
                              <div className="mt-2">
                                <p className={`text-sm whitespace-pre-wrap ${record.content ? 'text-sp-muted' : 'text-sp-muted/40 italic'}`}>
                                  {record.content || '메모 없음'}
                                </p>
                                {record.followUp && (
                                  <div className="mt-1.5 text-xs text-sp-muted flex items-center gap-1">
                                    <span>{record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}</span>
                                    <span>{record.followUp}</span>
                                  </div>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(record.id);
                                    setEditingContent(record.content);
                                  }}
                                  className="mt-1.5 flex items-center gap-1 text-xs text-sp-muted hover:text-sp-accent transition-colors"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                  수정
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
