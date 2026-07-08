import { useId, useState } from 'react';

/**
 * 학생 관찰 기록 알림 — 기록 입력 카드.
 *
 * "요즘 OOO은 어떤 모습이었나요?" 질문에 3초 안에 태그를 찍고 한 줄 메모를 남기도록 돕는
 * 순수 프레젠테이션 카드. 상태·스토어 로직은 갖지 않으며 props로만 동작한다.
 * 실제 발화 표면(메인 팝업/아이콘 팝오버 등 어디에 얹을지)은 이 컴포넌트를 감싸는
 * 컨테이너가 결정한다 — 그래서 카드 자체가 폭·테두리·그림자를 모두 갖는 완결된 형태다.
 * 계획서: docs/01-plan/features/observation-record-reminder.plan.md
 *
 * 다음 학생으로 넘어갈 때 선택된 태그·메모(내부 상태)를 초기화하려면 호출부에서
 * `key`(예: studentId)를 바꿔 리마운트할 것 — 이 컴포넌트는 prop 변화를 감지해
 * 스스로 초기화하지 않는다(순수 프레젠테이션 원칙 — 상태는 최소한만 보유).
 */
export interface ReminderPromptProps {
  /** 표시용 이름(이미 노출정책 적용됨). 빈 문자열이면 무명 처리. */
  readonly studentName: string;
  /** 질문 문구(이미 완성됨). 그대로 렌더. */
  readonly promptText: string;
  /** 태그 후보(토글 칩) */
  readonly tagOptions: readonly string[];
  /** "1 / 3" 진행 표시(옵셔널) */
  readonly queueInfo?: { readonly index: number; readonly total: number };
  /** 저장(태그만/메모만/둘 다 허용) */
  readonly onSave: (payload: { tags: string[]; content: string }) => void;
  /** "오늘은 특이사항 없음" — 그냥 넘김(무리한 기록 방지) */
  readonly onNothingToday: () => void;
  /** "나중에"(스누즈) */
  readonly onSnooze: () => void;
  /** "이 학생 건너뛰기" */
  readonly onSkipStudent: () => void;
  /** X 닫기(옵셔널) */
  readonly onClose?: () => void;
}

const CONTENT_MAX_LENGTH = 200;

export function ReminderPrompt({
  studentName,
  promptText,
  tagOptions,
  queueInfo,
  onSave,
  onNothingToday,
  onSnooze,
  onSkipStudent,
  onClose,
}: ReminderPromptProps) {
  // 선택된 태그 Set + 메모 문자열만 내부 상태로 보유(가드레일 — 그 외 로직은 컨테이너 소관).
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(() => new Set());
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const headingId = useId();

  const displayName = studentName.trim() || '학생';
  const canSave = selectedTags.size > 0 || content.trim().length > 0;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleSave = () => {
    if (!canSave || submitting) return;
    // 저장 중 더블클릭/Ctrl+Enter 반복으로 같은 기록이 중복 생성되지 않게 1회로 잠근다.
    // (저장 후 부모가 다음 학생으로 넘어가며 key로 리마운트해 상태가 초기화된다.)
    setSubmitting(true);
    // 표시 순서(tagOptions 순서)를 유지해 반환 — 클릭 순서가 아니라 칩 배치 순서로 저장.
    onSave({
      tags: tagOptions.filter((tag) => selectedTags.has(tag)),
      content: content.trim(),
    });
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="w-[min(480px,calc(100vw-32px))] flex flex-col bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-400 shrink-0">
            <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
              edit_note
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-caption text-sp-muted">학생 관찰 기록</p>
            <p className="text-sm font-sp-semibold text-sp-text truncate">{displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {queueInfo && (
            <span
              className="rounded-full bg-sp-surface px-2 py-0.5 text-caption font-sp-semibold text-sp-muted tabular-nums"
              aria-label={`${queueInfo.index} / ${queueInfo.total}번째 학생`}
            >
              {queueInfo.index} / {queueInfo.total}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-sp-border mx-5" />

      {/* 본문 — 질문 + 태그 칩 + 한 줄 메모 */}
      <div className="px-5 py-4 space-y-3">
        <h3 id={headingId} className="text-lg font-bold text-sp-text leading-snug">
          {promptText}
        </h3>

        <div role="group" aria-label="관찰 태그 선택" className="flex flex-wrap gap-1.5">
          {tagOptions.map((tag) => {
            const selected = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={selected}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="한 줄로 남겨보세요 (선택)"
          maxLength={CONTENT_MAX_LENGTH}
          rows={2}
          aria-label="한 줄 메모"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted resize-none focus:outline-none focus:border-sp-accent"
        />

        {/* 부담 없는 탈출구 — 눈에 띄되 강요하지 않는 점선 톤 */}
        <button
          type="button"
          onClick={onNothingToday}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-sp-border px-3 py-2 text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
        >
          <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
            check_circle
          </span>
          오늘은 특이사항 없음
        </button>
      </div>

      {/* 하단 버튼 — 나중에/건너뛰기(보조) + 저장(강조) */}
      <div className="px-5 pb-5 pt-1 flex flex-col gap-2 shrink-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSnooze}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sp-border px-3 py-2 text-sm font-semibold text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
              snooze
            </span>
            나중에
          </button>
          <button
            type="button"
            onClick={onSkipStudent}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sp-border px-3 py-2 text-sm font-semibold text-sp-muted hover:bg-sp-surface hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
              skip_next
            </span>
            이 학생 건너뛰기
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || submitting}
          className="w-full py-2.5 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-semibold shadow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          저장
        </button>
      </div>
    </div>
  );
}
