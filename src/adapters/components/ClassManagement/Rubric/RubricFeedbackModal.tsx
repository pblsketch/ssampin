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
import { Fragment, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import type { Rubric } from '@domain/entities/Rubric';
import {
  buildRubricFeedbackDocs,
  findGrading,
  type RubricExportStudent,
  type RubricFeedbackDoc,
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

/* ──────────────── 종이 미리보기 ──────────────── */

/**
 * 출력될 평가지(현장 채점기준표 양식)의 미리보기.
 * PDF/HWPX 렌더러와 동일한 도메인 데이터(RubricFeedbackDoc)를 입력으로 받아
 * 같은 구조(인적사항 → 괘선 표 → 합계 → 총평)를 HTML 표로 그린다.
 * 종이 출력물 미리보기이므로 앱 테마와 무관하게 흰 종이/검정 잉크 고정.
 */
function FeedbackPreview({
  title,
  className,
  doc,
}: {
  title: string;
  className?: string;
  doc: RubricFeedbackDoc;
}) {
  const includeScores = doc.maxScore !== null;
  const cellBase = 'border border-neutral-400 px-1.5 py-1 align-top';

  return (
    <div className="bg-white text-neutral-900 rounded-lg shadow-sp-sm px-5 py-6 text-[11px] leading-snug">
      <p className="text-center font-bold text-[15px] truncate">{title}</p>
      <p className="text-center text-neutral-500 text-[9px] mt-0.5 mb-3">수행평가 평가지</p>

      {/* 인적사항 */}
      <table className="w-full border-collapse mb-2">
        <tbody>
          <tr>
            <td className={`${cellBase} w-[45%]`}>
              <span className="text-neutral-500 text-[9px] mr-1.5">수업반</span>
              <span className="font-semibold">{className ?? ''}</span>
            </td>
            <td className={`${cellBase} w-[22%]`}>
              <span className="text-neutral-500 text-[9px] mr-1.5">번호</span>
              <span className="font-semibold">{doc.studentNumber}번</span>
            </td>
            <td className={cellBase}>
              <span className="text-neutral-500 text-[9px] mr-1.5">이름</span>
              <span className="font-semibold">{doc.studentName}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 본문 표 */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100">
            <th className={`${cellBase} w-[72px] text-center font-bold`}>평가 요소</th>
            <th className={`${cellBase} text-center font-bold`}>평가 기준</th>
            {includeScores && (
              <>
                <th className={`${cellBase} w-10 text-center font-bold`}>배점</th>
                <th className={`${cellBase} w-12 text-center font-bold`}>받은 점수</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {doc.blocks.map((block, blockIndex) => {
            const rowCount = block.levels.length + (block.note !== undefined ? 1 : 0);
            const checked = block.levels.find((l) => l.checked);
            return (
              <Fragment key={blockIndex}>
                {block.levels.map((level, levelIndex) => (
                  <tr key={levelIndex}>
                    {levelIndex === 0 && (
                      <td
                        rowSpan={rowCount}
                        className={`${cellBase} text-center align-middle font-semibold`}
                      >
                        {block.criterionName}
                      </td>
                    )}
                    <td
                      className={`${cellBase} ${level.checked ? 'font-semibold' : 'text-neutral-400'}`}
                    >
                      {level.checked ? '●' : '○'} {level.name}
                      {level.description !== undefined ? ` — ${level.description}` : ''}
                    </td>
                    {includeScores && (
                      <td
                        className={`${cellBase} text-center ${level.checked ? 'font-semibold' : 'text-neutral-400'}`}
                      >
                        {level.score ?? ''}
                      </td>
                    )}
                    {includeScores && levelIndex === 0 && (
                      <td
                        rowSpan={rowCount}
                        className={`${cellBase} text-center align-middle font-bold`}
                      >
                        {checked?.score ?? ''}
                      </td>
                    )}
                  </tr>
                ))}
                {block.note !== undefined && (
                  <tr>
                    <td className={cellBase} colSpan={includeScores ? 2 : 1}>
                      메모: {block.note}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {includeScores && (
            <tr className="bg-neutral-100">
              <td colSpan={2} className={`${cellBase} text-center font-bold`}>
                합계
              </td>
              <td className={`${cellBase} text-center font-bold`}>{doc.maxScore}</td>
              <td className={`${cellBase} text-center font-bold`}>
                {doc.isAbsent ? '결시' : (doc.total ?? '')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {doc.isAbsent && (
        <p className="text-neutral-500 text-[9px] mt-1">※ 결시 — 이 평가에 응시하지 않았습니다.</p>
      )}

      {/* 총평 */}
      <table className="w-full border-collapse mt-2">
        <tbody>
          <tr>
            <td className={`${cellBase} w-[72px] text-center align-middle font-semibold`}>총평</td>
            <td className={`${cellBase} h-12`}>{doc.overallFeedback ?? ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
    } catch (err) {
      // 진단 가능하도록 실제 원인을 토스트와 콘솔에 남긴다 (2026-06-12 사용자 신고 대응)
      console.error('[rubric] 평가지 출력 실패:', err);
      const detail = err instanceof Error && err.message.length > 0 ? ` (${err.message})` : '';
      showToast(`평가지 출력 중 오류가 발생했습니다${detail}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  const STATUS_LABEL: Record<string, { text: string; className: string } | undefined> = {
    graded: { text: '완료', className: 'bg-emerald-500/10 text-emerald-400' },
    partial: { text: '부분', className: 'bg-amber-500/10 text-amber-400' },
    absent: { text: '결시', className: 'bg-sp-surface text-sp-muted' },
  };

  // 미리보기: 선택된 학생 중 번호가 가장 빠른 1명 — 토글·선택에 실시간 반응
  const previewStudent = useMemo(() => {
    const selected = students.filter((s) => selectedKeys.includes(s.key));
    return [...selected].sort((a, b) => a.number - b.number)[0];
  }, [students, selectedKeys]);

  const previewDoc = useMemo(() => {
    if (previewStudent === undefined) return undefined;
    return buildRubricFeedbackDocs(rubric, gradings, [previewStudent], includeScores)[0];
  }, [previewStudent, rubric, gradings, includeScores]);

  return (
    <Modal isOpen onClose={onClose} title="학생 평가지 출력" srOnlyTitle size="xl">
      <div className="flex flex-col flex-1 min-h-0 max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sp-text">학생 평가지 출력</h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">{rubric.title}</p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        <div className="flex-1 min-h-0 flex gap-4 p-4">
          {/* 왼쪽: 설정 + 대상 선택 */}
          <div className="w-80 shrink-0 min-h-0 overflow-y-auto flex flex-col gap-4">
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
                      <span className="flex-1 min-w-0 truncate text-sm text-sp-text">
                        {row.name}
                      </span>
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

          {/* 오른쪽: 출력 미리보기 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
            <p className="text-xs text-sp-muted shrink-0">
              미리보기
              {previewStudent !== undefined && (
                <>
                  {' — '}
                  <span className="text-sp-text font-medium">
                    {previewStudent.number}번 {previewStudent.name}
                  </span>
                  {selectedKeys.length > 1 && ` 외 ${selectedKeys.length - 1}명`}
                </>
              )}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto bg-sp-surface rounded-xl p-4">
              {previewDoc !== undefined ? (
                <FeedbackPreview
                  title={rubric.title}
                  {...(className !== undefined ? { className } : {})}
                  doc={previewDoc}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-sp-muted">
                  출력 대상을 선택하면 평가지 미리보기가 표시됩니다
                </div>
              )}
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
