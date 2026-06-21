import { useState, useMemo, useCallback } from 'react';
import type { RecordDraft, RecordArea, SchoolLevel } from '@domain/entities/RecordDraft';
import {
  RECORD_AREA_LABELS,
  RECORD_AREAS,
  neisByteLength,
  resolveAreaLimit,
} from '@domain/entities/RecordDraft';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
/* eslint-disable no-restricted-imports */
import { exportRecordDraftsToExcel } from '@infrastructure/export/ExcelExporter';
import type { RecordDraftStudentRef } from '@infrastructure/export/ExcelExporter';
import { exportRecordDraftsToHwpx } from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */

type ExportFormat = 'excel' | 'hwpx' | 'neis-paste';

interface RecordDraftExportModalProps {
  drafts: readonly RecordDraft[];
  students: ReadonlyArray<RecordDraftStudentRef>;
  areas: readonly RecordArea[];
  level?: SchoolLevel;
  className?: string;
  onClose: () => void;
}

/**
 * NEIS 붙여넣기용 텍스트 블록 생성.
 * 영역별로 확정 초안 내용을 구분 없이 블록으로 정리.
 */
function buildNeisPasteText(
  drafts: readonly RecordDraft[],
  students: ReadonlyArray<RecordDraftStudentRef>,
  areas: readonly RecordArea[],
  confirmedOnly: boolean,
  level: SchoolLevel,
): string {
  const activeDrafts = confirmedOnly ? drafts.filter((d) => d.status === 'confirmed') : drafts;

  const draftMap = new Map<string, RecordDraft>();
  for (const draft of activeDrafts) {
    const key = `${draft.studentRef}::${draft.area}`;
    const existing = draftMap.get(key);
    if (!existing || draft.updatedAt > existing.updatedAt) {
      draftMap.set(key, draft);
    }
  }

  const validAreas: RecordArea[] = [];
  for (const area of areas) {
    try {
      resolveAreaLimit(area, level);
      validAreas.push(area);
    } catch {
      // 학교급에 없는 영역 skip
    }
  }

  const lines: string[] = [];

  for (const student of students) {
    const numStr = student.number != null ? `${String(student.number).padStart(2, '0')}번 ` : '';
    lines.push(`■ ${numStr}${student.name}`);

    for (const area of validAreas) {
      const key = `${student.studentRef}::${area}`;
      const draft = draftMap.get(key);
      if (!draft) continue;

      let limit = 0;
      try {
        limit = resolveAreaLimit(area, level);
      } catch {
        // ignore
      }
      const bytes = neisByteLength(draft.content);
      const areaLabel = RECORD_AREA_LABELS[area];
      lines.push(`[${areaLabel}] (${bytes}/${limit}B)`);
      lines.push(draft.content);
      lines.push('');
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function RecordDraftExportModal({
  drafts,
  students,
  areas,
  level = 'high',
  className,
  onClose,
}: RecordDraftExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [includeMeta, setIncludeMeta] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<Set<RecordArea>>(() => new Set(areas));
  const [isExporting, setIsExporting] = useState(false);
  const [pasteText, setPasteText] = useState<string | null>(null);

  const showToast = useToastStore((s) => s.show);

  // 유효 영역만 표시 (areas prop 교집합 RECORD_AREAS)
  const availableAreas = useMemo(() => RECORD_AREAS.filter((a) => areas.includes(a)), [areas]);

  const toggleArea = useCallback((area: RecordArea) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }, []);

  const toggleAllAreas = useCallback(() => {
    if (selectedAreas.size === availableAreas.length) {
      setSelectedAreas(new Set());
    } else {
      setSelectedAreas(new Set(availableAreas));
    }
  }, [selectedAreas.size, availableAreas]);

  const activeAreaList = useMemo(
    () => availableAreas.filter((a) => selectedAreas.has(a)),
    [availableAreas, selectedAreas],
  );

  // 미리보기 건수: 선택 영역 × (confirmedOnly 필터) 에 해당하는 초안 수
  const previewCount = useMemo(() => {
    const filtered = confirmedOnly ? drafts.filter((d) => d.status === 'confirmed') : drafts;
    return filtered.filter((d) => selectedAreas.has(d.area)).length;
  }, [drafts, confirmedOnly, selectedAreas]);

  const handleExport = useCallback(async () => {
    if (selectedAreas.size === 0) return;
    setIsExporting(true);
    setPasteText(null);

    try {
      if (format === 'neis-paste') {
        const text = buildNeisPasteText(drafts, students, activeAreaList, confirmedOnly, level);
        setPasteText(text);
        setIsExporting(false);
        return;
      }

      let data: ArrayBuffer | Uint8Array;
      let defaultFileName: string;

      if (format === 'excel') {
        data = await exportRecordDraftsToExcel(drafts, students, activeAreaList, {
          level,
          includeMeta,
          confirmedOnly,
        });
        defaultFileName = '생활기록부_초안.xlsx';
      } else {
        data = await exportRecordDraftsToHwpx(
          drafts,
          students,
          activeAreaList,
          { className },
          { level, confirmedOnly },
        );
        defaultFileName = '생활기록부_초안.hwpx';
      }

      // Uint8Array → ArrayBuffer 변환
      const normalized: ArrayBuffer =
        data instanceof Uint8Array
          ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
          : data;

      if (window.electronAPI) {
        const ext = format === 'hwpx' ? 'hwpx' : 'xlsx';
        const filterName = format === 'hwpx' ? '한글 문서' : 'Excel 파일';
        const saved = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: filterName, extensions: [ext] }],
        });

        if (saved) {
          await window.electronAPI.writeFile(saved.handle, normalized);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(saved.handle),
          });
          onClose();
        }
      } else {
        const mimeType =
          format === 'hwpx'
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
    drafts,
    students,
    activeAreaList,
    format,
    level,
    className,
    includeMeta,
    confirmedOnly,
    selectedAreas.size,
    showToast,
    onClose,
  ]);

  return (
    <Modal isOpen onClose={onClose} title="생활기록부 초안 내보내기" srOnlyTitle size="lg">
      <div className="overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            <h3 className="text-sp-text font-semibold">생활기록부 초안 내보내기</h3>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 형식 선택 */}
          <div>
            <label className="text-sm text-sp-muted mb-2 block">형식</label>
            <div className="flex gap-2">
              {(
                [
                  { id: 'excel' as const, label: 'Excel', icon: 'table_view' },
                  { id: 'hwpx' as const, label: 'HWPX', icon: 'description' },
                  { id: 'neis-paste' as const, label: 'NEIS 붙여넣기', icon: 'content_paste' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFormat(f.id);
                    setPasteText(null);
                  }}
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

          {/* 영역 선택 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-sp-muted">영역</label>
              <button
                onClick={toggleAllAreas}
                className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
              >
                {selectedAreas.size === availableAreas.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {availableAreas.map((area) => (
                <label
                  key={area}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    selectedAreas.has(area)
                      ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/30'
                      : 'bg-sp-surface text-sp-muted border border-sp-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedAreas.has(area)}
                    onChange={() => toggleArea(area)}
                    className="sr-only"
                  />
                  {RECORD_AREA_LABELS[area]}
                </label>
              ))}
            </div>
          </div>

          {/* 필터 옵션 */}
          <div className="space-y-2">
            <label className="text-sm text-sp-muted block">옵션</label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmedOnly}
                onChange={(e) => setConfirmedOnly(e.target.checked)}
                className="rounded border-sp-border text-sp-accent"
              />
              <span className="text-sm text-sp-text">확정된 초안만 내보내기</span>
            </label>
            {format === 'excel' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeMeta}
                  onChange={(e) => setIncludeMeta(e.target.checked)}
                  className="rounded border-sp-border text-sp-accent"
                />
                <span className="text-sm text-sp-text">바이트 수 / 상태 메타 포함</span>
              </label>
            )}
          </div>

          {/* 미리보기 건수 */}
          <div className="bg-sp-surface rounded-lg px-4 py-3 text-center">
            <span className="text-sp-accent font-semibold">{previewCount}</span>
            <span className="text-sp-muted text-sm">건의 초안이 포함됩니다</span>
          </div>

          {/* NEIS 붙여넣기 결과 */}
          {pasteText !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-sp-muted">NEIS 붙여넣기 텍스트</label>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(pasteText);
                    showToast('클립보드에 복사되었습니다', 'success');
                  }}
                  className="flex items-center gap-1 text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  복사
                </button>
              </div>
              <textarea
                readOnly
                value={pasteText}
                rows={10}
                className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-xs text-sp-text font-mono resize-y focus:outline-none"
              />
            </div>
          )}
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
            disabled={isExporting || previewCount === 0 || selectedAreas.size === 0}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isExporting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
                내보내는 중...
              </>
            ) : format === 'neis-paste' ? (
              <>
                <span className="material-symbols-outlined text-base">content_paste</span>
                텍스트 생성
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
