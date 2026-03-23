import { useState, useMemo } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';

/* ──────────────────────── Types ──────────────────────── */

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportRow {
  [key: string]: string | number | boolean | undefined;
}

export interface ExportModalProps {
  title: string;
  columns: readonly ExportColumn[];
  rows: readonly ExportRow[];
  onClose: () => void;
  /** 파일명 (확장자 제외) */
  fileName?: string;
}

type ExportTab = 'clipboard' | 'csv';

/* ──────────────────────── 컴포넌트 ──────────────────────── */

export function ExportModal({ title, columns, rows, onClose, fileName = 'export' }: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<ExportTab>('clipboard');
  const showToast = useToastStore((s) => s.show);

  const tsvText = useMemo(() => {
    const header = columns.map((c) => c.label).join('\t');
    const body = rows.map((row) =>
      columns.map((c) => String(row[c.key] ?? '')).join('\t'),
    );
    return [header, ...body].join('\n');
  }, [columns, rows]);

  const csvText = useMemo(() => {
    const escape = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const header = columns.map((c) => escape(c.label)).join(',');
    const body = rows.map((row) =>
      columns.map((c) => escape(String(row[c.key] ?? ''))).join(','),
    );
    return [header, ...body].join('\n');
  }, [columns, rows]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tsvText);
      showToast('클립보드에 복사했습니다 (엑셀에 붙여넣기 가능)', 'success');
    } catch {
      showToast('클립보드 복사에 실패했습니다', 'error');
    }
  };

  const handleDownload = () => {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 파일을 다운로드했습니다', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} aria-hidden="true">
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-homeroom-export"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-sp-border">
          <h3 id="modal-title-homeroom-export" className="text-lg font-bold text-sp-text">{title}</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 px-5 pt-4">
          <button
            onClick={() => setActiveTab('clipboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'clipboard' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            📋 클립보드
          </button>
          <button
            onClick={() => setActiveTab('csv')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'csv' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            📄 CSV 다운로드
          </button>
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-auto p-5">
          <div className="text-xs text-sp-muted mb-2">
            미리보기 ({rows.length}행)
          </div>
          <div className="bg-sp-surface rounded-lg p-3 overflow-x-auto max-h-60">
            <table className="text-xs text-sp-text w-full">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="text-left px-2 py-1 text-sp-muted font-medium whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t border-sp-border/50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-2 py-1 whitespace-nowrap">
                        {String(row[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-sp-muted text-center mt-2">
                ... 외 {rows.length - 10}행
              </p>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="p-5 border-t border-sp-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            닫기
          </button>
          {activeTab === 'clipboard' ? (
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>
              복사하기
            </button>
          ) : (
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">download</span>
              다운로드
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
