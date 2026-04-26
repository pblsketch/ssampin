import { useState, useMemo, useCallback } from 'react';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { exportAttendanceToExcel, exportObservationsToExcel } from '@infrastructure/export';
import type { ObservationExportRecord } from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

type ExportType = 'attendance' | 'observation';
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

interface UnifiedExportModalProps {
  classId: string;
  defaultTab?: ExportType;
  onClose: () => void;
}

export function UnifiedExportModal({ classId, defaultTab = 'attendance', onClose }: UnifiedExportModalProps) {
  const [exportType, setExportType] = useState<ExportType>(defaultTab);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([...DEFAULT_OBSERVATION_TAGS]);
  const showToast = useToastStore((s) => s.show);

  const classes = useTeachingClassStore((s) => s.classes);
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  const observationRecords = useObservationStore((s) => s.records);

  const cls = classes.find((c) => c.id === classId);
  const className = cls?.name ?? '';
  const students = cls?.students ?? [];

  const period = useMemo<{ start: string; end: string } | undefined>(() => {
    if (periodPreset === 'all') return undefined;
    if (periodPreset === 'semester') return getSemesterRange();
    if (periodPreset === 'month') return getMonthRange();
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return undefined;
  }, [periodPreset, customStart, customEnd]);

  // 출결 통계
  const attendanceStats = useMemo(() => {
    const classRecords = attendanceRecords.filter((r) => r.classId === classId);
    const filtered = period
      ? classRecords.filter((r) => r.date >= period.start && r.date <= period.end)
      : classRecords;
    return { total: filtered.length };
  }, [attendanceRecords, classId, period]);

  // 관찰 통계
  const observationStats = useMemo(() => {
    const classRecords = observationRecords.filter((r) => r.classId === classId);
    const filtered = period
      ? classRecords.filter((r) => r.date >= period.start && r.date <= period.end)
      : classRecords;
    const studentCount = new Set(filtered.map((r) => r.studentId)).size;
    return { total: filtered.length, students: studentCount };
  }, [observationRecords, classId, period]);

  const saveFile = useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    if (window.electronAPI) {
      const filePath = await window.electronAPI.showSaveDialog({
        title: '기록 내보내기',
        defaultPath: fileName,
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

      // File System Access API (저장 다이얼로그)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Excel 파일',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast('파일이 저장되었습니다', 'success');
          onClose();
          return;
        } catch (err) {
          // 사용자가 취소한 경우만 return, 그 외 에러는 fallback으로
          if (err instanceof DOMException && err.name === 'AbortError') return;
          // fall through to blob download
        }
      }

      // Fallback: Blob URL 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      showToast('파일이 다운로드되었습니다', 'success');
      onClose();
    }
  }, [showToast, onClose]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      if (exportType === 'attendance') {
        if (attendanceStats.total === 0) {
          showToast('내보낼 출결 기록이 없습니다', 'info');
          return;
        }
        const classRecords = attendanceRecords.filter((r) => r.classId === classId);
        const buffer = await exportAttendanceToExcel(classRecords, students, className, period);
        await saveFile(buffer, `${className}_출결기록.xlsx`);
      } else {
        if (observationStats.total === 0) {
          showToast('내보낼 관찰 기록이 없습니다', 'info');
          return;
        }
        const classRecords = observationRecords.filter((r) => r.classId === classId);
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
        const buffer = await exportObservationsToExcel(exportRecords, className, period, selectedTags.length === DEFAULT_OBSERVATION_TAGS.length ? undefined : selectedTags);
        await saveFile(buffer, `${className}_관찰기록.xlsx`);
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [exportType, attendanceRecords, observationRecords, classId, students, className, period, attendanceStats.total, observationStats.total, showToast, saveFile, selectedTags]);

  const currentCount = exportType === 'attendance' ? attendanceStats.total : observationStats.total;

  return (
    <Modal isOpen onClose={onClose} title="기록 내보내기" srOnlyTitle size="md">
      <div>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            <h3 className="text-sp-text font-semibold">기록 내보내기</h3>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 내보내기 유형 선택 */}
          <div>
            <label className="text-sm text-sp-muted mb-2 block">내보내기 항목</label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportType('attendance')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  exportType === 'attendance'
                    ? 'bg-sp-accent/10 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-lg">how_to_reg</span>
                출결 기록
              </button>
              <button
                onClick={() => setExportType('observation')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  exportType === 'observation'
                    ? 'bg-sp-accent/10 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-lg">edit_note</span>
                특기사항
              </button>
            </div>
          </div>

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

          {/* 특기사항 태그 필터 */}
          {exportType === 'observation' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-sp-muted">태그 필터</label>
                <button
                  onClick={() => setSelectedTags(
                    selectedTags.length === DEFAULT_OBSERVATION_TAGS.length
                      ? []
                      : [...DEFAULT_OBSERVATION_TAGS]
                  )}
                  className="text-xs text-sp-accent hover:underline"
                >
                  {selectedTags.length === DEFAULT_OBSERVATION_TAGS.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...DEFAULT_OBSERVATION_TAGS].map((tag) => (
                  <label key={tag} className="flex items-center gap-1.5 text-xs text-sp-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTags((prev) => [...prev, tag]);
                        } else {
                          setSelectedTags((prev) => prev.filter((t) => t !== tag));
                        }
                      }}
                      className="rounded border-sp-border accent-sp-accent"
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 요약 */}
          <div className="bg-sp-surface border border-sp-border rounded-xl px-4 py-3">
            {exportType === 'attendance' ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-sp-muted">출결 기록</span>
                <span className="text-sp-text font-medium">{attendanceStats.total}건</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-sp-muted">관찰 기록</span>
                  <span className="text-sp-text font-medium">{observationStats.total}건</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-sp-muted">기록된 학생</span>
                  <span className="text-sp-text font-medium">{observationStats.students}명</span>
                </div>
              </>
            )}
          </div>

          {/* 포함 내용 안내 */}
          <div className="text-detail text-sp-muted space-y-0.5">
            <p>엑셀 파일에 포함되는 내용:</p>
            {exportType === 'attendance' ? (
              <>
                <p>· <strong className="text-sp-text">출결 현황</strong> 시트 — 날짜별 출결 상태</p>
                <p>· <strong className="text-sp-text">출결 통계</strong> 시트 — 학생별 출석/결석/지각 합계</p>
              </>
            ) : (
              <>
                <p>· <strong className="text-sp-text">관찰기록</strong> 시트 — 날짜순 전체 기록</p>
                <p>· <strong className="text-sp-text">학생별 요약</strong> 시트 — 기록 수, 최근일, 태그 분포</p>
              </>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div className="px-6 py-4 border-t border-sp-border flex gap-2">
          <button
            onClick={() => void handleExport()}
            disabled={currentCount === 0 || isExporting}
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
