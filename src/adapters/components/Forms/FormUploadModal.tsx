import { useRef, useState } from 'react';
import type { FormFormat } from '@domain/entities/FormTemplate';
import { useFormStore } from '@adapters/stores/useFormStore';
import { useToastStore } from '@adapters/components/common/Toast';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function detectFormat(filename: string): FormFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.hwpx')) return 'hwpx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.xlsx')) return 'excel';
  return null;
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function guessCategory(name: string): string {
  if (/상담/.test(name)) return 'builtin:counseling';
  if (/(가정|안내|통신)/.test(name)) return 'builtin:parent-notice';
  if (/(시간표|출석|생활)/.test(name)) return 'builtin:life-record';
  if (/(성적|평가|채점)/.test(name)) return 'builtin:grade-eval';
  if (/(공문|결재)/.test(name)) return 'builtin:official-doc';
  return 'builtin:other';
}

export function FormUploadModal() {
  const categories = useFormStore((s) => s.categories);
  const createFormAction = useFormStore((s) => s.createFormAction);
  const closeUpload = useFormStore((s) => s.closeUpload);
  const showToast = useToastStore((s) => s.show);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<FormFormat | null>(null);
  const [categoryId, setCategoryId] = useState('builtin:other');
  const [tagsText, setTagsText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const fmt = detectFormat(f.name);
    if (!fmt) {
      showToast('지원하지 않는 파일 형식입니다 (HWPX, PDF, Excel만 가능)', 'error');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      showToast('파일 크기가 10MB를 초과합니다', 'error');
      return;
    }
    setFile(f);
    setFormat(fmt);
    const stripped = stripExt(f.name);
    setName(stripped);
    setCategoryId(guessCategory(stripped));
  };

  const handleSubmit = async () => {
    if (!file || !format) return;
    if (file.size > MAX_SIZE_BYTES) {
      showToast('파일 크기가 10MB를 초과합니다', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('이름을 입력해 주세요', 'error');
      return;
    }
    try {
      setSubmitting(true);
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      await createFormAction({
        name: name.trim(),
        format,
        categoryId,
        tags,
        fileBytes: bytes,
      });
      showToast('서식이 등록되었습니다', 'success');
      closeUpload();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '등록에 실패했습니다',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={closeUpload}
    >
      <div
        className="bg-sp-surface border border-sp-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-sp-border">
          <h2 className="text-lg font-bold text-sp-text">서식 등록</h2>
          <button
            type="button"
            onClick={closeUpload}
            className="text-sp-muted hover:text-sp-text p-1 rounded-lg hover:bg-sp-bg"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-sp-accent bg-sp-accent/5'
                : 'border-sp-border bg-sp-card/50 hover:border-sp-accent/50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".hwpx,.pdf,.xlsx"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <span className="material-symbols-outlined text-4xl text-sp-muted">
              upload_file
            </span>
            <p className="text-sm text-sp-text mt-2">
              {file ? file.name : '파일을 끌어다 놓거나 클릭해서 선택하세요'}
            </p>
            <p className="text-xs text-sp-muted mt-1">
              HWPX · PDF · Excel (최대 10MB)
            </p>
          </div>

          {file && (
            <>
              <div>
                <label className="block text-xs font-semibold text-sp-muted mb-1">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-sp-card border border-sp-border rounded-lg text-sm text-sp-text focus:outline-none focus:border-sp-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-sp-muted mb-1">카테고리</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-sp-card border border-sp-border rounded-lg text-sm text-sp-text focus:outline-none focus:border-sp-accent"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-sp-muted mb-1">
                  태그 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="예: 1학기, 중간고사"
                  className="w-full px-3 py-2 bg-sp-card border border-sp-border rounded-lg text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                />
              </div>
            </>
          )}
        </div>

        <footer className="p-4 border-t border-sp-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeUpload}
            className="px-4 py-2 bg-sp-card text-sp-muted border border-sp-border rounded-lg text-sm hover:text-sp-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || submitting}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '등록 중...' : '등록'}
          </button>
        </footer>
      </div>
    </div>
  );
}
