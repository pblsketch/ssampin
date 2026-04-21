import { useEffect, useRef, useState } from 'react';
import type { FormFormat } from '@domain/entities/FormTemplate';
import { useFormStore } from '@adapters/stores/useFormStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { formRepository } from '@adapters/di/container';

const FORMAT_LABEL: Readonly<Record<FormFormat, string>> = {
  hwpx: 'HWPX',
  pdf: 'PDF',
  excel: 'Excel',
};

export function FormPreviewModal() {
  const selectedId = useFormStore((s) => s.selectedId);
  const forms = useFormStore((s) => s.forms);
  const categories = useFormStore((s) => s.categories);
  const select = useFormStore((s) => s.select);
  const printFormAction = useFormStore((s) => s.printFormAction);
  const downloadForm = useFormStore((s) => s.downloadForm);
  const toggleStar = useFormStore((s) => s.toggleStar);
  const removeForm = useFormStore((s) => s.removeForm);
  const showToast = useToastStore((s) => s.show);

  const form = forms.find((f) => f.id === selectedId) ?? null;

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!form || form.format !== 'pdf' || !form.thumbnailPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const bytes = await formRepository.readThumbnail(form.id);
        if (cancelled || !bytes) return;
        const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setThumbUrl(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [form]);

  if (!form) return null;

  const category = categories.find((c) => c.id === form.categoryId);

  const handleClose = () => select(null);

  const handlePrint = async () => {
    try {
      const format = await printFormAction(form.id);
      if (format === 'pdf') {
        showToast('인쇄 대화상자를 여는 중입니다', 'success');
      } else if (format === 'hwpx') {
        showToast('한글에서 열었어요. Ctrl+P로 인쇄하세요', 'success');
      } else {
        showToast('Excel에서 열었어요. Ctrl+P로 인쇄하세요', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '여는 데 실패', 'error');
    }
  };

  const actionLabel = form.format === 'pdf' ? '바로 인쇄' : form.format === 'hwpx' ? '한글에서 열기' : 'Excel에서 열기';
  const actionIcon = form.format === 'pdf' ? 'print' : 'open_in_new';

  const handleDownload = async () => {
    try {
      await downloadForm(form.id);
      showToast('다운로드를 시작합니다', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '다운로드 실패', 'error');
    }
  };

  const handleDelete = async () => {
    if (form.isBuiltin) return;
    if (!window.confirm(`"${form.name}" 서식을 삭제할까요?`)) return;
    try {
      await removeForm(form.id);
      showToast('서식을 삭제했습니다', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '삭제 실패', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-sp-surface border border-sp-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between p-4 border-b border-sp-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-sp-text truncate">{form.name}</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-sp-muted">
              <span>{FORMAT_LABEL[form.format]}</span>
              {category && (
                <>
                  <span>·</span>
                  <span>{category.name}</span>
                </>
              )}
              {form.isBuiltin && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">lock</span>
                    기본
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-sp-muted hover:text-sp-text p-1 rounded-lg hover:bg-sp-bg"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-sp-card border border-sp-border rounded-lg p-4 min-h-[200px] flex items-center justify-center">
            {form.format === 'pdf' && thumbUrl ? (
              <img src={thumbUrl} alt={form.name} className="max-h-[400px] object-contain" />
            ) : (
              <div className="text-center text-sp-muted text-sm whitespace-pre-wrap">
                {form.textPreview || '미리보기를 표시할 수 없습니다'}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-sp-muted uppercase tracking-wide mb-2">
              감지된 플레이스홀더
            </h3>
            {form.mergeFields.length === 0 ? (
              <p className="text-sm text-sp-muted">감지된 플레이스홀더가 없습니다</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {form.mergeFields.map((field) => (
                  <span
                    key={field.placeholder}
                    className="px-2 py-0.5 rounded bg-sp-card text-xs text-sp-text border border-sp-border"
                  >
                    {field.placeholder}
                  </span>
                ))}
              </div>
            )}
          </div>

          {form.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sp-muted uppercase tracking-wide mb-2">
                태그
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-sp-card text-xs text-sp-muted border border-sp-border">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-sp-border flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/90"
          >
            <span className="material-symbols-outlined text-base">download</span>
            다운로드
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sp-card text-sp-text rounded-lg text-sm border border-sp-border hover:bg-sp-bg"
          >
            <span className="material-symbols-outlined text-base">{actionIcon}</span>
            {actionLabel}
          </button>
          <button
            type="button"
            disabled
            title="Phase 3에서 제공"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sp-card text-sp-muted rounded-lg text-sm border border-sp-border cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">group</span>
            학생 데이터 채우기
          </button>
          <button
            type="button"
            onClick={() => toggleStar(form.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
              form.starred
                ? 'bg-sp-highlight/20 text-sp-highlight border-sp-highlight/40'
                : 'bg-sp-card text-sp-muted border-sp-border hover:text-sp-text'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {form.starred ? 'star' : 'star_outline'}
            </span>
            즐겨찾기
          </button>
          <button
            type="button"
            disabled={form.isBuiltin}
            onClick={handleDelete}
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
              form.isBuiltin
                ? 'bg-sp-card text-sp-muted/50 border-sp-border cursor-not-allowed'
                : 'bg-sp-card text-red-400 border-sp-border hover:bg-red-500/10'
            }`}
            title={form.isBuiltin ? '내장 서식은 삭제할 수 없습니다' : undefined}
          >
            <span className="material-symbols-outlined text-base">delete</span>
            삭제
          </button>
        </footer>
      </div>
    </div>
  );
}
