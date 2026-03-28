import { useMemo } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { filterByStudent, getAttendanceStats, sortByDateDesc } from '@domain/rules/studentRecordRules';
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
  onClose: () => void;
}

export function StudentRecordReferencePanel({
  student,
  records,
  categories,
  onClose,
}: StudentRecordReferencePanelProps) {
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

  const studentIdx = student.studentNumber ?? 0;

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-[380px] max-w-[90vw] z-40 bg-sp-card border-l border-sp-border shadow-2xl flex flex-col animate-slide-in-right"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
        <div className="flex items-center gap-3">
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
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          title="닫기 (ESC)"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
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
                    <span className="text-[10px] text-sp-muted">{'\uD83D\uDCC5'}</span>
                  </div>
                  <span className="text-xs font-semibold text-sp-muted">
                    {formatDateKR(date)}
                  </span>
                </div>

                <div className="space-y-1.5 ml-2">
                  {dateRecords.map((record) => (
                    <div key={record.id} className="relative">
                      <div
                        className={`absolute -left-[23px] top-3 w-2.5 h-2.5 rounded-full ${getCategoryDotColor(record.category, categories)} z-10`}
                      />
                      <div className="rounded-lg bg-sp-surface/50 p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={getRecordTagClass(record.category, categories)}>
                            {record.subcategory}
                          </span>
                          {record.method && (
                            <span className="text-xs text-sp-muted">
                              {getMethodIcon(record.method)}
                            </span>
                          )}
                          <span className="text-[11px] text-sp-muted ml-auto">
                            {formatTimeKR(record.createdAt)}
                          </span>
                        </div>
                        {record.content && (
                          <p className="text-sm text-sp-muted whitespace-pre-wrap">
                            {record.content}
                          </p>
                        )}
                        {record.followUp && (
                          <div className="mt-1 text-xs text-sp-muted flex items-center gap-1">
                            <span>{record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}</span>
                            <span>{record.followUp}</span>
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

      {/* 하단 안내 */}
      <div className="px-4 py-2.5 border-t border-sp-border shrink-0">
        <p className="text-[11px] text-sp-muted/60 text-center">
          {'\uD83D\uDCCB'} 읽기 전용 — 수정은 조회 탭에서 가능합니다
        </p>
      </div>
    </div>
  );
}
