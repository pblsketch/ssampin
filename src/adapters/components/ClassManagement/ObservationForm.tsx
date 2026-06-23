import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useObservationAttachmentStore } from '@adapters/stores/useObservationAttachmentStore';
import {
  DEFAULT_OBSERVATION_TAGS,
  DEFAULT_OBSERVATION_CATEGORIES,
} from '@domain/entities/Observation';
import {
  OBSERVATION_ATTACHMENT_LIMITS,
  validateAttachmentFile,
  canAddAttachment,
  attachmentKindOf,
} from '@domain/rules/observationAttachmentRules';
import type { ObservationAttachmentSource } from '@domain/entities/ObservationAttachment';

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
  // 통합 입력 분류(S4) — ObservationRecord.category? 에 저장. tags 와 직교(P3). 기본 '수업 관찰'.
  const [selectedCategory, setSelectedCategory] = useState<string>(
    DEFAULT_OBSERVATION_CATEGORIES[0],
  );
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevStudentIdRef = useRef(studentId);
  const savingRef = useRef<string | null>(null);
  const dateRef = useRef(date);
  const contentRef = useRef(content);
  const tagsRef = useRef(selectedTags);
  const categoryRef = useRef(selectedCategory);
  const draftMapRef = useRef<Map<string, ObservationDraft>>(new Map());

  const addRecord = useObservationStore((s) => s.addRecord);
  const deleteRecord = useObservationStore((s) => s.deleteRecord);
  const customTags = useObservationStore((s) => s.customTags);
  const addCustomTag = useObservationStore((s) => s.addCustomTag);
  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);
  const customCategories = useObservationStore((s) => s.customCategories);
  const addCustomCategory = useObservationStore((s) => s.addCustomCategory);
  const allCategories = useMemo(
    () => [...DEFAULT_OBSERVATION_CATEGORIES, ...customCategories],
    [customCategories],
  );

  const addAttachment = useObservationAttachmentStore((s) => s.addAttachment);
  // 작성 중 담아두는 첨부(아직 미저장). '기록 저장' 또는 학생 전환 자동저장 시 생성된 기록에 커밋된다.
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; source: ObservationAttachmentSource }[]
  >([]);
  const pendingFilesRef = useRef<{ file: File; source: ObservationAttachmentSource }[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const pendingSourceRef = useRef<ObservationAttachmentSource>('teacher');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    tagsRef.current = selectedTags;
  }, [selectedTags]);

  useEffect(() => {
    categoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  // 생성된 기록에 대기 중 첨부를 커밋한다(개별 실패는 토스트로 안내, 나머지는 계속).
  const commitPendingAttachments = useCallback(
    async (
      recordId: string,
      files: { file: File; source: ObservationAttachmentSource }[],
    ): Promise<void> => {
      for (const { file, source } of files) {
        try {
          await addAttachment({ observationId: recordId, file, source });
        } catch (e) {
          useToastStore.getState().show(e instanceof Error ? e.message : '첨부 저장 실패', 'error');
        }
      }
    },
    [addAttachment],
  );

  const handleAddFiles = useCallback((files: File[], source: ObservationAttachmentSource) => {
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const f of files) {
        if (!canAddAttachment(next.length)) {
          useToastStore
            .getState()
            .show(
              `첨부는 관찰 1건당 최대 ${OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION}개까지 가능합니다.`,
              'error',
            );
          break;
        }
        const v = validateAttachmentFile(f.name, f.size);
        if (!v.ok) {
          useToastStore.getState().show(v.reason, 'error');
          continue;
        }
        next.push({ file: f, source });
      }
      return next;
    });
  }, []);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const openAttachPicker = useCallback((source: ObservationAttachmentSource) => {
    pendingSourceRef.current = source;
    attachInputRef.current?.click();
  }, []);

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
        // 이전 학생의 대기 첨부를 캡처 후 즉시 비운다(학생 전환 race·중복 커밋 방지).
        const filesToCommit = pendingFilesRef.current;
        pendingFilesRef.current = [];
        addRecord({
          studentId: prevId,
          classId,
          date: savedDate,
          content: savedContent,
          tags: savedTags,
          category: categoryRef.current,
        })
          .then((recordId) => {
            void commitPendingAttachments(recordId, filesToCommit);
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
      setSelectedCategory(DEFAULT_OBSERVATION_CATEGORIES[0]);
      setPendingFiles([]);
      prevStudentIdRef.current = studentId;
    }

    textareaRef.current?.focus();
  }, [addRecord, classId, cleanupDrafts, deleteRecord, studentId, commitPendingAttachments]);

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
      const recordId = await addRecord({
        studentId,
        classId,
        date,
        content: trimmed.slice(0, 500),
        tags: selectedTags,
        category: selectedCategory,
      });
      await commitPendingAttachments(recordId, pendingFilesRef.current);
      pendingFilesRef.current = [];
      draftMapRef.current.delete(studentId);
      setContent('');
      setSelectedTags([]);
      setSelectedCategory(DEFAULT_OBSERVATION_CATEGORIES[0]);
      setDate(todayString());
      setPendingFiles([]);
    } finally {
      setSaving(false);
    }
  }, [
    content,
    date,
    selectedTags,
    selectedCategory,
    studentId,
    classId,
    addRecord,
    commitPendingAttachments,
  ]);

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

      {/* 분류 (S4 통합 입력 — 단일 선택, 태그와 별도 축. 사용자 추가 가능) */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-caption text-sp-muted mr-0.5">분류</span>
        {allCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            aria-pressed={selectedCategory === cat}
            className={`px-2 py-0.5 rounded-full text-caption font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {cat}
          </button>
        ))}
        <input
          type="text"
          value={newCategoryInput}
          onChange={(e) => setNewCategoryInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = newCategoryInput.trim();
              if (!v) return;
              void addCustomCategory(v);
              setSelectedCategory(v);
              setNewCategoryInput('');
            }
          }}
          placeholder="+ 분류"
          aria-label="분류 직접 추가"
          className="w-16 px-2 py-0.5 rounded-full text-caption bg-sp-surface border border-dashed border-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent focus:w-24 transition-all"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
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
        <input
          type="text"
          value={newTagInput}
          onChange={(e) => setNewTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = newTagInput.trim();
              if (!v) return;
              if (!allTags.includes(v)) void addCustomTag(v);
              if (!selectedTags.includes(v)) toggleTag(v);
              setNewTagInput('');
            }
          }}
          placeholder="+ 태그"
          aria-label="태그 직접 추가"
          className="w-16 px-2 py-0.5 rounded-full text-caption bg-sp-surface border border-dashed border-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent focus:w-24 transition-all"
        />
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

      {/* 첨부 자료 (작성 중 담아두고 저장 시 함께 커밋) */}
      <div
        className={`rounded-lg border border-dashed px-2 py-1.5 transition-colors ${
          dragOver ? 'border-sp-accent bg-sp-accent/5' : 'border-sp-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleAddFiles(e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [], 'teacher');
        }}
      >
        {pendingFiles.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {pendingFiles.map((p, i) => (
              <span
                key={`${p.file.name}-${i}`}
                className="flex items-center gap-1 rounded-lg border border-sp-border bg-sp-bg px-2 py-0.5 text-caption text-sp-text"
              >
                <span className="material-symbols-outlined text-sm text-sp-accent">
                  {attachmentKindOf(p.file.name) === 'image' ? 'image' : 'description'}
                </span>
                <span className="max-w-[120px] truncate">{p.file.name}</span>
                {p.source === 'student' && (
                  <span className="rounded-full bg-sp-accent/10 px-1 text-[9px] text-sp-accent">
                    학생
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="text-sp-muted hover:text-red-400"
                  aria-label="첨부 제거"
                >
                  <span className="material-symbols-outlined text-icon">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={attachInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            handleAddFiles(files, pendingSourceRef.current);
            e.target.value = '';
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openAttachPicker('teacher')}
            className="flex items-center gap-1 text-caption text-sp-muted hover:text-sp-accent"
          >
            <span className="material-symbols-outlined text-sm">attach_file</span>내 자료
          </button>
          <button
            type="button"
            onClick={() => openAttachPicker('student')}
            className="flex items-center gap-1 text-caption text-sp-muted hover:text-sp-accent"
          >
            <span className="material-symbols-outlined text-sm">backpack</span>학생 제출물
          </button>
          <span className="ml-auto text-[10px] text-sp-muted/70">이미지·문서 끌어다 놓기</span>
        </div>
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={!content.trim() || saving}
        className="w-full py-1.5 bg-sp-accent text-white text-xs font-medium rounded-lg hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
      >
        {saving
          ? '저장 중...'
          : pendingFiles.length > 0
            ? `기록 저장 (자료 ${pendingFiles.length}개 포함)`
            : '기록 저장 (Ctrl+Enter)'}
      </button>
    </div>
  );
}
