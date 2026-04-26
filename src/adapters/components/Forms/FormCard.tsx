import { useEffect, useRef, useState } from 'react';
import type { FormTemplate, FormFormat } from '@domain/entities/FormTemplate';
import { useFormStore } from '@adapters/stores/useFormStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { formRepository } from '@adapters/di/container';

interface FormCardProps {
  readonly form: FormTemplate;
}

const FORMAT_STYLES: Readonly<Record<FormFormat, { label: string; badge: string; iconBg: string; icon: string }>> = {
  hwpx:  { label: 'HWPX',  badge: 'bg-sp-accent/20 text-sp-accent border border-sp-accent/30',           iconBg: 'bg-gradient-to-br from-sp-accent/30 to-sp-accent/10',           icon: 'description' },
  pdf:   { label: 'PDF',   badge: 'bg-sp-highlight/20 text-sp-highlight border border-sp-highlight/30', iconBg: 'bg-gradient-to-br from-sp-highlight/30 to-sp-highlight/10',   icon: 'picture_as_pdf' },
  excel: { label: 'Excel', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',    iconBg: 'bg-gradient-to-br from-emerald-500/30 to-emerald-500/10',      icon: 'table_chart' },
};

/** 포맷별 액션 버튼 라벨·아이콘: PDF는 직접 인쇄, 그 외는 연결 프로그램에서 열기 */
function getActionUI(format: FormFormat): { label: string; icon: string } {
  if (format === 'pdf') return { label: '바로 인쇄', icon: 'print' };
  if (format === 'hwpx') return { label: '한글에서 열기', icon: 'open_in_new' };
  return { label: 'Excel에서 열기', icon: 'open_in_new' };
}

export function FormCard({ form }: FormCardProps) {
  const select = useFormStore((s) => s.select);
  const toggleStar = useFormStore((s) => s.toggleStar);
  const printFormAction = useFormStore((s) => s.printFormAction);
  const downloadForm = useFormStore((s) => s.downloadForm);
  const removeForm = useFormStore((s) => s.removeForm);
  const updateFormAction = useFormStore((s) => s.updateFormAction);
  const categories = useFormStore((s) => s.categories);
  const showToast = useToastStore((s) => s.show);

  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (form.format !== 'pdf' || !form.thumbnailPath) return;

    void (async () => {
      try {
        const bytes = await formRepository.readThumbnail(form.id);
        if (cancelled || !bytes) return;
        const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setThumbUrl(url);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [form.id, form.format, form.thumbnailPath]);

  const style = FORMAT_STYLES[form.format];
  const category = categories.find((c) => c.id === form.categoryId);

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      showToast(
        err instanceof Error ? err.message : '여는 데 실패했습니다',
        'error',
      );
    }
  };

  const actionUI = getActionUI(form.format);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadForm(form.id);
      showToast('다운로드를 시작합니다', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '다운로드에 실패했습니다',
        'error',
      );
    }
  };

  const handleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleStar(form.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (form.isBuiltin) return;
    if (!window.confirm(`"${form.name}" 서식을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await removeForm(form.id);
      showToast('서식을 삭제했습니다', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '삭제에 실패했습니다',
        'error',
      );
    }
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const next = window.prompt('새 이름', form.name);
    if (!next || next.trim() === '' || next === form.name) return;
    try {
      await updateFormAction(form.id, { name: next.trim() });
      showToast('이름을 변경했습니다', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '이름 변경에 실패했습니다',
        'error',
      );
    }
  };

  return (
    <div
      onClick={() => select(form.id)}
      className="group bg-sp-card border border-sp-border rounded-xl overflow-hidden cursor-pointer hover:border-sp-accent/50 transition-colors"
    >
      <div className={`aspect-[4/3] relative ${style.iconBg} flex items-center justify-center`}>
        {form.format === 'pdf' && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={form.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-3 text-center">
            <span className="material-symbols-outlined text-5xl text-sp-text/80 mb-2">
              {style.icon}
            </span>
            {form.textPreview && (
              <p className="text-caption text-sp-text/70 leading-tight line-clamp-2 px-2">
                {form.textPreview}
              </p>
            )}
          </div>
        )}

        {form.isBuiltin && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sp-bg/80 text-sp-muted text-caption border border-sp-border">
            <span className="material-symbols-outlined text-xs">lock</span>
            기본
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="text-sm font-semibold text-sp-text truncate" title={form.name}>
          {form.name}
        </h3>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {category && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-caption bg-sp-bg text-sp-muted border border-sp-border">
              <span className="material-symbols-outlined text-detail">{category.icon}</span>
              {category.name}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-caption ${style.badge}`}>
            {style.label}
          </span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-sp-border">
          <button
            type="button"
            onClick={handleStar}
            title={form.starred ? '즐겨찾기 해제' : '즐겨찾기'}
            className={`p-1.5 rounded-lg hover:bg-sp-bg ${form.starred ? 'text-sp-highlight' : 'text-sp-muted'}`}
          >
            <span className="material-symbols-outlined text-base">
              {form.starred ? 'star' : 'star_outline'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="다운로드"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-bg"
          >
            <span className="material-symbols-outlined text-base">download</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            title={actionUI.label}
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-bg"
          >
            <span className="material-symbols-outlined text-base">{actionUI.icon}</span>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-bg"
              title="더보기"
            >
              <span className="material-symbols-outlined text-base">more_vert</span>
            </button>
            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-full mb-1 w-32 bg-sp-surface border border-sp-border rounded-lg shadow-lg overflow-hidden z-10"
              >
                <button
                  type="button"
                  onClick={handleRename}
                  className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-sp-bg"
                >
                  이름 변경
                </button>
                <button
                  type="button"
                  disabled={form.isBuiltin}
                  onClick={handleDelete}
                  className={`w-full text-left px-3 py-1.5 text-xs ${
                    form.isBuiltin
                      ? 'text-sp-muted/50 cursor-not-allowed'
                      : 'text-red-400 hover:bg-sp-bg'
                  }`}
                  title={form.isBuiltin ? '내장 서식은 삭제할 수 없습니다' : undefined}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
