import { useState, useMemo, useCallback } from 'react';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { exportObservationsToExcel } from '@infrastructure/export';
import type { ObservationExportRecord } from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

type PeriodPreset = 'all' | 'semester' | 'month' | 'custom';

function getSemesterRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const semesterStart = m >= 8 ? new Date(y, 8, 1) : new Date(y, 2, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(semesterStart), end: fmt(now) };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(now) };
}

interface ObservationExportModalProps {
  classId: string;
  onClose: () => void;
}

export function ObservationExportModal({ classId, onClose }: ObservationExportModalProps) {
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const allRecords = useObservationStore((s) => s.records);
  const classes = useTeachingClassStore((s) => s.classes);
  const cls = classes.find((c) => c.id === classId);
  const className = cls?.name ?? '';

  const period = useMemo<{ start: string; end: string } | undefined>(() => {
    if (periodPreset === 'all') return undefined;
    if (periodPreset === 'semester') return getSemesterRange();
    if (periodPreset === 'month') return getMonthRange();
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return undefined;
  }, [periodPreset, customStart, customEnd]);

  const classRecords = useMemo(() => {
    return allRecords.filter((r) => r.classId === classId);
  }, [allRecords, classId]);

  const filteredCount = useMemo(() => {
    if (!period) return classRecords.length;
    return classRecords.filter((r) => r.date >= period.start && r.date <= period.end).length;
  }, [classRecords, period]);

  // 학생 수 (기록이 있는)
  const studentCount = useMemo(() => {
    const filtered = period
      ? classRecords.filter((r) => r.date >= period.start && r.date <= period.end)
      : classRecords;
    return new Set(filtered.map((r) => r.studentId)).size;
  }, [classRecords, period]);

  const handleExport = useCallback(async () => {
    if (filteredCount === 0) {
      showToast('내보낼 관찰 기록이 없습니다', 'info');
      return;
    }
    setIsExporting(true);
    try {
      const students = cls?.students ?? [];
      const studentMap = new Map(students.map((s) => [studentKey(s), s]));

      const exportRecords: ObservationExportRecord[] = classRecords.map((r) => {
        const student = studentMap.get(r.studentId);
        return {
          studentNumber: student?.number ?? 0,
          studentName: student?.name ?? '알 수 없음',
          date: r.date,
          tags: r.tags,
          content: r.content,
        };
      });

      const buffer = await exportObservationsToExcel(exportRecords, className, period);
      const defaultFileName = `${className}_관찰기록.xlsx`;

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '관찰 기록 내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, buffer);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
          onClose();
        }
      } else {
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast('파일이 다운로드되었습니다', 'success');
        onClose();
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [classRecords, cls, className, period, filteredCount, showToast, onClose]);

  return (
    <Modal isOpen onClose={onClose} title="관찰 기록 내보내기" srOnlyTitle size="md">
      <div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            <h3 className="text-sp-text font-semibold">관찰 기록 내보내기</h3>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 기간 선택 */}
          <div>
            <label className="text-sm text-sp-muted mb-2 block">기간</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'all' as const, label: '전체' },
                { id: 'semester' as const, label: '이번 학기' },
                { id: 'month' as const, label: '이번 달' },
                { id: 'custom' as const, label: '직접 입력' },
              ]).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    periodPreset === p.id
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === 'custom' && (
              <div className="flex gap-2 mt-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
                <span className="text-sp-muted text-sm self-center">~</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
              </div>
            )}
          </div>

          {/* 요약 */}
          <div className="bg-sp-surface border border-sp-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-sp-muted">관찰 기록</span>
              <span className="text-sp-text font-medium">{filteredCount}건</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-sp-muted">기록된 학생</span>
              <span className="text-sp-text font-medium">{studentCount}명</span>
            </div>
          </div>

          {/* 포함 내용 안내 */}
          <div className="text-[11px] text-sp-muted space-y-0.5">
            <p>엑셀 파일에 포함되는 내용:</p>
            <p>· <strong className="text-sp-text">관찰기록</strong> 시트 — 날짜순 전체 기록</p>
            <p>· <strong className="text-sp-text">학생별 요약</strong> 시트 — 기록 수, 최근일, 태그 분포</p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="px-6 py-4 border-t border-sp-border flex gap-2">
          <button
            onClick={() => void handleExport()}
            disabled={filteredCount === 0 || isExporting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sp-accent text-white rounded-xl text-sm font-medium hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            {isExporting ? '내보내는 중...' : '엑셀로 내보내기'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-sp-surface border border-sp-border text-sp-muted rounded-xl text-sm hover:text-sp-text transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
