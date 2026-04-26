import type { ExportFormat, ExportItem } from './Export';
import { PdfCanvasPreview } from './PdfCanvasPreview';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface ExportPreviewModalProps {
    items: Set<ExportItem>;
    format: ExportFormat;
    onConfirm: () => void;
    onCancel: () => void;
    isExporting: boolean;
    /** PDF 포맷일 때만 사용. 프리뷰 캡처 결과 바이트. null 이면 캡처 중. */
    pdfPreviewBytes?: ArrayBuffer | null;
}

export function ExportPreviewModal({
    items,
    format,
    onConfirm,
    onCancel,
    isExporting,
    pdfPreviewBytes,
}: ExportPreviewModalProps) {
    const itemsList = Array.from(items).map(item => {
        switch (item) {
            case 'classSchedule': return '학급 시간표';
            case 'teacherSchedule': return '교사 시간표';
            case 'seating': return '학급 자리 배치도';
            case 'events': return '학교 일정';
            case 'studentRecords': return '담임 메모';
            default: return item;
        }
    });

    const placeholderMessage =
        format === 'pdf'
            ? '현재 화면이 그대로 PDF 로 저장됩니다.'
            : format === 'excel'
                ? '선택 항목의 데이터가 xlsx 시트에 자동 정리됩니다.'
                : '선택 항목의 데이터가 hwpx 양식에 채워집니다.';

    return (
        <Modal
            isOpen
            onClose={isExporting ? () => undefined : onCancel}
            title="내보내기 미리보기"
            srOnlyTitle
            size="xl"
            closeOnBackdrop={false}
            closeOnEsc={!isExporting}
        >
            <div className="flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border bg-sp-card">
                    <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
                        <span className="material-symbols-outlined text-sp-accent">preview</span>
                        내보내기 미리보기
                    </h3>
                    <IconButton
                        icon="close"
                        label="닫기"
                        variant="ghost"
                        size="md"
                        onClick={onCancel}
                        disabled={isExporting}
                    />
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto bg-sp-bg/50">
                    <div className="bg-white rounded-lg p-6 shadow-inner min-h-[400px] flex flex-col border border-slate-300 relative">

                        <div className="text-center mb-6 border-b pb-4 border-slate-200">
                            <h1 className="text-xl font-bold text-slate-800 mb-2">문서 미리보기</h1>
                            <p className="text-slate-500 font-medium text-sm">포함된 항목: {itemsList.join(', ')}</p>
                            <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-slate-100 rounded-full text-slate-600 text-sm font-semibold">
                                <span className="material-symbols-outlined text-icon">insert_drive_file</span>
                                포맷: {format.toUpperCase()}
                            </div>
                        </div>

                        {format === 'pdf' ? (
                            <div className="flex-1 flex items-center justify-center p-2 bg-slate-50 rounded-lg">
                                <PdfCanvasPreview pdfBytes={pdfPreviewBytes ?? null} maxSize={520} />
                            </div>
                        ) : (
                            <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-50">
                                <span className="material-symbols-outlined text-6xl mb-4 text-slate-300">
                                    {format === 'excel' ? 'table_view' : 'description'}
                                </span>
                                <p className="font-medium text-center">{placeholderMessage}</p>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sp-border bg-sp-card">
                    <button
                        onClick={onCancel}
                        disabled={isExporting}
                        className="px-5 py-2.5 rounded-lg font-medium text-sp-text hover:bg-sp-surface transition-colors disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-sp-accent hover:bg-sp-accent/90 text-sp-accent-fg font-bold shadow-sp-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-icon-lg">progress_activity</span>
                                저장 중...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-icon-lg">save</span>
                                이대로 내보내기
                            </>
                        )}
                    </button>
                </div>

            </div>
        </Modal>
    );
}
