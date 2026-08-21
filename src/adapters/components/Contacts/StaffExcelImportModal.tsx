import { useRef, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  parseStaffContactGrid,
  type StaffImportMode,
  type StaffImportResult,
} from '@domain/rules/staffContactImportRules';
/* eslint-disable no-restricted-imports */
import {
  exportStaffContactTemplate,
  parseStaffContactsFromExcel,
} from '@infrastructure/export/StaffContactExcel';
/* eslint-enable no-restricted-imports */

/** xlsx 버퍼를 파일로 저장 (Electron 저장 대화상자 우선, 웹은 브라우저 다운로드). */
async function downloadExcel(buffer: ArrayBuffer, fileName: string): Promise<void> {
  if (window.electronAPI) {
    const saved = await window.electronAPI.showSaveDialog({
      title: '교직원 연락처 양식 저장',
      defaultPath: fileName,
      filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
    });
    if (saved) await window.electronAPI.writeFile(saved.handle, buffer);
    return;
  }
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

interface StaffExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 확인을 누르면 실행. 실제로 반영된 인원 수를 돌려준다. */
  onImport: (result: StaffImportResult, mode: StaffImportMode) => Promise<number>;
  /** 지금 등록된 인원 수 — "전체 교체"가 몇 명을 지우는지 알려주기 위해 */
  existingCount: number;
}

export function StaffExcelImportModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: StaffExcelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<StaffImportResult | null>(null);
  const [mode, setMode] = useState<StaffImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  /**
   * 끌어다 놓기 중인지 세는 값.
   *
   * dragenter/dragleave 는 자식 요소를 지날 때마다 번갈아 발사돼서 테두리가 깜빡인다.
   * 들어온 횟수를 세서 0이 될 때만 해제한다.
   */
  const dragDepth = useRef(0);
  const show = useToastStore((s) => s.show);

  const reset = (): void => {
    setFileName('');
    setResult(null);
    setMode('merge');
    setDragging(false);
    dragDepth.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const handleTemplate = async (): Promise<void> => {
    try {
      await downloadExcel(await exportStaffContactTemplate(), '교직원_연락처_양식.xlsx');
    } catch {
      show('양식을 만들지 못했습니다', 'error');
    }
  };

  const readFile = async (file: File): Promise<void> => {
    if (!/\.xlsx?$/i.test(file.name)) {
      show('엑셀 파일(.xlsx)만 올릴 수 있습니다', 'error');
      return;
    }
    setBusy(true);
    try {
      const grid = await parseStaffContactsFromExcel(await file.arrayBuffer());
      const parsed = parseStaffContactGrid(grid);
      setFileName(file.name);
      setResult(parsed);
    } catch {
      show('엑셀 파일을 읽지 못했습니다. 파일이 열려 있으면 닫고 다시 시도해주세요.', 'error');
      reset();
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    await readFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await readFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    if (result === null || result.summary.importable === 0) return;
    setBusy(true);
    try {
      const count = await onImport(result, mode);
      show(`교직원 ${count}명을 등록했습니다`, 'success');
      handleClose();
    } catch {
      show('등록 중 문제가 생겼습니다', 'error');
    } finally {
      setBusy(false);
    }
  };

  const headerMissing = result !== null && result.headerRowNumber === -1;
  const canImport = result !== null && !headerMissing && result.summary.importable > 0 && !busy;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="엑셀로 교직원 연락처 등록" size="lg">
      <div className="p-6 space-y-5">
        {/* 1단계 — 양식 */}
        <section className="rounded-xl border border-sp-border/50 bg-sp-surface/40 p-4">
          <p className="text-sp-text font-sp-medium text-sm mb-1">1. 양식 내려받기</p>
          <p className="text-sp-muted text-xs mb-3">
            처음이라면 빈 양식을 받아 채우세요. 이미 쓰던 명부 파일이 있으면 그대로 올려도 됩니다 —
            머리글 이름으로 알아서 찾습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleTemplate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-sp-surface border border-sp-border text-sp-text hover:border-sp-accent transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>빈 양식 받기
            (.xlsx)
          </button>
        </section>

        {/* 2단계 — 파일 선택 (끌어다 놓기 또는 고르기) */}
        <section className="rounded-xl border border-sp-border/50 bg-sp-surface/40 p-4">
          <p className="text-sp-text font-sp-medium text-sm mb-3">2. 파일 올리기</p>

          {/*
            브라우저 기본 파일 선택 버튼(`<input type="file">`)을 그대로 두지 않는다.
            기본 버튼은 우리 색이 먹지 않아 흰 바탕에 흰 글씨로 보이는 일이 있었고,
            쌤핀의 다른 업로드 20여 곳도 전부 기본 버튼을 숨기고 직접 만든 버튼을 쓴다.
          */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? 'border-sp-accent bg-sp-accent/10'
                : 'border-sp-border bg-sp-bg/30 hover:border-sp-accent/60'
            }`}
          >
            <span
              className={`material-symbols-outlined text-3xl ${
                dragging ? 'text-sp-accent' : 'text-sp-muted'
              }`}
            >
              upload_file
            </span>
            <p className="text-sp-text text-sm">
              {dragging ? '여기에 놓으세요' : '엑셀 파일을 이 자리에 끌어다 놓으세요'}
            </p>
            <p className="text-sp-muted text-xs">.xlsx 파일</p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void handleFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-sp-accent text-white hover:brightness-110 transition-all"
            >
              <span className="material-symbols-outlined text-base">folder_open</span>
              파일 고르기
            </button>
          </div>

          {fileName !== '' && (
            <p className="text-sp-muted text-xs mt-2 truncate">선택한 파일: {fileName}</p>
          )}
        </section>

        {/* 3단계 — 미리보기 */}
        {headerMissing && (
          <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm font-sp-medium mb-1">이름 열을 찾지 못했습니다</p>
            <p className="text-sp-muted text-xs">
              머리글에 &quot;이름&quot;(또는 성명·교사명)이 있는지 확인해주세요. 빈 양식을 받아
              쓰시면 가장 확실합니다.
            </p>
          </section>
        )}

        {result !== null && !headerMissing && (
          <section className="rounded-xl border border-sp-border/50 bg-sp-surface/40 p-4 space-y-3">
            <p className="text-sp-text font-sp-medium text-sm">3. 확인하고 등록</p>

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-emerald-400">등록 가능 {result.summary.importable}명</span>
              {result.summary.warningRows > 0 && (
                <span className="text-amber-400">확인 필요 {result.summary.warningRows}명</span>
              )}
              {result.summary.errorRows > 0 && (
                <span className="text-red-400">제외 {result.summary.errorRows}명</span>
              )}
            </div>

            {result.ignoredHeaders.length > 0 && (
              <p className="text-sp-muted text-xs">
                가져오지 않는 열: {result.ignoredHeaders.join(', ')}
              </p>
            )}

            {/* 문제가 있는 줄만 보여준다 — 정상인 줄까지 나열하면 오히려 안 읽는다. */}
            {result.rows.some((r) => r.issues.length > 0) && (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg bg-sp-bg/40 p-2">
                {result.rows
                  .filter((r) => r.issues.length > 0)
                  .map((r) => (
                    <div key={r.rowNumber} className="text-xs flex gap-2">
                      <span className="text-sp-muted shrink-0">{r.rowNumber}행</span>
                      <span className="text-sp-text truncate shrink-0 w-20">
                        {r.values.name === '' ? '(이름 없음)' : r.values.name}
                      </span>
                      <span className={r.importable ? 'text-amber-400' : 'text-red-400'}>
                        {r.issues.map((i) => i.message).join(' · ')}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="staff-import-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                  className="mt-1 accent-sp-accent"
                />
                <span className="text-sm text-sp-text">
                  기존 명부에 더하기
                  <span className="block text-xs text-sp-muted">
                    이름과 휴대폰이 모두 같으면 같은 사람으로 보고 내용을 새로 고칩니다.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="staff-import-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1 accent-sp-accent"
                />
                <span className="text-sm text-sp-text">
                  기존 명부를 통째로 바꾸기
                  <span className="block text-xs text-amber-400">
                    지금 등록된 {existingCount}명이 사라지고 파일 내용만 남습니다.
                  </span>
                </span>
              </label>
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!canImport}
            className="px-4 py-2 rounded-lg text-sm bg-sp-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            {busy ? '처리 중...' : '등록하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
