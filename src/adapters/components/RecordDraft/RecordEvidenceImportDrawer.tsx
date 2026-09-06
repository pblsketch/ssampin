/**
 * 「엑셀 ▾」 서랍 — 엑셀 양식으로 근거를 일괄 등록한다(양식 받기 / 업로드).
 *
 * 예전에는 관찰·누가기록·수행평가·성적 서술·첨부·과제 제출을 출처마다 골라 끌어오는 서랍이었다. 2차(설계서 §4-1, ADR-085 보강 2 R1)
 * 부터 그 기록들은 보드 미분류 열에 **거울 카드로 저절로** 보이므로, 여기에는 엑셀만 남았다(파일 이름은 유지).
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  useRecordEvidenceStore,
  type RecordEvidenceAddInput,
} from '@adapters/stores/useRecordEvidenceStore';
import {
  mapExcelEvidenceRows,
  type EvidenceImportError,
} from '@usecases/studentRecords/importEvidenceFromExcel';
import {
  exportEvidenceTemplateToExcel,
  parseEvidenceFromExcel,
  ExcelReadError,
} from '@infrastructure/export/EvidenceExcel';
import { EvidenceDrawer } from '@adapters/components/RecordDraft/EvidenceDrawer';
import type { EvidenceStudentRow } from '@adapters/components/RecordDraft/RecordEvidenceBoard';

interface RecordEvidenceImportDrawerProps {
  readonly students: readonly EvidenceStudentRow[];
  /** 서랍 머리의 문맥(학생 이름). 등록은 양식의 학생 열을 따른다. */
  readonly student: EvidenceStudentRow;
  readonly classId?: string;
  readonly className?: string;
  /** 「양식 받기」로 열렸으면 열자마자 양식을 내려받는다. */
  readonly downloadOnOpen?: boolean;
  onClose: () => void;
}

export function RecordEvidenceImportDrawer({
  students,
  student,
  classId,
  className,
  downloadOnOpen,
  onClose,
}: RecordEvidenceImportDrawerProps) {
  const addMany = useRecordEvidenceStore((s) => s.addMany);

  const [excelMsg, setExcelMsg] = useState<string | null>(null);
  const [excelErrors, setExcelErrors] = useState<readonly EvidenceImportError[]>([]);
  const excelFileRef = useRef<HTMLInputElement | null>(null);

  // ── 엑셀 ────────────────────────────────────────────────────
  /** 근거 입력용 엑셀 양식 다운로드(명단 사전 채움). */
  const downloadTemplate = async (): Promise<void> => {
    try {
      const tplStudents = students.map((s) => ({
        studentRef: s.studentRef,
        number: s.number,
        name: s.name,
      }));
      const data = await exportEvidenceTemplateToExcel(tplStudents, className);
      const fileName = `근거자료_양식${className ? `_${className}` : ''}.xlsx`;
      if (window.electronAPI) {
        const saved = await window.electronAPI.showSaveDialog({
          title: '근거 자료 양식 내보내기',
          defaultPath: fileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (saved) {
          await window.electronAPI.writeFile(saved.handle, data);
          setExcelMsg('양식이 저장되었습니다');
        }
      } else {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setExcelMsg('양식이 다운로드되었습니다');
      }
      setExcelErrors([]);
    } catch {
      setExcelMsg('양식 생성 중 오류가 발생했습니다');
    }
  };

  useEffect(() => {
    if (downloadOnOpen) void downloadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 엑셀 업로드 → 파싱 → 매핑 → 미분류(유형 없음) 근거로 일괄 등록. */
  const uploadExcel = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      setExcelMsg('구형 엑셀(.xls)은 지원되지 않습니다. .xlsx로 저장해 주세요.');
      setExcelErrors([]);
      e.target.value = '';
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const rows = await parseEvidenceFromExcel(buffer);
      const { items, errors } = mapExcelEvidenceRows(rows, students);
      setExcelErrors(errors);
      if (items.length === 0) {
        setExcelMsg(
          errors.length > 0
            ? `등록된 근거 0건 · 오류 ${errors.length}건`
            : '등록할 내용이 없습니다(내용을 입력했는지 확인하세요).',
        );
        e.target.value = '';
        return;
      }
      const inputs: RecordEvidenceAddInput[] = items.map((it) => ({
        studentRef: it.studentRef,
        areas: [],
        content: it.content,
        sourceType: 'manual',
        ...(it.date ? { date: it.date } : {}),
        ...(classId !== undefined ? { classId } : {}),
      }));
      const n = await addMany(inputs);
      setExcelMsg(
        `${n}건을 등록했습니다${errors.length > 0 ? ` · 오류 ${errors.length}건` : ''}. 미분류 열에서 유형을 지정하세요.`,
      );
    } catch (err) {
      // 실제 예외를 콘솔에 표면화(신고 시 즉시 진단).
      console.error('[RecordEvidence] 엑셀 업로드 실패:', err);
      if (err instanceof ExcelReadError && err.kind === 'not-xlsx') {
        setExcelMsg(
          '유효한 .xlsx 파일이 아닙니다. Excel에서 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’로 다시 저장한 뒤 업로드하세요.',
        );
      } else {
        setExcelMsg('엑셀을 읽는 중 오류가 발생했습니다(.xlsx 파일인지 확인하세요).');
      }
      setExcelErrors([]);
    }
    e.target.value = '';
  };

  return (
    <EvidenceDrawer title="엑셀로 근거 가져오기" caption={student.name} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-sp-muted">
          양식을 내려받아 학생별 내용을 채운 뒤 업로드하면 미분류 근거로 한 번에 등록됩니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-sm">download</span>양식 내려받기
          </button>
          <button
            type="button"
            onClick={() => excelFileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>엑셀 업로드
          </button>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx"
            aria-label="엑셀 파일"
            className="hidden"
            onChange={(e) => void uploadExcel(e)}
          />
        </div>
        {excelMsg ? (
          <p role="status" aria-live="polite" className="text-xs font-medium text-emerald-500">
            {excelMsg}
          </p>
        ) : null}
        {excelErrors.length > 0 && (
          <div className="rounded-lg bg-red-500/5 px-3 py-2">
            <p className="text-xs font-semibold text-red-500">
              등록되지 않은 행 {excelErrors.length}건
            </p>
            <ul className="mt-1 max-h-40 overflow-y-auto">
              {excelErrors.slice(0, 20).map((err) => (
                <li key={err.rowNumber} className="text-xs text-sp-muted">
                  {err.rowNumber}행: {err.reason}
                </li>
              ))}
              {excelErrors.length > 20 ? (
                <li className="text-xs text-sp-muted">… 외 {excelErrors.length - 20}건</li>
              ) : null}
            </ul>
          </div>
        )}
      </div>
    </EvidenceDrawer>
  );
}
