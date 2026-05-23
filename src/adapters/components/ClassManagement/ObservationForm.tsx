import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

const DRAFT_TTL_MS = 5 * 60 * 1000;
const DRAFT_LRU_MAX = 50;

interface ObservationFormProps {
  classId: string;
  studentId: string;
}

interface ObservationDraft {
  date: string;
  content: string;
  tags: string[];
  updatedAt: number;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDraftEmpty(draft: ObservationDraft): boolean {
  return !draft.content.trim() && draft.tags.length === 0 && draft.date === todayString();
}

export function ObservationForm({ classId, studentId }: ObservationFormProps) {
  const [date, setDate] = useState(todayString);
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevStudentIdRef = useRef(studentId);
  const savingRef = useRef<string | null>(null);
  const dateRef = useRef(date);
  const contentRef = useRef(content);
  const tagsRef = useRef(selectedTags);
  const draftMapRef = useRef<Map<string, ObservationDraft>>(new Map());

  const addRecord = useObservationStore((s) => s.addRecord);
  const deleteRecord = useObservationStore((s) => s.deleteRecord);
  const customTags = useObservationStore((s) => s.customTags);
  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    tagsRef.current = selectedTags;
  }, [selectedTags]);

  const cleanupDrafts = useCallback(() => {
    const now = Date.now();
    const entries = [...draftMapRef.current.entries()]
      .filter(([, draft]) => now - draft.updatedAt <= DRAFT_TTL_MS)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt);

    draftMapRef.current = new Map(entries.slice(0, DRAFT_LRU_MAX));
  }, []);

  const rememberDraft = useCallback(
    (targetStudentId: string, draft: Omit<ObservationDraft, 'updatedAt'>) => {
      const nextDraft: ObservationDraft = { ...draft, updatedAt: Date.now() };
      if (isDraftEmpty(nextDraft)) {
        draftMapRef.current.delete(targetStudentId);
      } else {
        draftMapRef.current.set(targetStudentId, nextDraft);
      }
      cleanupDrafts();
    },
    [cleanupDrafts],
  );

  useEffect(() => {
    const prevId = prevStudentIdRef.current;
    if (prevId !== studentId) {
      const savedDate = dateRef.current;
      const savedContent = contentRef.current.trim().slice(0, 500);
      const savedTags = [...tagsRef.current];

      if (savedContent && savingRef.current !== prevId) {
        savingRef.current = prevId;
        addRecord({
          studentId: prevId,
          classId,
          date: savedDate,
          content: savedContent,
          tags: savedTags,
        })
          .then((recordId) => {
            const draft = draftMapRef.current.get(prevId);
            if (
              draft &&
              draft.date === savedDate &&
              draft.content.trim().slice(0, 500) === savedContent &&
              draft.tags.join('\u0000') === savedTags.join('\u0000')
            ) {
              draftMapRef.current.delete(prevId);
            }
            useToastStore
              .getState()
              .show(
                '이전 학생 자동 저장됨',
                'success',
                { label: '실행 취소', onClick: () => void deleteRecord(recordId) },
                5000,
              );
          })
          .catch(() => {
            useToastStore.getState().show('자동 저장 실패. 내용을 복사해 두세요.', 'error');
          })
          .finally(() => {
            if (savingRef.current === prevId) savingRef.current = null;
          });
      }

      cleanupDrafts();
      const nextDraft = draftMapRef.current.get(studentId);
      setDate(nextDraft?.date ?? todayString());
      setContent(nextDraft?.content ?? '');
      setSelectedTags(nextDraft?.tags ?? []);
      prevStudentIdRef.current = studentId;
    }

    textareaRef.current?.focus();
  }, [addRecord, classId, cleanupDrafts, deleteRecord, studentId]);

  useEffect(() => {
    return () => {
      savingRef.current = null;
      draftMapRef.current.clear();
    };
  }, []);

  const handleDateChange = useCallback(
    (nextDate: string) => {
      setDate(nextDate);
      rememberDraft(studentId, {
        date: nextDate,
        content: contentRef.current,
        tags: tagsRef.current,
      });
    },
    [rememberDraft, studentId],
  );

  const handleContentChange = useCallback(
    (nextContent: string) => {
      setContent(nextContent);
      rememberDraft(studentId, {
        date: dateRef.current,
        content: nextContent,
        tags: tagsRef.current,
      });
    },
    [rememberDraft, studentId],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        const nextTags = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
        rememberDraft(studentId, {
          date: dateRef.current,
          content: contentRef.current,
          tags: nextTags,
        });
        return nextTags;
      });
    },
    [rememberDraft, studentId],
  );

  const handleSave = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addRecord({
        studentId,
        classId,
        date,
        content: trimmed.slice(0, 500),
        tags: selectedTags,
      });
      draftMapRef.current.delete(studentId);
      setContent('');
      setSelectedTags([]);
      setDate(todayString());
    } finally {
      setSaving(false);
    }
  }, [content, date, selectedTags, studentId, classId, addRecord]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave],
  );

  return (
    <div className="px-5 py-3 border-b border-sp-border space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
        />
        <div className="flex-1" />
        <span className="text-caption text-sp-muted">{content.length}/500</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-2 py-0.5 rounded-full text-caption font-medium transition-colors ${
              selectedTags.includes(tag)
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="관찰한 내용이나 학생부에 참고할 내용을 적어 주세요"
        maxLength={500}
        rows={3}
        className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted resize-none focus:outline-none focus:border-sp-accent"
      />

      <button
        onClick={() => void handleSave()}
        disabled={!content.trim() || saving}
        className="w-full py-1.5 bg-sp-accent text-white text-xs font-medium rounded-lg hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
      >
        {saving ? '저장 중...' : '기록 저장 (Ctrl+Enter)'}
      </button>
    </div>
  );
}
