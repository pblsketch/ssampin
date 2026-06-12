/**
 * 학생 평가지 출력 모달 (FR-6).
 *
 * 현장에서 쓰는 수행평가 채점기준표 양식(괘선 표 — 평가 요소/평가 기준/배점/
 * 받은 점수 + 합계 행 + 총평 칸)으로 출력한다.
 * - 대상 선택: 학생 1명 / 다중 / 전체 (체크박스 명단 — 결시 학생은 기본 해제)
 * - 형식: PDF(학생당 1페이지) 또는 HWPX(한글에서 편집 가능)
 * - 점수 포함 토글: 끄면 도메인 데이터 단계에서 점수가 제거되어 렌더러가
 *   점수를 그릴 수 없다 (형성평가용 점수 숨김 출력)
 * - 렌더러는 dynamic import — pdf-lib/hwpxcore 청크를 출력 시점에만 로드
 */
import { useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import type { Rubric } from '@domain/entities/Rubric';
import {
  buildRubricFeedbackDocs,
  findGrading,
  type RubricExportStudent,
} from '@domain/rules/rubricRules';

type FeedbackFormat = 'pdf' | 'hwpx';

const FORMAT_META: Record<
  FeedbackFormat,
  { label: string; hint: string; ext: string; mime: string }
> = {
  pdf: {
    label: 'PDF',
    hint: '학생당 1페이지 — 바로 인쇄해 나눠주기 좋아요',
    ext: 'pdf',
    mime: 'application/pdf',
  },
  hwpx: {
    label: '한글 (HWPX)',
    hint: '한글에서 내용을 다듬은 뒤 인쇄할 수 있어요',
    ext: 'hwpx',
    mime: 'application/octet-stream',
  },
};

interface RubricFeedbackModalProps {
  rubric: Rubric;
  /** 출력물 머리글에 들어갈 수업반 표시 이름 (예: 2-3 국어) */
  className?: string;
  students: readonly RubricExportStudent[];
  onClose: () => void;
}

export function RubricFeedbackModal({
  rubric,
  className,
  students,
  onClose,
}: RubricFeedbackModalProps) {
  const gradings = useRubricStore((s) => s.gradings);
  const showToast = useToastStore((s) => s.show);

  const rows = useMemo(
    () =>
      students.map((student) => {
        const grading = findGrading(gradings, rubric.id, student.key);
        const status: 'absent' | 'graded' | 'partial' | 'none' =
          grading === undefined
            ? 'none'
            : grading.status === 'absent'
              ? 'absent'
              : grading.status === 'graded'
                ? 'graded'
                : Object.keys(grading.marks).length > 0
                  ? 'partial'
                  : 'none';
        return { ...student, status };
      }),
    [students, gradings, rubric.id],
  );

  // 기본 선택: 결시 학생 제외 전체 (체크로 다시 포함 가능)
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>(() =>
    rows.filter((r) => r.status !== 'absent').map((r) => r.key),
  );
  const [format, setFormat] = useState<FeedbackFormat>('pdf');
  const [includeScores, setIncludeScores] = useState(true);
  const [exporting, setExporting] = useState(false);

  const allSelected = selectedKeys.length === rows.length && rows.length > 0;

  function toggleStudent(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? [] : rows.map((r) => r.key));
  }

  async function saveFile(buffer: ArrayBuffer, fileName: string) {
    const meta = FORMAT_META[format];
    if (window.electronAPI) {
      const saved = await window.electronAPI.showSaveDialog({
        title: '평가지 출력',
        defaultPath: fileName,
        filters: [{ name: `${meta.label} 파일`, extensions: [meta.ext] }],
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
    const blob = new Blob([buffer], { type: meta.mime });
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
    if (exporting || selectedKeys.length === 0) return;
    setExporting(true);
    try {
      const targets = students.filter((s) => selectedKeys.includes(s.key));
      const docs = buildRubricFeedbackDocs(rubric, gradings, targets, includeScores);
      const safeTitle = rubric.title
        .replace(/[\\/:*?"<>|]/g, ' ')
        .trim()
        .slice(0, 40);
      const fileName = `${safeTitle}_평가지.${FORMAT_META[format].ext}`;

      if (format === 'pdf') {
        const { exportRubricFeedbackToPdf } =
          await import('@infrastructure/export/pdf/RubricFeedbackPdf');
        const buffer = await exportRubricFeedbackToPdf({
          title: rubric.title,
          ...(className !== undefined ? { className } : {}),
          docs,
        });
        await saveFile(buffer, fileName);
      } else {
        const { exportRubricFeedbackToHwpx } = await import('@infrastructure/export/HwpxExporter');
        const bytes = await exportRubricFeedbackToHwpx({
          title: rubric.title,
          ...(className !== undefined ? { className } : {}),
          docs,
        });
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        await saveFile(buffer, fileName);
      }
    } catch {
      showToast('평가지 출력 중 오류가 발생했습니다', 'error');
    } finally {
      setExporting(false);
    }
  }

  const STATUS_LABEL: Record<string, { text: string; className: string } | undefined> = {
    graded: { text: '완료', className: 'bg-emerald-500/10 text-emerald-400' },
    partial: { text: '부분', className: 'bg-amber-500/10 text-amber-400' },
    absent: { text: '결시', className: 'bg-sp-surface text-sp-muted' },
  };

  return (
    <Modal isOpen onClose={onClose} title="학생 평가지 출력" srOnlyTitle size="md">
      <div className="flex flex-col flex-1 min-h-0 max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sp-text">학생 평가지 출력</h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">{rubric.title}</p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* 형식 선택 */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="출력 형식">
            {(['pdf', 'hwpx'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                onClick={() => setFormat(value)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  format === value
                    ? 'border-sp-accent bg-sp-surface'
                    : 'border-sp-border hover:border-sp-accent'
                }`}
              >
                <span
                  className={`block text-sm font-semibold ${
                    format === value ? 'text-sp-accent' : 'text-sp-text'
                  }`}
                >
                  {FORMAT_META[value].label}
                </span>
                <span className="block text-caption text-sp-muted mt-0.5">
                  {FORMAT_META[value].hint}
                </span>
              </button>
            ))}
          </div>

          {/* 점수 포함 토글 */}
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border cursor-pointer hover:border-sp-accent transition-colors">
            <input
              type="checkbox"
              checked={includeScores}
              onChange={(e) => setIncludeScores(e.target.checked)}
              className="accent-sp-accent w-4 h-4 shrink-0"
            />
            <span className="text-sm text-sp-text">
              점수 포함
              <span className="block text-caption text-sp-muted mt-0.5">
                끄면 배점·합계 없이 수준 이름·체크·메모·총평만 출력돼요 (형성평가용)
              </span>
            </span>
          </label>

          {/* 대상 선택 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sp-text">출력 대상</span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-sp-accent hover:brightness-110 transition-all"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="flex flex-col rounded-lg border border-sp-border overflow-hidden">
              {rows.map((row) => {
                const badge = STATUS_LABEL[row.status];
                return (
                  <label
                    key={row.key}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-sp-border last:border-b-0 cursor-pointer hover:bg-sp-surface transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(row.key)}
                      onChange={() => toggleStudent(row.key)}
                      className="accent-sp-accent w-4 h-4 shrink-0"
                    />
                    <span className="w-6 text-xs text-sp-muted text-right shrink-0">
                      {row.number}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-sp-text">{row.name}</span>
                    {badge !== undefined && (
                      <span
                        className={`text-caption px-1.5 py-0.5 rounded-full shrink-0 ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-sp-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-caption text-sp-muted flex-1">
            여러 명을 선택하면 한 파일에 학생별로 이어서 출력됩니다.
          </p>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || selectedKeys.length === 0}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {exporting ? '출력 중...' : `${selectedKeys.length}명 출력`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
