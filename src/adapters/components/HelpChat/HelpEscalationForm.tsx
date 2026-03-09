import { useState, useRef, useCallback, useEffect } from 'react';
import { validateImage } from './imageUtils';
import type { EscalationPayload } from './types';

const MAX_SCREENSHOTS = 3;

interface Props {
  readonly type: 'bug' | 'feature' | 'other';
  readonly onSubmit: (data: EscalationPayload, images?: File[]) => void;
  readonly onCancel: () => void;
  readonly disabled?: boolean;
}

const TYPE_INFO: Record<'bug' | 'feature' | 'other', { emoji: string; label: string; placeholder: string }> = {
  bug: {
    emoji: '🐛',
    label: '버그 신고',
    placeholder: '어떤 상황에서 문제가 발생했나요? 자세히 설명해 주세요.',
  },
  feature: {
    emoji: '💡',
    label: '기능 제안',
    placeholder: '어떤 기능이 있으면 좋겠나요? 자유롭게 작성해 주세요.',
  },
  other: {
    emoji: '💬',
    label: '기타 문의',
    placeholder: '궁금한 점을 자유롭게 작성해 주세요.',
  },
};

/** 에스컬레이션 폼 — 버그 신고, 기능 제안, 기타 문의 */
export function HelpEscalationForm({ type, onSubmit, onCancel, disabled }: Props) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const info = TYPE_INFO[type];

  // 미리보기 URL 생성/해제
  useEffect(() => {
    const urls = screenshots.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [screenshots]);

  const addScreenshots = useCallback((files: File[]) => {
    setScreenshots((prev) => {
      const remaining = MAX_SCREENSHOTS - prev.length;
      if (remaining <= 0) return prev;
      const validFiles: File[] = [];
      for (const f of files.slice(0, remaining)) {
        if (validateImage(f).valid) {
          validFiles.push(f);
        }
      }
      return [...prev, ...validFiles];
    });
  }, []);

  const removeScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit(
      {
        type,
        message: message.trim(),
        email: email.trim() || undefined,
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      },
      screenshots.length > 0 ? screenshots : undefined,
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addScreenshots(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const canAttach = screenshots.length < MAX_SCREENSHOTS;

  return (
    <form onSubmit={handleSubmit} className="border-t border-sp-border bg-sp-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-sp-text">
          {info.emoji} {info.label}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-sp-muted hover:text-sp-text"
        >
          취소
        </button>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={info.placeholder}
        maxLength={2000}
        rows={3}
        required
        disabled={disabled}
        className="mb-2 w-full resize-none rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
      />

      {/* 스크린샷 미리보기 */}
      {previews.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <div key={url} className="group relative">
              <img
                src={url}
                alt={screenshots[i]?.name ?? '스크린샷'}
                className="h-14 w-14 rounded-lg border border-sp-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeScreenshot(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="스크린샷 삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 스크린샷 첨부 버튼 */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || !canAttach}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-sp-border py-2 text-xs text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-text disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">add_photo_alternate</span>
        스크린샷 첨부 ({screenshots.length}/{MAX_SCREENSHOTS})
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="회신받을 이메일 (선택사항)"
        disabled={disabled}
        className="mb-3 w-full rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={disabled || !message.trim()}
        className="w-full rounded-lg bg-sp-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {disabled ? '전송 중...' : '개발자에게 전달하기'}
      </button>
    </form>
  );
}
