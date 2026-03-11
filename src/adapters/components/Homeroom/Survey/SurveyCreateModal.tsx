import { useState, useCallback, useEffect } from 'react';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { surveySupabaseClient, shortLinkClient } from '@adapters/di/container';
import { validateCustomCode } from '@infrastructure/supabase/ShortLinkClient';
import type { SurveyMode, QuestionType } from '@domain/entities/Survey';

/* ──────────────── 타입 ──────────────── */

interface QuestionDraft {
  id: string;
  type: QuestionType;
  label: string;
  options: string[];
  required: boolean;
}

interface SurveyCreateModalProps {
  onClose: () => void;
}

/* ──────────────── 상수 ──────────────── */

const COLOR_PALETTE = [
  { id: 'blue', label: '파랑', cls: 'bg-blue-400' },
  { id: 'green', label: '초록', cls: 'bg-green-400' },
  { id: 'yellow', label: '노랑', cls: 'bg-yellow-400' },
  { id: 'purple', label: '보라', cls: 'bg-purple-400' },
  { id: 'red', label: '빨강', cls: 'bg-red-400' },
  { id: 'pink', label: '분홍', cls: 'bg-pink-400' },
  { id: 'indigo', label: '남색', cls: 'bg-indigo-400' },
  { id: 'teal', label: '청록', cls: 'bg-teal-400' },
] as const;

const QUESTION_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: 'yesno', label: '○/×', icon: 'check_circle' },
  { value: 'choice', label: '선택형', icon: 'radio_button_checked' },
  { value: 'text', label: '텍스트', icon: 'edit_note' },
];

function newQuestion(): QuestionDraft {
  return { id: crypto.randomUUID(), type: 'yesno', label: '', options: [], required: true };
}

/* ──────────────── 컴포넌트 ──────────────── */

export function SurveyCreateModal({ onClose }: SurveyCreateModalProps) {
  const { createSurvey } = useSurveyStore();
  const showToast = useToastStore((s) => s.show);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<SurveyMode>('teacher');
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const [dueDate, setDueDate] = useState('');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const [customLinkCode, setCustomLinkCode] = useState('');
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  // 커스텀 코드 실시간 검증 (디바운스 300ms)
  useEffect(() => {
    if (!customLinkCode) {
      setLinkCodeError(null);
      return;
    }
    const validation = validateCustomCode(customLinkCode);
    if (!validation.valid) {
      setLinkCodeError(validation.error ?? null);
      return;
    }
    setIsCheckingCode(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const available = await shortLinkClient.isCodeAvailable(customLinkCode);
          setLinkCodeError(available ? null : '이미 사용 중인 링크입니다');
        } catch {
          setLinkCodeError(null);
        }
        setIsCheckingCode(false);
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [customLinkCode]);

  /* ── 질문 조작 ── */

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, newQuestion()]);
  }, []);

  const removeQuestion = useCallback((id: string) => {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((q) => q.id !== id)));
  }, []);

  const updateQuestion = useCallback(<K extends keyof QuestionDraft>(
    id: string, field: K, value: QuestionDraft[K],
  ) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== id) return q;
      const updated = { ...q, [field]: value };
      // 유형 변경 시 옵션 초기화
      if (field === 'type' && value !== 'choice') {
        updated.options = [];
      }
      return updated;
    }));
  }, []);

  const addOption = useCallback((questionId: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, options: [...q.options, ''] } : q,
    ));
  }, []);

  const updateOption = useCallback((questionId: string, idx: number, value: string) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== questionId) return q;
      const opts = [...q.options];
      opts[idx] = value;
      return { ...q, options: opts };
    }));
  }, []);

  const removeOption = useCallback((questionId: string, idx: number) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== questionId) return q;
      return { ...q, options: q.options.filter((_, i) => i !== idx) };
    }));
  }, []);

  /* ── 유효성 ── */

  const canSubmit =
    title.trim().length > 0 &&
    questions.every((q) => q.label.trim().length > 0) &&
    questions.every((q) => q.type !== 'choice' || q.options.length >= 2) &&
    !saving;

  /* ── 생성 ── */

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const mappedQuestions = questions.map((q) => ({
        id: q.id,
        type: q.type,
        label: q.label.trim(),
        options: q.type === 'choice' ? q.options.filter((o) => o.trim()) : undefined,
        required: q.required,
      }));

      const survey = await createSurvey({
        title: title.trim(),
        description: description.trim() || undefined,
        mode,
        questions: mappedQuestions,
        dueDate: dueDate || undefined,
        categoryColor: color,
        isArchived: false,
        customLinkCode: mode === 'student' && customLinkCode.trim() ? customLinkCode.trim() : undefined,
      });

      // 학생 응답 모드 → Supabase에 업로드 (공유 링크가 동작하도록)
      if (mode === 'student' && survey.adminKey) {
        try {
          await surveySupabaseClient.createSurvey({
            id: survey.id,
            title: survey.title,
            description: survey.description,
            mode: 'student',
            questions: mappedQuestions,
            dueDate: survey.dueDate,
            adminKey: survey.adminKey,
            targetCount: survey.targetCount ?? 30,
          });
        } catch {
          showToast('설문은 저장되었지만 온라인 공유 설정에 실패했습니다', 'error');
          onClose();
          return;
        }
      }

      showToast('설문이 생성되었습니다', 'success');
      onClose();
    } catch {
      showToast('설문 생성에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }, [canSubmit, title, description, mode, questions, dueDate, color, createSurvey, showToast, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-sp-border shrink-0">
          <h3 className="text-lg font-bold text-sp-text">새 설문/체크리스트</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 제목 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 우유 급식 신청 (3월)"
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
              maxLength={60}
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설문에 대한 간단한 설명"
              rows={2}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors resize-none"
              maxLength={200}
            />
          </div>

          {/* 응답 방식 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">응답 방식</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('teacher')}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'teacher'
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                <span>✏️</span>
                <span>내가 직접 체크</span>
              </button>
              <button
                onClick={() => setMode('student')}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'student'
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                <span>📱</span>
                <span>학생 자가 응답</span>
              </button>
            </div>
          </div>

          {/* 질문 목록 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              질문 ({questions.length}개)
            </label>
            <div className="flex flex-col gap-3">
              {questions.map((q, qIdx) => (
                <div key={q.id} className="bg-sp-surface rounded-lg p-3 border border-sp-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-sp-muted font-medium">Q{qIdx + 1}</span>
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => updateQuestion(q.id, 'label', e.target.value)}
                      placeholder="질문을 입력하세요"
                      className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
                      maxLength={100}
                    />
                    {questions.length > 1 && (
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="text-sp-muted hover:text-red-400 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    )}
                  </div>

                  {/* 질문 유형 선택 */}
                  <div className="flex gap-1.5 mb-2">
                    {QUESTION_TYPES.map((qt) => (
                      <button
                        key={qt.value}
                        onClick={() => updateQuestion(q.id, 'type', qt.value)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          q.type === qt.value
                            ? 'bg-sp-accent/20 text-sp-accent'
                            : 'text-sp-muted hover:text-sp-text'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">{qt.icon}</span>
                        {qt.label}
                      </button>
                    ))}
                  </div>

                  {/* 선택형 → 옵션 */}
                  {q.type === 'choice' && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-1.5">
                          <span className="text-xs text-sp-muted">{oIdx + 1}.</span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(q.id, oIdx, e.target.value)}
                            placeholder="옵션"
                            className="flex-1 bg-sp-card border border-sp-border rounded-md px-2 py-1 text-xs text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
                            maxLength={50}
                          />
                          <button
                            onClick={() => removeOption(q.id, oIdx)}
                            className="text-sp-muted hover:text-red-400 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addOption(q.id)}
                        className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors self-start mt-0.5"
                      >
                        + 옵션 추가
                      </button>
                      {q.options.length < 2 && (
                        <p className="text-[10px] text-amber-400">선택형은 최소 2개 옵션이 필요합니다</p>
                      )}
                    </div>
                  )}

                  {/* 필수 토글 */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuestion(q.id, 'required', !q.required)}
                      className={`text-xs px-2 py-0.5 rounded-md transition-all ${
                        q.required ? 'bg-sp-accent/20 text-sp-accent' : 'text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      {q.required ? '필수' : '선택'}
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addQuestion}
                className="flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-sp-border text-xs text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                질문 추가
              </button>
            </div>
          </div>

          {/* 마감일 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              마감일 (선택)
              {mode === 'student' && !dueDate && (
                <span className="text-amber-400 ml-1">학생 응답 모드에서는 마감일 설정을 권장합니다</span>
              )}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
            />
          </div>

          {/* 커스텀 링크 (학생 응답 모드일 때만) */}
          {mode === 'student' && (
            <div>
              <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                커스텀 링크 (선택)
              </label>
              <div className="flex items-center gap-0">
                <span className="px-2.5 py-2.5 bg-sp-surface/60 border border-r-0 border-sp-border rounded-l-lg text-sp-muted text-xs whitespace-nowrap">
                  ssampin.vercel.app/s/
                </span>
                <input
                  type="text"
                  value={customLinkCode}
                  onChange={(e) => setCustomLinkCode(e.target.value)}
                  placeholder="예: 3월우유신청"
                  className="flex-1 bg-sp-surface border border-sp-border rounded-r-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
                />
              </div>
              {linkCodeError && (
                <p className="text-[10px] text-red-400 mt-1">{linkCodeError}</p>
              )}
              {customLinkCode && !linkCodeError && !isCheckingCode && (
                <p className="text-[10px] text-green-400 mt-1">사용 가능</p>
              )}
              <p className="text-[10px] text-sp-muted/50 mt-1">
                비워두면 자동으로 생성됩니다. 한글, 영문, 숫자, -, _ 사용 가능
              </p>
            </div>
          )}

          {/* 색상 선택 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">색상</label>
            <div className="flex gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  className={`w-7 h-7 rounded-full transition-all ${c.cls} ${
                    color === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="p-5 border-t border-sp-border flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {saving ? (
              <span className="text-xs">생성 중...</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">add</span>
                만들기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
