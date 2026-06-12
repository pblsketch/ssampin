/**
 * 수행평가 엑셀 내보내기 모달 (FR-5).
 *
 * - 시트: 번호 / 이름 / 요소별 점수 / 합계 / 비고 (+ 옵션: 요소별 메모)
 * - 미채점·결시는 빈칸(0점 강제 금지, D8), 결시는 비고에 '결시'
 * - 행 데이터는 도메인 buildRubricExportRows가 구성 — 화면 합계와 항상 일치
 */
import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import type { Rubric } from '@domain/entities/Rubric';
import { buildRubricExportRows, type RubricExportStudent } from '@domain/rules/rubricRules';
import { exportRubricToExcel } from '@infrastructure/export/ExcelExporter';

interface RubricExportModalProps {
  rubric: Rubric;
  students: readonly RubricExportStudent[];
  onClose: () => void;
}

export function RubricExportModal({ rubric, students, onClose }: RubricExportModalProps) {
  const gradings = useRubricStore((s) => s.gradings);
  const showToast = useToastStore((s) => s.show);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function saveFile(buffer: ArrayBuffer, fileName: string) {
    if (window.electronAPI) {
      const saved = await window.electronAPI.showSaveDialog({
        title: '수행평가 내보내기',
        defaultPath: fileName,
        filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
      });
      if (saved) {
        await window.electronAPI.writeFile(saved.handle, buffer);
        showToast('파일이 저장되었습니다', 'success', {
          label: '파일 열기',
          onClick: () => window.electronAPI?.openFile(saved.handle),
        });
        onClose();
      }
      return;
    }
    // 브라우저 모드 폴백: Blob 다운로드
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast('파일이 다운로드되었습니다', 'success');
    onClose();
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = buildRubricExportRows(rubric, gradings, students);
      const buffer = await exportRubricToExcel({
        title: rubric.title,
        criterionNames: rubric.criteria.map((c) => c.name),
        rows,
        includeNotes,
      });
      const safeTitle = rubric.title
        .replace(/[\\/:*?"<>|]/g, ' ')
        .trim()
        .slice(0, 40);
      await saveFile(buffer, `${safeTitle}_수행평가.xlsx`);
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="엑셀 내보내기" srOnlyTitle size="sm">
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sp-text">엑셀 내보내기</h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">{rubric.title}</p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-sp-muted leading-relaxed">
            번호 · 이름 · 요소별 점수 · 합계 · 비고 순서로 내보냅니다. 미채점·결시 칸은 0점이 아니라{' '}
            <span className="text-sp-text font-medium">빈칸</span>으로 두고, 결시 학생은 비고에
            &lsquo;결시&rsquo;로 표기합니다.
          </p>
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border cursor-pointer hover:border-sp-accent transition-colors">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="accent-sp-accent w-4 h-4 shrink-0"
            />
            <span className="text-sm text-sp-text">
              요소별 특이사항 메모 포함
              <span className="block text-caption text-sp-muted mt-0.5">
                나이스 입력용이라면 끄는 것을 권장해요 (점수만)
              </span>
            </span>
          </label>
        </div>

        <div className="p-4 border-t border-sp-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || students.length === 0}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {exporting ? '내보내는 중...' : '엑셀 내보내기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
