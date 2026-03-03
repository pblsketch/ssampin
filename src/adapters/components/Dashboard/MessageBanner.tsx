import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';

export function MessageBanner() {
  const { message, setMessage } = useMessageStore();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(message);
    setIsEditing(true);
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  async function confirmEdit() {
    const trimmed = draft.trim();
    await setMessage(trimmed);
    setIsEditing(false);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      void confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  return (
    <div
      className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-4 max-w-2xl w-full cursor-pointer"
      onClick={!isEditing ? startEdit : undefined}
      role={!isEditing ? 'button' : undefined}
      tabIndex={!isEditing ? 0 : undefined}
      onKeyDown={
        !isEditing
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') startEdit();
            }
          : undefined
      }
      aria-label={!isEditing ? '메시지 편집' : undefined}
    >
      <div className="bg-emerald-500 rounded-full p-2 text-white flex shrink-0">
        <span className="material-symbols-outlined text-xl">verified</span>
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => void confirmEdit()}
            placeholder="오늘의 메시지를 입력하세요..."
            className="w-full bg-transparent text-emerald-200 font-bold text-lg outline-none placeholder:text-emerald-400/50"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <h3 className="text-emerald-400 font-bold text-lg leading-snug">
              {message !== '' ? message : '클릭하여 메시지를 입력하세요...'}
            </h3>
            {message === '' && (
              <p className="text-emerald-400/80 text-sm">오늘의 한마디를 남겨보세요</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
