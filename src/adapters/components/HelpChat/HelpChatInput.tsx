import { useState, useRef, useCallback, useEffect } from 'react';
import { validateImage, getImageFromClipboard } from './imageUtils';

const MAX_IMAGES = 3;

interface Props {
  readonly onSend: (message: string, images?: File[]) => void;
  readonly disabled?: boolean;
  readonly onInputRef?: (el: HTMLTextAreaElement | null) => void;
}

/** 채팅 입력 컴포넌트 (이미지 첨부 지원) */
export function HelpChatInput({ onSend, disabled, onInputRef }: Props) {
  const [value, setValue] = useState('');
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 부모에 textarea ref 전달
  useEffect(() => {
    onInputRef?.(textareaRef.current);
  }, [onInputRef]);

  // 미리보기 URL 생성/해제
  useEffect(() => {
    const urls = attachedImages.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [attachedImages]);

  const addImages = useCallback((files: File[]) => {
    setAttachedImages((prev) => {
      const remaining = MAX_IMAGES - prev.length;
      if (remaining <= 0) return prev;
      const validFiles: File[] = [];
      for (const f of files.slice(0, remaining)) {
        const result = validateImage(f);
        if (result.valid) {
          validFiles.push(f);
        }
        // 유효하지 않은 파일은 무시 (UX: toast 대신 조용히 무시)
      }
      return [...prev, ...validFiles];
    });
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled) return;
    onSend(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
    setValue('');
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, attachedImages, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // 📎 클릭
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      addImages(Array.from(files));
    }
    // input 초기화 (같은 파일 재선택 가능)
    e.target.value = '';
  };

  // Ctrl+V 클립보드 붙여넣기
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const file = getImageFromClipboard(e.nativeEvent);
    if (file) {
      e.preventDefault();
      addImages([file]);
    }
  }, [addImages]);

  // 드래그&드롭
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      addImages(files);
    }
  }, [addImages]);

  const canAttach = attachedImages.length < MAX_IMAGES;

  return (
    <div
      ref={dropZoneRef}
      className={`border-t border-sp-border bg-sp-surface p-3 transition-colors ${dragOver ? 'bg-sp-accent/10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 이미지 미리보기 */}
      {previews.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <div key={url} className="group relative">
              <img
                src={url}
                alt={attachedImages[i]?.name ?? '첨부 이미지'}
                className="h-16 w-16 rounded-lg border border-sp-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-caption text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="이미지 삭제"
              >
                ×
              </button>
              <span className="absolute bottom-0 left-0 right-0 truncate rounded-b-lg bg-black/50 px-1 text-[0.5rem] text-white">
                {attachedImages[i]?.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 드래그 오버레이 */}
      {dragOver && (
        <div className="mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-sp-accent/50 bg-sp-accent/5 py-3 text-xs text-sp-accent">
          <span className="material-symbols-outlined mr-1 text-base">upload</span>
          이미지를 여기에 놓으세요 (최대 {MAX_IMAGES}장)
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 📎 첨부 버튼 */}
        <button
          type="button"
          onClick={handleAttachClick}
          disabled={disabled || !canAttach}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sp-muted transition-colors hover:bg-sp-card hover:text-sp-text disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="이미지 첨부"
          title={canAttach ? '이미지 첨부 (최대 3장)' : '이미지 첨부 한도 초과'}
        >
          <span className="material-symbols-outlined text-xl">attach_file</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="궁금한 점을 물어보세요..."
          disabled={disabled}
          rows={1}
          className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-sp-border bg-sp-card px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
        />

        <button
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachedImages.length === 0)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sp-accent text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="전송"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9z" />
          </svg>
        </button>
      </div>

      <p className="mt-1.5 text-center text-[0.6rem] text-sp-muted/60">
        AI가 부정확할 수 있어요. 중요한 내용은 확인해 주세요.
      </p>
    </div>
  );
}
