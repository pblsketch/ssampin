import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { VoiceTypingButton } from '@adapters/components/common/VoiceTypingButton';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import {
  isSplitWorthwhile,
  requestObservationSplit,
} from '@adapters/components/Assist/observationSplitRequest';
import { useToastStore } from '@adapters/components/common/Toast';
import { allSlotsForContext } from '@domain/rules/observationSlots';
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
import type { PendingAttachment } from '@adapters/components/ClassManagement/PendingAttachmentArea';
import {
  ObservationTopicPicker,
  type TopicSelection,
} from '@adapters/components/RecordDraft/ObservationTopicPicker';
import { teachingStudentRef } from '@domain/entities/RecordDraft';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import {
  commitObservationAttachments,
  keepFailed,
  newPendingKey,
  partialAttachmentMessage,
  type AttachmentCommitResult,
} from '@adapters/hooks/observationAttachmentCommit';

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
  /** 관찰 슬롯 — 학생을 왔다 갔다 해도 고른 장면이 살아 있어야 한다. */
  slots: string[];
  updatedAt: number;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDraftEmpty(draft: ObservationDraft): boolean {
  return (
    !draft.content.trim() &&
    draft.tags.length === 0 &&
    draft.slots.length === 0 &&
    draft.date === todayString()
  );
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
  // 쌤핀 AI 가 실험실에서 꺼져 있으면 "학생별로 나누기" 진입은 아예 그리지 않는다.
  const assistEnabled = useAssistStore((s) => s.enabled);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevStudentIdRef = useRef(studentId);
  const savingRef = useRef<string | null>(null);
  const dateRef = useRef(date);
  const contentRef = useRef(content);
  const tagsRef = useRef(selectedTags);
  const slotsRef = useRef<string[]>([]);
  const categoryRef = useRef(selectedCategory);
  const draftMapRef = useRef<Map<string, ObservationDraft>>(new Map());

  const addRecord = useObservationStore((s) => s.addRecord);
  const deleteRecord = useObservationStore((s) => s.deleteRecord);
  const customTags = useObservationStore((s) => s.customTags);
  const addCustomTag = useObservationStore((s) => s.addCustomTag);
  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);
  // 관찰 슬롯("어떤 장면인가") — 태그·분류와 직교하는 별개 축. 기본 6종 + 교사가 추가한 것.
  const customSlots = useObservationStore((s) => s.customSlots);
  const addCustomSlot = useObservationStore((s) => s.addCustomSlot);
  const allSlots = useMemo(() => allSlotsForContext('teaching', customSlots), [customSlots]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [newSlotInput, setNewSlotInput] = useState('');
  const customCategories = useObservationStore((s) => s.customCategories);
  const addCustomCategory = useObservationStore((s) => s.addCustomCategory);
  const allCategories = useMemo(
    () => [...DEFAULT_OBSERVATION_CATEGORIES, ...customCategories],
    [customCategories],
  );

  const addAttachment = useObservationAttachmentStore((s) => s.addAttachment);
  const ensureEvidenceFromSource = useRecordEvidenceStore((s) => s.ensureEvidenceFromSource);
  const moveToNewThread = useRecordEvidenceStore((s) => s.moveToNewThread);
  // 작성 중 담아두는 첨부(아직 미저장). '기록 저장' 또는 학생 전환 자동저장 시 생성된 기록에 커밋된다.
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const pendingFilesRef = useRef<PendingAttachment[]>([]);
  /**
   * 붙이지 못한 첨부를 **어느 학생의 어느 기록** 것인지와 함께 들고 있는다.
   * 학생을 넘긴 뒤 실패를 알게 되므로 현재 화면 학생이 아니다 — 맥락을 잃으면 남의 기록에 붙는다.
   */
  const attachmentRetryRef = useRef<
    Map<string, { readonly recordId: string; readonly items: readonly PendingAttachment[] }>
  >(new Map());
  const attachInputRef = useRef<HTMLInputElement>(null);
  const pendingSourceRef = useRef<ObservationAttachmentSource>('teacher');
  const [dragOver, setDragOver] = useState(false);
  /** 저장 시 이어 붙일 주제. 학생을 바꾸면 반드시 지운다 - 남의 학생 주제에 붙으면 사고다. */
  const [selectedTopic, setSelectedTopic] = useState<TopicSelection | null>(null);
  /** 분류·태그 접힘 상태. 기본은 접힌 상태다(본문을 먼저 쓰게 한다). */
  const [detailOpen, setDetailOpen] = useState(false);
  const topicStudentRef = teachingStudentRef(classId, studentId);

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
    slotsRef.current = selectedSlots;
  }, [selectedSlots]);

  useEffect(() => {
    categoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  // 생성된 기록에 대기 중 첨부를 커밋한다(개별 실패는 토스트로 안내, 나머지는 계속).
  /**
   * 대기 첨부를 저장된 기록에 붙이고 **파일별 결과**를 돌려준다.
   * 실패를 토스트로만 흘리고 void 를 반환하면 화면이 "3개 중 2개만 붙었다"를 알 수 없다(계획 §5.1-2).
   */
  const commitPendingAttachments = useCallback(
    async (
      recordId: string,
      files: readonly PendingAttachment[],
    ): Promise<AttachmentCommitResult> =>
      commitObservationAttachments(recordId, files, addAttachment),
    [addAttachment],
  );

  /**
   * 붙지 못한 첨부만 **원래 기록에** 다시 붙인다. 새 기록을 만들지 않는다 —
   * 확보한 recordId 로 그 단계부터 이어서 시도하는 것이 재시도의 뜻이다(계획 §5.1-8).
   */
  /**
   * 저장된 원본을 근거로 올리고 고른 주제에 잇는다.
   *
   * ★원본 저장이 성공한 뒤에만 부른다(계획 §5.1-1). 연결이 실패해도 **원본은 되돌리지 않는다** -
   *   되돌리면 교사가 쓴 기록이 사라진다. 연결만 다시 하면 되는 일이다.
   * ★새 주제는 여기서 처음 만들어진다. 고를 때는 이름만 들고 있었다(확정 전 저장소 쓰기 0회).
   */
  const linkSavedRecordToTopic = useCallback(
    async (
      recordId: string,
      savedContent: string,
      savedSlots: readonly string[],
      savedDate: string,
    ): Promise<void> => {
      const topic = selectedTopic;
      if (topic === null) return;
      try {
        const { evidenceId } = await ensureEvidenceFromSource({
          studentRef: topicStudentRef,
          areas: [],
          content: savedContent,
          sourceType: 'observation',
          sourceId: recordId,
          classId,
          date: savedDate,
          ...(savedSlots.length > 0 ? { slots: [...savedSlots] } : {}),
          ...(topic.kind === 'existing' ? { threadId: topic.threadId } : {}),
        });
        if (topic.kind === 'new') {
          // 주제 생성 + 이동 + 실패 시 보상까지 한 동작으로 처리하는 관문을 그대로 쓴다.
          await moveToNewThread({
            studentRef: topicStudentRef,
            evidenceIds: [evidenceId],
            title: topic.title,
            classId,
          });
        }
      } catch (e) {
        useToastStore
          .getState()
          .show(
            e instanceof Error
              ? `기록은 저장됐습니다 · ${e.message}`
              : '기록은 저장됐지만 주제에 연결하지 못했습니다',
            'error',
          );
      }
    },
    [selectedTopic, topicStudentRef, classId, ensureEvidenceFromSource, moveToNewThread],
  );

  const retryFailedAttachments = useCallback(
    async (ownerStudentId: string): Promise<void> => {
      const checkpoint = attachmentRetryRef.current.get(ownerStudentId);
      if (!checkpoint || checkpoint.items.length === 0) return;
      const result = await commitPendingAttachments(checkpoint.recordId, checkpoint.items);
      const partial = partialAttachmentMessage(result);
      if (partial) {
        attachmentRetryRef.current.set(ownerStudentId, {
          recordId: checkpoint.recordId,
          items: keepFailed(checkpoint.items, result),
        });
        useToastStore.getState().show(partial, 'error');
        return;
      }
      attachmentRetryRef.current.delete(ownerStudentId);
      useToastStore.getState().show('첨부를 모두 붙였습니다.', 'success');
    },
    [commitPendingAttachments],
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
        next.push({ pendingKey: newPendingKey(), file: f, source });
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
      const savedSlots = [...slotsRef.current];

      if (savedContent && savingRef.current !== prevId) {
        savingRef.current = prevId;
        // 이전 학생의 대기 첨부를 캡처한다. 대기 목록은 비워 새 학생이 물려받지 않게 하되,
        // ★캡처한 목록은 커밋이 끝날 때까지 살아 있다 — 먼저 버리고 결과를 기다리지 않으면
        //   무엇이 붙고 무엇이 실패했는지 영원히 알 수 없다(계획 §5.1-2).
        const filesToCommit = pendingFilesRef.current;
        pendingFilesRef.current = [];
        addRecord({
          studentId: prevId,
          classId,
          date: savedDate,
          content: savedContent,
          tags: savedTags,
          category: categoryRef.current,
          // ★자동저장에도 슬롯을 싣는다. 빠뜨리면 학생을 넘기는 순간 고른 장면이 조용히 사라진다.
          slots: savedSlots,
        })
          .then(async (recordId) => {
            // ★완료를 기다린다. void 로 떼어 놓으면 실패해도 "자동 저장됨"만 뜬다.
            if (filesToCommit.length > 0) {
              const result = await commitPendingAttachments(recordId, filesToCommit);
              const partial = partialAttachmentMessage(result);
              if (partial) {
                // 이 시점의 화면 학생은 이미 다음 학생이다 — 실패분을 **이전 학생 맥락과 함께** 남긴다.
                attachmentRetryRef.current.set(prevId, {
                  recordId,
                  items: keepFailed(filesToCommit, result),
                });
                useToastStore.getState().show(partial, 'error', {
                  label: '첨부 다시 시도',
                  onClick: () => void retryFailedAttachments(prevId),
                });
              }
            }
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
      // ★반드시 리셋한다. 안 하면 앞 학생에게 켜 둔 칩이 그대로 남아 **다른 학생 기록에
      //   남의 장면이 붙는다** — 유실보다 나쁘다(잘못된 근거가 생기부 재료로 들어간다).
      setSelectedSlots(nextDraft?.slots ?? []);
      setSelectedCategory(DEFAULT_OBSERVATION_CATEGORIES[0]);
      setPendingFiles([]);
      // ★반드시 지운다. 앞 학생에게 고른 주제가 남으면 **다른 학생의 근거가 남의 주제에 묶인다**
      //   - 슬롯 오염(위)과 같은 종류의 사고이고, 이쪽이 더 조용하다.
      setSelectedTopic(null);
      setDetailOpen(false);
      prevStudentIdRef.current = studentId;
    }

    textareaRef.current?.focus();
  }, [
    addRecord,
    classId,
    cleanupDrafts,
    deleteRecord,
    studentId,
    commitPendingAttachments,
    retryFailedAttachments,
  ]);

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
        slots: slotsRef.current,
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
        slots: slotsRef.current,
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
          slots: slotsRef.current,
        });
        return nextTags;
      });
    },
    [rememberDraft, studentId],
  );

  // ★toggleTag 와 같은 모양이어야 한다. 앞서는 rememberDraft 선언(185행)보다 위에 있어
  //   초안에 남길 수 없었고, 그 결과 ObservationDraft.slots 와 isDraftEmpty 의 슬롯 조건이
  //   죽은 코드가 됐다. 본문 없이 슬롯만 고른 상태가 학생 전환에서 사라진다.
  const toggleSlot = useCallback(
    (slot: string) => {
      setSelectedSlots((prev) => {
        const next = prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot];
        rememberDraft(studentId, {
          date: dateRef.current,
          content: contentRef.current,
          tags: tagsRef.current,
          slots: next,
        });
        return next;
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
        slots: selectedSlots,
      });
      const items = pendingFilesRef.current;
      const result = await commitPendingAttachments(recordId, items);
      // 주제를 골랐을 때만 근거로 올린다. 안 골랐으면 원본은 보드에 거울 카드로 보인다(계획 §5.1-3).
      if (selectedTopic !== null) {
        await linkSavedRecordToTopic(recordId, trimmed.slice(0, 500), selectedSlots, date);
      }
      const partial = partialAttachmentMessage(result);
      // 기록은 저장됐다. 붙지 못한 첨부만 대기 목록에 남겨 다시 시도할 수 있게 한다 —
      // 여기서 통째로 비우면 성공한 파일과 실패한 파일을 구별할 수 없다(계획 §5.1-2).
      const remaining = partial ? keepFailed(items, result) : [];
      pendingFilesRef.current = remaining;
      draftMapRef.current.delete(studentId);
      setContent('');
      setSelectedTags([]);
      setSelectedSlots([]);
      setSelectedCategory(DEFAULT_OBSERVATION_CATEGORIES[0]);
      setDate(todayString());
      setPendingFiles(remaining);
      setSelectedTopic(null);
      if (partial) useToastStore.getState().show(partial, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    content,
    date,
    selectedTags,
    selectedSlots,
    selectedCategory,
    selectedTopic,
    studentId,
    classId,
    addRecord,
    commitPendingAttachments,
    linkSavedRecordToTopic,
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

      {/* 관찰 내용 — 첫 과업은 구체적인 사실 기록이다(계획 §4.1). 분류를 먼저 고민하지 않게 맨 앞에 둔다. */}
      <label htmlFor="observation-content" className="block text-caption text-sp-muted mb-1.5">
        관찰 내용
      </label>
      <textarea
        id="observation-content"
        ref={textareaRef}
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요"
        maxLength={500}
        rows={3}
        className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted resize-none focus:outline-none focus:border-sp-accent"
      />

      {/* 관찰 슬롯 — 본문 아래에 둔다(설계 (나)안). 쓰고 나서야 무슨 장면인지 알기 때문이다.
          ★접지 않는다: 한 번 더 눌러야 하면 대부분 안 누르고, 그러면 슬롯이 안 쌓인다.
          ★선택은 강제하지 않는다. 안 고르고도 저장된다. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-caption text-sp-muted mr-0.5">어떤 장면인가요?</span>
        {allSlots.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => toggleSlot(slot)}
            aria-pressed={selectedSlots.includes(slot)}
            className={`px-2 py-0.5 rounded-full text-caption font-medium transition-colors ${
              selectedSlots.includes(slot)
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {slot}
          </button>
        ))}
        <input
          type="text"
          value={newSlotInput}
          onChange={(e) => setNewSlotInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const v = newSlotInput.trim();
            if (!v) return;
            if (!allSlots.includes(v)) void addCustomSlot(v);
            if (!selectedSlots.includes(v)) toggleSlot(v);
            setNewSlotInput('');
          }}
          placeholder="+ 장면"
          aria-label="장면 직접 추가"
          className="w-16 px-2 py-0.5 rounded-full text-caption bg-sp-surface border border-dashed border-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent focus:w-24 transition-all"
        />
      </div>

      {/* 주제 연결(선택) - 본문·장면 다음, 부가 정보 앞(계획 §4.1 순서). */}
      <ObservationTopicPicker
        studentRef={topicStudentRef}
        content={content}
        multiTarget={false}
        selected={selectedTopic}
        onSelect={setSelectedTopic}
      />

      {/* 분류·태그 — 접어 둔다(계획 §4.1). 교과는 분류에 기본값이 있고 저장을 막지 않으므로
          통째로 접어도 안전하다. 접힌 줄에 현재 선택값을 그대로 보여 준다. */}
      <div>
        <button
          type="button"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((v) => !v)}
          className="flex items-center gap-1.5 text-caption text-sp-muted hover:text-sp-text transition-colors"
        >
          <span>
            분류: {selectedCategory} · 태그 {selectedTags.length}개
          </span>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-sm transition-transform ${
              detailOpen ? 'rotate-180' : ''
            }`}
          >
            expand_more
          </span>
        </button>
        {detailOpen && (
          <div className="mt-1.5 space-y-2">
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
          </div>
        )}
      </div>

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
        <div className="flex flex-wrap items-center gap-2">
          {/* 말로 쓰기 — OS 받아쓰기를 부른다. 커서를 이 칸에 두고 부르는 것이 핵심이다
              (OS 는 커서가 있는 칸에 글자를 넣는다). */}
          <VoiceTypingButton onFocusField={() => textareaRef.current?.focus()} />
          {/* 여러 학생이 섞인 긴 글일 때만 나온다. 쌤핀 AI 가 꺼져 있으면 아예 없다. */}
          {assistEnabled && isSplitWorthwhile(content) && (
            <button
              type="button"
              onClick={() => requestObservationSplit(content)}
              className="flex items-center gap-1 text-caption text-sp-muted transition-colors hover:text-sp-accent"
            >
              <span aria-hidden className="material-symbols-outlined text-sm">
                call_split
              </span>
              학생별로 나누기
            </button>
          )}
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
