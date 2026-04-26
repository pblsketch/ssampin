import { useState, useMemo, useCallback } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { filterByStudent, filterByDateRange } from '@domain/rules/studentRecordRules';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
/* eslint-disable no-restricted-imports */
import { exportStudentRecordsToExcel, exportRecordsForSchoolReport } from '@infrastructure/export/ExcelExporter';
import { exportStudentRecordsToHwpx } from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */

type ExportFormat = 'excel' | 'hwpx' | 'school-report';
type PeriodPreset = 'all' | 'semester' | 'month' | 'custom';

interface RecordsExportModalProps {
  records: readonly StudentRecord[];
  students: readonly Student[];
  categories: readonly RecordCategoryItem[];
  onClose: () => void;
}

function getSemesterRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  // 2학기: 9월~2월, 1학기: 3월~8월
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

export function RecordsExportModal({ records, students, categories, onClose }: RecordsExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.id)),
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const schoolName = useSettingsStore((s) => s.settings.schoolName);
  const className = useSettingsStore((s) => s.settings.className);
  const teacherName = useSettingsStore((s) => s.settings.teacherName);
  const showToast = useToastStore((s) => s.show);

  const period = useMemo<{ start: string; end: string } | undefined>(() => {
    if (periodPreset === 'all') return undefined;
    if (periodPreset === 'semester') return getSemesterRange();
    if (periodPreset === 'month') return getMonthRange();
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return undefined;
  }, [periodPreset, customStart, customEnd]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 학생 필터
    if (selectedStudentId) {
      result = filterByStudent(result, selectedStudentId) as StudentRecord[];
    }

    // 카테고리 필터 (항상 적용)
    result = result.filter((r) => selectedCategoryIds.has(r.category));

    // 기간 필터
    if (period) {
      result = filterByDateRange(result, new Date(period.start), new Date(period.end)) as StudentRecord[];
    }

    return result;
  }, [records, selectedStudentId, selectedCategoryIds, period]);

  const filteredStudents = useMemo(() => {
    if (selectedStudentId) {
      return students.filter((s) => s.id === selectedStudentId);
    }
    return students;
  }, [students, selectedStudentId]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllCategories = useCallback(() => {
    if (selectedCategoryIds.size === categories.length) {
      setSelectedCategoryIds(new Set());
    } else {
      setSelectedCategoryIds(new Set(categories.map((c) => c.id)));
    }
  }, [selectedCategoryIds.size, categories]);

  const handleExport = useCallback(async () => {
    if (filteredRecords.length === 0) return;
    setIsExporting(true);

    try {
      let data: ArrayBuffer | Uint8Array;
      let defaultFileName: string;

      if (format === 'excel') {
        data = await exportStudentRecordsToExcel(filteredRecords, filteredStudents, categories, period);
        defaultFileName = '담임메모.xlsx';
      } else if (format === 'school-report') {
        data = await exportRecordsForSchoolReport(filteredRecords, filteredStudents, categories);
        defaultFileName = '학생별_기록정리.xlsx';
      } else {
        data = await exportStudentRecordsToHwpx(
          filteredRecords, filteredStudents, categories,
          { schoolName, className, teacherName },
          period,
        );
        defaultFileName = '담임기록부.hwpx';
      }

      // Uint8Array → ArrayBuffer 변환
      const normalized: ArrayBuffer =
        data instanceof Uint8Array
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
          : data;

      if (window.electronAPI) {
        const ext = format === 'hwpx' ? 'hwpx' : 'xlsx';
        const filterName = format === 'hwpx' ? '한글 문서' : 'Excel 파일';
        const filePath = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: filterName, extensions: [ext] }],
        });

        if (filePath) {
          await window.electronAPI.writeFile(filePath, normalized);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
          onClose();
        }
      } else {
        const mimeType = format === 'hwpx'
          ? 'application/x-hwpx'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const blob = new Blob([normalized], { type: mimeType });
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
  }, [
    filteredRecords, filteredStudents, categories, format, period,
    schoolName, className, teacherName,
    showToast, onClose,
  ]);

  return (
    <Modal isOpen onClose={onClose} title="담임 메모 내보내기" srOnlyTitle size="lg">
      <div className="overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            <h3 className="text-sp-text font-semibold">담임 메모 내보내기</h3>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 형식 선택 */}
          <div>
            <label className="text-sm text-sp-muted mb-2 block">형식</label>
            <div className="flex gap-2">
              {([
                { id: 'excel' as const, label: 'Excel', icon: 'table_view' },
                { id: 'hwpx' as const, label: 'HWPX', icon: 'description' },
                { id: 'school-report' as const, label: '학생별 정리', icon: 'school' },
              ]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    format === f.id
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{f.icon}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 기간 필터 */}
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

          {/* 카테고리 필터 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-sp-muted">카테고리</label>
              <button
                onClick={toggleAllCategories}
                className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
              >
                {selectedCategoryIds.size === categories.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    selectedCategoryIds.has(cat.id)
                      ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/30'
                      : 'bg-sp-surface text-sp-muted border border-sp-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.has(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="sr-only"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          </div>

          {/* 학생 필터 */}
          <div>
            <label className="text-sm text-sp-muted mb-2 block">학생</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            >
              <option value="">전체 학생</option>
              {students
                .filter((s) => !s.isVacant)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.studentNumber}번 {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* 미리보기 건수 */}
          <div className="bg-sp-surface rounded-lg px-4 py-3 text-center">
            <span className="text-sp-accent font-semibold">{filteredRecords.length}</span>
            <span className="text-sp-muted text-sm">건의 기록이 포함됩니다</span>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-sp-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-all"
          >
            취소
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={isExporting || filteredRecords.length === 0 || selectedCategoryIds.size === 0}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isExporting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                내보내는 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">download</span>
                내보내기
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
