import { useEffect } from 'react';
import type { ExportFormat, ExportItem } from './Export';

interface ExportPreviewModalProps {
    items: Set<ExportItem>;
    format: ExportFormat;
    onConfirm: () => void;
    onCancel: () => void;
    isExporting: boolean;
}

export function ExportPreviewModal({
    items,
    format,
    onConfirm,
    onCancel,
    isExporting,
}: ExportPreviewModalProps) {
    // ESC 키로 닫기
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isExporting) onCancel();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel, isExporting]);

    const itemsList = Array.from(items).map(item => {
        switch (item) {
            case 'classSchedule': return '학급 시간표';
            case 'teacherSchedule': return '교사 시간표';
            case 'seating': return '좌석 배치도';
            case 'events': return '학교 일정';
            default: return item;
        }
    });

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-sp-surface border border-sp-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border bg-sp-card">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-sp-accent">preview</span>
                        내보내기 미리보기
                    </h3>
                    <button
                        onClick={onCancel}
                        disabled={isExporting}
                        className="text-sp-muted hover:text-white transition-colors disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content (Mock Preview) */}
                <div className="p-6 flex-1 overflow-y-auto bg-slate-900/50">
                    <div className="bg-white rounded-lg p-8 shadow-inner min-h-[400px] flex flex-col border border-slate-300 relative">

                        <div className="text-center mb-8 border-b pb-4 border-slate-200">
                            <h1 className="text-2xl font-bold text-slate-800 mb-2">문서 미리보기</h1>
                            <p className="text-slate-500 font-medium">포함된 항목: {itemsList.join(', ')}</p>
                            <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-slate-100 rounded-full text-slate-600 text-sm font-semibold">
                                <span className="material-symbols-outlined text-[16px]">insert_drive_file</span>
                                포맷: {format.toUpperCase()}
                            </div>
                        </div>

                        <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-50">
                            <span className="material-symbols-outlined text-6xl mb-4 text-slate-300">
                                {format === 'excel' ? 'table_view' : format === 'hwpx' ? 'description' : 'picture_as_pdf'}
                            </span>
                            <p className="font-medium text-center">
                                실제 내보내기 시 선택한 템플릿과<br />
                                현재 데이터가 병합되어 저장됩니다.
                            </p>
                        </div>

                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sp-border bg-sp-card">
                    <button
                        onClick={onCancel}
                        disabled={isExporting}
                        className="px-5 py-2.5 rounded-lg font-medium text-sp-text hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-sp-accent hover:bg-sp-accent/90 text-white font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                저장 중...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">save</span>
                                이대로 내보내기
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
