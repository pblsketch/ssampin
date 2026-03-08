import { useState, useCallback, useEffect } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
/* eslint-disable no-restricted-imports */
import {
  exportClassScheduleToExcel,
  exportTeacherScheduleToExcel,
  exportSeatingToExcel,
  exportEventsToExcel,
  exportStudentRecordsToExcel,
} from '@infrastructure/export/ExcelExporter';
import {
  exportClassScheduleToHwpx,
  exportTeacherScheduleToHwpx,
  exportSeatingToHwpx,
  exportStudentRecordsToHwpx,
} from '@infrastructure/export/HwpxExporter';
import { ExportPreviewModal } from './ExportPreviewModal';
/* eslint-enable no-restricted-imports */

export type ExportItem = 'classSchedule' | 'teacherSchedule' | 'seating' | 'events' | 'studentRecords';
export type ExportFormat = 'excel' | 'hwpx' | 'pdf';

interface ExportItemConfig {
  id: ExportItem;
  label: string;
  description: string;
  icon: string;
  formats: ExportFormat[];
}

const EXPORT_ITEMS: ExportItemConfig[] = [
  {
    id: 'classSchedule',
    label: '학급 시간표',
    description: '우리 반 요일별 교시 시간표',
    icon: 'calendar_view_day',
    formats: ['excel', 'hwpx'],
  },
  {
    id: 'teacherSchedule',
    label: '교사 시간표',
    description: '교사 개인 수업 시간표',
    icon: 'person',
    formats: ['excel', 'hwpx'],
  },
  {
    id: 'seating',
    label: '학급 자리 배치도',
    description: '현재 학급 자리 배치 현황',
    icon: 'airline_seat_recline_normal',
    formats: ['excel', 'hwpx', 'pdf'],
  },
  {
    id: 'events',
    label: '학교 일정',
    description: '등록된 학교 일정 목록',
    icon: 'event_note',
    formats: ['excel', 'pdf'],
  },
  {
    id: 'studentRecords',
    label: '담임 메모',
    description: '담임 메모장 기록 내보내기',
    icon: 'assignment_ind',
    formats: ['excel', 'hwpx'],
  },
];

const FORMAT_CONFIG: Record<
  ExportFormat,
  { label: string; icon: string; description: string; ext: string }
> = {
  excel: {
    label: 'Excel',
    icon: 'table_view',
    description: 'Excel 스프레드시트 (.xlsx)',
    ext: 'xlsx',
  },
  hwpx: {
    label: 'HWPX',
    icon: 'description',
    description: '한글 문서 (.hwpx)',
    ext: 'hwpx',
  },
  pdf: {
    label: 'PDF',
    icon: 'picture_as_pdf',
    description: 'PDF 문서 (.pdf)',
    ext: 'pdf',
  },
};

export function Export() {
  const { track } = useAnalytics();
  const [selectedItems, setSelectedItems] = useState<Set<ExportItem>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const loadSchedule = useScheduleStore((s) => s.load);
  const seating = useSeatingStore((s) => s.seating);
  const loadSeating = useSeatingStore((s) => s.load);
  const getStudent = useStudentStore((s) => s.getStudent);
  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const events = useEventsStore((s) => s.events);
  const loadEvents = useEventsStore((s) => s.load);
  const maxPeriods = useSettingsStore((s) => s.settings.maxPeriods);
  const className = useSettingsStore((s) => s.settings.className);
  const loadSettings = useSettingsStore((s) => s.load);
  const studentRecords = useStudentRecordsStore((s) => s.records);
  const studentCategories = useStudentRecordsStore((s) => s.categories);
  const loadStudentRecords = useStudentRecordsStore((s) => s.load);
  const schoolName = useSettingsStore((s) => s.settings.schoolName);
  const teacherName = useSettingsStore((s) => s.settings.teacherName);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    void loadSeating();
    void loadStudents();
    void loadSchedule();
    void loadEvents();
    void loadSettings();
    void loadStudentRecords();
  }, [loadSeating, loadStudents, loadSchedule, loadEvents, loadSettings, loadStudentRecords]);

  const toggleItem = useCallback((item: ExportItem) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
    setSelectedFormat(null);
  }, []);

  const availableFormats: ExportFormat[] = (() => {
    if (selectedItems.size === 0) return [];
    const formatSets = [...selectedItems].map((item) => {
      const config = EXPORT_ITEMS.find((c) => c.id === item);
      return new Set(config?.formats ?? []);
    });
    const first = formatSets[0];
    if (!first) return [];
    return [...first].filter((fmt) => formatSets.every((s) => s.has(fmt)));
  })();

  const handleExport = useCallback(async () => {
    if (selectedItems.size === 0 || !selectedFormat) return;
    setIsExporting(true);
    track('export', { format: selectedFormat });

    try {
      for (const item of selectedItems) {
        let data: ArrayBuffer | Uint8Array | string | null = null;
        let defaultFileName = '';

        if (selectedFormat === 'excel') {
          if (item === 'classSchedule') {
            data = await exportClassScheduleToExcel(classSchedule, maxPeriods);
            defaultFileName = '학급시간표.xlsx';
          } else if (item === 'teacherSchedule') {
            data = await exportTeacherScheduleToExcel(teacherSchedule, maxPeriods);
            defaultFileName = '교사시간표.xlsx';
          } else if (item === 'seating') {
            data = await exportSeatingToExcel(seating, getStudent, students, className);
            defaultFileName = '학급자리배치도.xlsx';
          } else if (item === 'events') {
            data = await exportEventsToExcel(events.filter((e) => !e.isHidden));
            defaultFileName = '학교일정.xlsx';
          } else if (item === 'studentRecords') {
            data = await exportStudentRecordsToExcel(studentRecords, students, studentCategories);
            defaultFileName = '담임메모.xlsx';
          }
        } else if (selectedFormat === 'hwpx') {
          if (item === 'classSchedule') {
            data = await exportClassScheduleToHwpx(classSchedule, maxPeriods);
            defaultFileName = '학급시간표.hwpx';
          } else if (item === 'teacherSchedule') {
            data = await exportTeacherScheduleToHwpx(teacherSchedule, maxPeriods);
            defaultFileName = '교사시간표.hwpx';
          } else if (item === 'seating') {
            data = await exportSeatingToHwpx(seating, getStudent, students, className);
            defaultFileName = '학급자리배치도.hwpx';
          } else if (item === 'studentRecords') {
            data = await exportStudentRecordsToHwpx(
              studentRecords, students, studentCategories,
              { schoolName, className, teacherName },
            );
            defaultFileName = '담임기록부.hwpx';
          }
        } else if (selectedFormat === 'pdf') {
          if (window.electronAPI) {
            const pdfData = await window.electronAPI.printToPDF();
            if (pdfData) {
              data = pdfData;
              defaultFileName = item === 'seating' ? '학급자리배치도.pdf' : '학교일정.pdf';
            }
          } else {
            window.print();
            continue;
          }
        }

        if (data === null) continue;

        // Uint8Array → ArrayBuffer 변환 (writeFile/Blob 호환)
        const normalized: ArrayBuffer | string =
          data instanceof Uint8Array
            ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
            : data;

        if (window.electronAPI) {
          const filters =
            selectedFormat === 'excel'
              ? [{ name: 'Excel 파일', extensions: ['xlsx'] }]
              : selectedFormat === 'pdf'
                ? [{ name: 'PDF 파일', extensions: ['pdf'] }]
                : [{ name: '한글 문서', extensions: ['hwpx'] }];

          const filePath = await window.electronAPI.showSaveDialog({
            title: '내보내기',
            defaultPath: defaultFileName,
            filters,
          });

          if (filePath) {
            await window.electronAPI.writeFile(filePath, normalized);
            showToast('파일이 저장되었습니다', 'success', {
              label: '파일 열기',
              onClick: () => window.electronAPI?.openFile(filePath),
            });
          }
        } else {
          const blob =
            typeof normalized === 'string'
              ? new Blob([normalized], { type: 'text/plain;charset=utf-8' })
              : new Blob([normalized], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = defaultFileName;
          a.click();
          URL.revokeObjectURL(url);
          showToast('파일이 다운로드되었습니다', 'success');
        }
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedItems,
    selectedFormat,
    classSchedule,
    teacherSchedule,
    seating,
    getStudent,
    students,
    events,
    maxPeriods,
    className,
    studentRecords,
    studentCategories,
    schoolName,
    teacherName,
    showToast,
    track,
  ]);

  return (
    <div className='max-w-3xl mx-auto'>
      <div className='flex items-center gap-3 mb-8'>
        <div className='bg-sp-accent/20 p-2 rounded-lg'>
          <span className='material-symbols-outlined text-sp-accent text-2xl'>ios_share</span>
        </div>
        <div>
          <h2 className='text-2xl font-bold text-white'>내보내기</h2>
          <p className='text-sp-muted text-sm'>데이터를 파일로 내보냅니다</p>
        </div>
      </div>

      {/* Step 1: 항목 선택 */}
      <div className='mb-8'>
        <h3 className='text-white font-semibold mb-4 flex items-center gap-2'>
          <span className='bg-sp-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold'>
            1
          </span>
          내보낼 항목 선택
        </h3>
        <div className='grid grid-cols-2 gap-3'>
          {EXPORT_ITEMS.map((item) => {
            const isSelected = selectedItems.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${isSelected
                  ? 'bg-sp-accent/10 border-sp-accent'
                  : 'bg-sp-card border-sp-border hover:border-sp-accent/50'
                  }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-sp-accent/20' : 'bg-white/5'}`}>
                  <span
                    className={`material-symbols-outlined ${isSelected ? 'text-sp-accent' : 'text-sp-muted'}`}
                  >
                    {item.icon}
                  </span>
                </div>
                <div className='flex-1 min-w-0'>
                  <p
                    className={`font-medium text-sm ${isSelected ? 'text-white' : 'text-sp-text'}`}
                  >
                    {item.label}
                  </p>
                  <p className='text-xs text-sp-muted truncate'>{item.description}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-sp-accent border-sp-accent' : 'border-sp-border'
                    }`}
                >
                  {isSelected && (
                    <span className='material-symbols-outlined text-white text-sm'>check</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: 형식 선택 */}
      {selectedItems.size > 0 && (
        <div className='mb-8'>
          <h3 className='text-white font-semibold mb-4 flex items-center gap-2'>
            <span className='bg-sp-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold'>
              2
            </span>
            파일 형식 선택
          </h3>
          {availableFormats.length > 0 ? (
            <div className='flex gap-3'>
              {availableFormats.map((fmt) => {
                const config = FORMAT_CONFIG[fmt];
                const isSelected = selectedFormat === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={`flex-1 flex flex-col items-center gap-2 p-5 rounded-xl border transition-all ${isSelected
                      ? 'bg-sp-accent/10 border-sp-accent'
                      : 'bg-sp-card border-sp-border hover:border-sp-accent/50'
                      }`}
                  >
                    <span
                      className={`material-symbols-outlined text-3xl ${isSelected ? 'text-sp-accent' : 'text-sp-muted'}`}
                    >
                      {config.icon}
                    </span>
                    <span
                      className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-sp-text'}`}
                    >
                      {config.label}
                    </span>
                    <span className='text-xs text-sp-muted'>{config.description}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className='text-sp-muted text-sm text-center py-4'>
              선택한 항목들의 공통 지원 형식이 없습니다. 항목을 개별로 선택해주세요.
            </p>
          )}
        </div>
      )}

      {/* 내보내기 버튼 */}
      {selectedFormat && (
        <button
          onClick={() => setShowPreview(true)}
          className='w-full py-4 bg-sp-accent hover:bg-sp-accent/90 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2'
        >
          <span className='material-symbols-outlined'>preview</span>
          미리보기 후 내보내기
        </button>
      )}

      {/* 미리보기 모달 */}
      {showPreview && selectedFormat && (
        <ExportPreviewModal
          items={selectedItems}
          format={selectedFormat}
          isExporting={isExporting}
          onConfirm={() => {
            void handleExport().then(() => setShowPreview(false));
          }}
          onCancel={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
