'use client';

import { useState } from 'react';
import type { EscalationData } from '../../types/chat';

interface Props {
  type: 'bug' | 'feature' | 'other';
  onSubmit: (data: Omit<EscalationData, 'sessionId'>) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const TYPE_INFO: Record<string, { emoji: string; label: string; placeholder: string }> = {
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

export default function EscalationForm({ type, onSubmit, onCancel, disabled }: Props) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  const info = TYPE_INFO[type] ?? TYPE_INFO.other;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit({
      type,
      message: message.trim(),
      email: email.trim() || undefined,
    });
  };

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
        className="w-full rounded-lg bg-sp-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sp-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {disabled ? '전송 중...' : '개발자에게 전달하기'}
      </button>
    </form>
  );
}
