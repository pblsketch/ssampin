import type { TeacherScheduleData } from '@domain/entities/Timetable';

interface TeacherExcelPreviewModalProps {
  schedule: TeacherScheduleData;
  maxPeriods: number;
  activeDays: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function TeacherExcelPreviewModal({
  schedule,
  maxPeriods,
  activeDays,
  onConfirm,
  onCancel,
}: TeacherExcelPreviewModalProps) {
  const days = activeDays.filter((d) => schedule[d] && schedule[d]!.length > 0);
  // 데이터에만 있고 activeDays에 없는 요일도 포함
  const extraDays = Object.keys(schedule).filter(
    (d) => !activeDays.includes(d) && ['월', '화', '수', '목', '금', '토'].includes(d),
  );
  const allDays = [...days, ...extraDays];

  const maxRows = Math.max(
    maxPeriods,
    ...allDays.map((d) => schedule[d]?.length ?? 0),
  );

  const totalPeriods = allDays.reduce(
    (sum, d) => sum + (schedule[d]?.filter((p) => p !== null).length ?? 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-sp-bg rounded-2xl border border-sp-border p-6 w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-sp-text">시간표 미리보기</h3>
            <p className="text-sm text-sp-muted mt-0.5">
              {allDays.length}일 · {totalPeriods}개 수업이 감지되었습니다
            </p>
          </div>
          {extraDays.length > 0 && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg">
              +{extraDays.join(', ')} 데이터 포함
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto rounded-xl border border-sp-border">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-sp-surface">
                <th className="p-2.5 border-b border-r border-sp-border text-sp-text font-bold text-center w-16">
                  교시
                </th>
                {allDays.map((d) => (
                  <th key={d} className="p-2.5 border-b border-r border-sp-border text-sp-text font-bold text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, i) => (
                <tr key={i} className="hover:bg-sp-card/30 transition-colors">
                  <td className="p-2 border-b border-r border-sp-border text-center font-medium text-sp-muted bg-sp-card/50">
                    {i + 1}
                  </td>
                  {allDays.map((d) => {
                    const period = schedule[d]?.[i] ?? null;
                    return (
                      <td key={d} className="p-2 border-b border-r border-sp-border text-center">
                        {period ? (
                          <div>
                            <div className="font-bold text-sp-text">{period.subject}</div>
                            <div className="text-xs text-sp-muted">{period.classroom}</div>
                          </div>
                        ) : (
                          <span className="text-sp-muted/30 text-xs">공강</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-sp-border">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-sp-border bg-sp-card text-sm font-bold text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-sp-accent text-sm font-bold text-white shadow-md shadow-sp-accent/20 hover:bg-blue-600 transition-all active:scale-95"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
