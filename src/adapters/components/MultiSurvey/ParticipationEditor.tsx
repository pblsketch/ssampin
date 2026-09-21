/**
 * ParticipationEditor — 퀴즈·설문·토론의 **활동 편집 화면**.
 *
 * 구조 (설계: docs/02-design/features/participation-classroom-ux.design.md §5.2)
 *   상단  : 제목 · 저장 상태 · [활동 설정] · [학생 화면 미리보기] · [학생 초대하기]
 *   왼쪽  : 문항 목록 (번호·유형 띠·질문 요약·오류 표시)
 *   가운데: 지금 문항 — 질문 / 보기 / 정답·해설 / 이유 받기
 *   오른쪽: 학생 화면 미리보기 (1280px 이상에서만 편다)
 *
 * 세 가지를 특히 지킨다.
 *  1. 저장 표시는 **실제 편집 상태**를 따라간다 (`useDraftSaveState`).
 *  2. 실행할 수 없으면 **어디를 고쳐야 하는지** 말하고 그 자리로 데려간다.
 *  3. 보기를 지우거나 옮겨도 **정답 연결이 뒤바뀌지 않는다** (id 로 가리키므로).
 */

import {
  createParticipationQuestion,
  type ParticipationFormat,
} from '@adapters/multiSurvey/questionCatalog';
import { QuestionTypePicker } from './QuestionTypePicker';
import { AdvancedQuestionEditor, QuestionImageInput } from './AdvancedQuestionEditor';
import {
  isAdvancedType,
  type AdvancedQuestion,
} from '@domain/entities/multiSurvey/AdvancedQuestion';
import { questionHasAnswer } from '@domain/rules/participationRules';
import { participationReadiness } from '@domain/rules/participationReadiness';
import { useDraftSaveState } from '@adapters/hooks/useDraftSaveState';
import { useEffect, useMemo, useState } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { Question } from '@domain/entities/multiSurvey/Question';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { mapQuestionsForLiveHTML } from '@adapters/multiSurvey/live/liveBridge';
import { generateParticipationStudentPage } from '@adapters/multiSurvey/participationStudentPage';
import { groupOfQuestion, iconOfQuestion } from '@adapters/multiSurvey/questionTypeStyle';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

export const participationButton =
  'min-h-11 rounded-xl border border-sp-border px-4 py-2 hover:border-sp-accent focus-visible:ring-2 focus-visible:ring-sp-accent disabled:opacity-40';
/** 주요 행동 — 한 화면에 하나만 둔다 */
const primaryButton = `${participationButton} bg-sp-accent font-bold text-sp-accent-fg hover:border-sp-accent`;
/** 서로 붙어 있는 작은 조작 — 44px 을 다 주면 이웃과 겹친다. WCAG 2.2 AA 24px + 간격을 지킨다. */
const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-sp-border text-sm hover:border-sp-accent focus-visible:ring-2 focus-visible:ring-sp-accent disabled:opacity-40';
const field =
  'w-full rounded-xl border border-sp-border bg-sp-bg p-3 text-sp-text focus:border-sp-accent focus:outline-none';
export const newParticipationQuestion = createParticipationQuestion;

/** 저장 상태에 맞는 점 색 — 색만으로 뜻을 전하지 않도록 글도 함께 둔다. */
const SAVE_DOT: Readonly<Record<string, string>> = {
  saved: 'bg-sp-success',
  dirty: 'bg-sp-highlight',
  saving: 'bg-sp-accent',
  failed: 'bg-sp-error',
};

export function ParticipationEditor({
  session,
  onBack,
}: {
  session: MultiSurveyV2;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(session);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmTypeChange, setConfirmTypeChange] = useState(false);
  const [picker, setPicker] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  /** 끌어서 순서 바꾸기 — 잡은 문항과 지금 올라와 있는 자리 */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const save = useDraftSaveState();
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);
  const originalSerialized = useMemo(() => JSON.stringify(session), [session]);
  useEffect(() => {
    save.sync(serialized, originalSerialized);
  }, [serialized, originalSerialized, save]);

  const question = draft.questions[index];
  const quiz = !!question && questionHasAnswer(question);
  const issues = useMemo(() => participationReadiness(draft), [draft]);
  const ready = issues.length === 0;
  /** 이 문항에 고칠 것이 있는가 — 문항 목록의 오류 표시 기준 */
  const issueCountByQuestion = useMemo(() => {
    const counts = new Map<number, number>();
    for (const issue of issues)
      if (issue.questionIndex !== null)
        counts.set(issue.questionIndex, (counts.get(issue.questionIndex) ?? 0) + 1);
    return counts;
  }, [issues]);

  const change = (q: Question) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((old, i) => (i === index ? q : old)) }));
  const add = (format: ParticipationFormat) => {
    setDraft((d) => ({ ...d, questions: [...d.questions, newParticipationQuestion(format)] }));
    setIndex(draft.questions.length);
  };
  /** 문항을 from 자리에서 to 자리로 옮기고, 보고 있던 문항을 따라가게 한다. */
  const moveQuestion = (from: number, to: number) => {
    const total = draft.questions.length;
    if (from === to || from < 0 || to < 0 || from >= total || to >= total) return;
    const qs = [...draft.questions];
    const [moved] = qs.splice(from, 1);
    if (!moved) return;
    qs.splice(to, 0, moved);
    setDraft((d) => ({ ...d, questions: qs }));
    setIndex(to);
    setConfirmDelete(false);
  };

  const persist = (): boolean =>
    save.runSave(serialized, () => {
      const store = useMultiSurveyV2Store.getState();
      store.updateSession(draft.id, {
        title: draft.title,
        questions: draft.questions,
        competitionMode: draft.competitionMode,
      });
      store.updateResponseOpts(draft.id, draft.responseOpts);
      store.updatePresentationOpts(draft.id, draft.presentationOpts);
      return true;
    });

  /** 고칠 자리로 데려간다 — 문항을 열고 그 입력칸에 초점을 준다. */
  const goToIssue = (issue: (typeof issues)[number]) => {
    if (issue.questionIndex !== null) setIndex(issue.questionIndex);
    setShowIssues(false);
    if (!issue.focus) return;
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        `[aria-label="${CSS.escape(issue.focus!)}"]`,
      );
      target?.focus();
      target?.scrollIntoView({ block: 'center' });
    }, 60);
  };

  const html = useMemo(
    () =>
      question
        ? generateParticipationStudentPage(
            {
              roomId: 'preview',
              title: draft.title,
              purpose: draft.purpose ?? 'discussion',
              competitionMode: !!draft.competitionMode,
            },
            mapQuestionsForLiveHTML([question])[0],
          )
        : '',
    [draft.title, draft.purpose, draft.competitionMode, question],
  );

  const choices =
    question?.type === 'multiple'
      ? question.choices
      : question?.type === 'single-choice' || question?.type === 'multi-choice'
        ? question.options
        : null;

  /**
   * 보기 목록을 통째로 갈아 끼운다.
   * 정답은 보기 **id** 로 가리키므로 순서를 바꾸거나 지워도 연결이 따라간다.
   * 지운 보기가 정답이었다면 정답 목록에서도 함께 뺀다.
   */
  const setChoices = (next: readonly { id: string; text: string; imageUrl?: string }[]) => {
    if (!question) return;
    if (question.type === 'multiple') {
      const ids = new Set(next.map((o) => o.id));
      change({
        ...question,
        choices: next,
        correctChoiceIds: question.correctChoiceIds.filter((id) => ids.has(id)),
      });
    } else if (question.type === 'single-choice' || question.type === 'multi-choice') {
      change({ ...question, options: next });
    }
  };

  const moveChoice = (from: number, to: number) => {
    if (!choices || to < 0 || to >= choices.length) return;
    const next = [...choices];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setChoices(next);
  };

  return (
    <div className="flex h-full flex-col bg-sp-bg text-sp-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-sp-border px-4 py-3">
        <button
          className={participationButton}
          onClick={() => (save.dirty ? setConfirmCancel(true) : onBack())}
        >
          목록으로
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs">
            <span className="font-bold text-sp-accent">{PARTICIPATION_TOOL_NAME}</span>
            <span className="text-sp-muted">활동 편집</span>
          </p>
          <input
            aria-label="활동 제목"
            className="block w-full bg-transparent text-xl font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <p role="status" className="flex items-center gap-2 text-sm text-sp-muted">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${SAVE_DOT[save.state] ?? 'bg-sp-border'}`}
          />
          {save.label}
        </p>
        <button
          className={participationButton}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          활동 설정
        </button>
        <button
          className={participationButton}
          onClick={() => setPreview(!preview)}
          aria-pressed={preview}
        >
          학생 화면 미리보기
        </button>
        <button className={participationButton} onClick={persist}>
          저장
        </button>
        <button
          className={primaryButton}
          onClick={() => {
            if (!ready) {
              setShowIssues(true);
              return;
            }
            if (persist()) useMultiSurveyV2Store.getState().startLive(draft.id);
          }}
        >
          학생 초대하기
        </button>
      </header>

      {/* 지금 적용된 중요한 설정은 접어 두더라도 한 줄 요약으로 남긴다. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sp-border px-4 py-2 text-xs text-sp-muted">
        <span>문항 {draft.questions.length}개</span>
        {draft.competitionMode && (
          <span className="rounded-full border border-sp-accent px-2 py-0.5 text-sp-accent">
            경쟁 모드
          </span>
        )}
        {draft.competitionMode && draft.responseOpts.fastSolveBonus && (
          <span className="rounded-full border border-sp-info px-2 py-0.5 text-sp-info">
            빠른 정답 보너스
          </span>
        )}
        {!ready && (
          <button
            className="rounded-full border border-sp-highlight px-2 py-0.5 text-sp-highlight"
            onClick={() => setShowIssues(true)}
          >
            고칠 곳 {issues.length}군데
          </button>
        )}
      </div>

      {save.state === 'failed' && (
        <p role="alert" className="border-b border-sp-border px-4 py-3 text-sp-highlight">
          저장하지 못했어요. 작성한 내용은 그대로 있으니 잠시 뒤 [저장]을 다시 눌러 주세요.
        </p>
      )}

      {showIssues && (
        <div
          role="alertdialog"
          aria-label="고칠 곳 안내"
          className="border-b border-sp-border px-4 py-3"
        >
          <p className="font-bold">아직 학생을 초대할 수 없어요.</p>
          <ul className="mt-2 space-y-1">
            {issues.map((issue) => (
              <li key={`${issue.questionIndex}-${issue.message}`}>
                <button
                  className="text-left underline decoration-dotted underline-offset-4 hover:text-sp-accent"
                  onClick={() => goToIssue(issue)}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <button className={`${participationButton} mt-3`} onClick={() => setShowIssues(false)}>
            닫기
          </button>
        </div>
      )}

      {settingsOpen && (
        <section
          aria-label="활동 설정"
          className="border-b border-sp-border bg-sp-surface px-4 py-4"
        >
          <h2 className="font-bold">활동 전체에 적용되는 설정</h2>
          {draft.questions.some(questionHasAnswer) ? (
            <>
              <label className="mt-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.competitionMode ?? false}
                  onChange={(e) => setDraft({ ...draft, competitionMode: e.target.checked })}
                />
                경쟁 모드
              </label>
              <p className="mt-2 text-sm text-sp-muted">
                {draft.competitionMode
                  ? '교사는 실시간 순위, 학생은 문항 마감 후 내 순위를 확인해요. 교실 순위는 선생님이 공개해요.'
                  : '정답 수와 내 점수를 확인해요. 순위는 표시하지 않아요.'}
              </p>
              {draft.competitionMode && (
                <label className="mt-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={draft.responseOpts.fastSolveBonus}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        responseOpts: { ...draft.responseOpts, fastSolveBonus: e.target.checked },
                      })
                    }
                  />
                  빠른 정답 보너스 · 문항별 제한 시간 안에 빠를수록 최대 50% 추가
                </label>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-sp-muted">
              정답을 쓰는 문항이 없어서 경쟁 설정은 쓰지 않아요. 의견을 모은 뒤 결과를 공개하고,
              토론 후 같은 질문에 다시 응답받아 생각의 변화를 비교할 수 있어요.
            </p>
          )}
          <label className="mt-4 flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={draft.presentationOpts.revealExplanation}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  presentationOpts: {
                    ...draft.presentationOpts,
                    revealExplanation: e.target.checked,
                  },
                })
              }
            />
            정답을 공개할 때 해설도 함께 보여 주기
          </label>
          <button className={`${participationButton} mt-4`} onClick={() => setSettingsOpen(false)}>
            설정 닫기
          </button>
        </section>
      )}

      {confirmCancel && (
        <div
          role="alertdialog"
          aria-label="편집 취소 확인"
          className="flex flex-wrap items-center gap-3 border-b border-sp-border px-4 py-3"
        >
          <span className="flex-1">저장하지 않은 변경을 취소할까요?</span>
          <button className={participationButton} onClick={onBack}>
            변경 취소하고 나가기
          </button>
          <button className={primaryButton} onClick={() => setConfirmCancel(false)}>
            계속 편집
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-60 shrink-0 overflow-auto border-r border-sp-border p-4">
          <h2 className="mb-1 font-bold">문항 {draft.questions.length}개</h2>
          <p className="mb-3 text-xs text-sp-muted">
            끌어서 순서를 바꿀 수 있어요. 키보드는 아래 [위로]·[아래로]를 쓰세요.
          </p>
          <ol className="space-y-2">
            {draft.questions.map((q, i) => (
              <li
                key={q.id}
                draggable
                onDragStart={(event) => {
                  setDragFrom(i);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(i));
                }}
                onDragOver={(event) => {
                  if (dragFrom === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dragOver !== i) setDragOver(i);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const raw = Number(event.dataTransfer.getData('text/plain'));
                  moveQuestion(Number.isInteger(raw) ? raw : (dragFrom ?? -1), i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={
                  dragFrom !== null && dragOver === i && dragFrom !== i
                    ? 'rounded-xl ring-2 ring-sp-accent'
                    : ''
                }
              >
                <button
                  // 유형 색은 왼쪽 띠(별도 요소)로, 고른 문항은 테두리·배경으로 나타낸다.
                  // 같은 상자에 두 border-color 를 겹치면 어느 쪽이 이길지 정해지지 않는다.
                  className={`${participationButton} relative w-full overflow-hidden py-2 pl-4 text-left ${i === index ? 'border-2 border-sp-accent bg-sp-surface font-bold' : 'bg-sp-card'} ${dragFrom === i ? 'opacity-50' : ''}`}
                  onClick={() => {
                    setIndex(i);
                    setConfirmDelete(false);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1.5 ${groupOfQuestion(q).fill}`}
                  />
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="cursor-grab text-sp-muted">
                      ⠿
                    </span>
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined text-icon-sm ${groupOfQuestion(q).text}`}
                    >
                      {iconOfQuestion(q)}
                    </span>
                    <span className="font-mono text-xs">{i + 1}</span>
                    {questionHasAnswer(q) && (
                      <span
                        className="shrink-0 rounded-full bg-sp-accent px-2 text-[10px] font-bold text-sp-accent-fg"
                        title="정답을 쓰는 문항"
                      >
                        정답
                      </span>
                    )}
                    {issueCountByQuestion.has(i) && (
                      <span
                        className="ml-auto shrink-0 rounded-full border border-sp-highlight px-1.5 text-[10px] font-bold text-sp-highlight"
                        title="고칠 곳이 있어요"
                      >
                        ! 고칠 곳
                      </span>
                    )}
                  </span>
                  {/* 긴 질문은 두 줄까지만 요약한다 */}
                  <span className="mt-1 line-clamp-2 block text-sm leading-snug">
                    {q.text || '새 문항'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button className={`${participationButton} mt-4 w-full`} onClick={() => setPicker(true)}>
            + 문항 추가
          </button>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {!question ? (
              <div className="rounded-2xl border border-dashed border-sp-border p-10 text-center">
                <h2 className="text-2xl font-bold">첫 질문부터 시작해요</h2>
                <p className="mt-3 text-sp-muted">왼쪽에서 문항의 답변 방식을 골라 주세요.</p>
                <button className={`${primaryButton} mt-5`} onClick={() => setPicker(true)}>
                  문항 추가하기
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">{index + 1}번 문항</span>
                  <div className="flex gap-1.5">
                    <button
                      className={iconButton}
                      aria-label="이 문항을 위로 옮기기"
                      title="위로"
                      disabled={index === 0}
                      onClick={() => moveQuestion(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className={iconButton}
                      aria-label="이 문항을 아래로 옮기기"
                      title="아래로"
                      disabled={index >= draft.questions.length - 1}
                      onClick={() => moveQuestion(index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={participationButton}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          questions: [...draft.questions, { ...question, id: crypto.randomUUID() }],
                        });
                        setIndex(draft.questions.length);
                      }}
                    >
                      복제
                    </button>
                    {/* 삭제는 실수로 누르기 어렵게 맨 끝에 두고 확인을 받는다. */}
                    <button className={participationButton} onClick={() => setConfirmDelete(true)}>
                      삭제
                    </button>
                  </div>
                </div>

                {confirmDelete && (
                  <div
                    role="alertdialog"
                    aria-label="문항 삭제 확인"
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-sp-border p-4"
                  >
                    <p className="flex-1">이 문항을 편집본에서 삭제할까요?</p>
                    <button
                      className={participationButton}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          questions: draft.questions.filter((_, i) => i !== index),
                        });
                        setIndex(Math.max(0, index - 1));
                        setConfirmDelete(false);
                      }}
                    >
                      삭제 확인
                    </button>
                    <button className={primaryButton} onClick={() => setConfirmDelete(false)}>
                      취소
                    </button>
                  </div>
                )}

                <label className="block font-bold">
                  {quiz ? '질문' : '질문 또는 논제'}
                  <textarea
                    aria-label="질문 또는 논제"
                    className={`${field} mt-2 min-h-28 text-xl`}
                    value={question.text}
                    placeholder={
                      quiz
                        ? '학생에게 물어볼 문제를 적어 주세요.'
                        : '함께 생각하고 싶은 질문을 적어 주세요.'
                    }
                    onChange={(e) => change({ ...question, text: e.target.value })}
                  />
                </label>

                {(question.type === 'single-choice' ||
                  question.type === 'multi-choice' ||
                  question.type === 'multiple') &&
                  !question.presentation && (
                    <>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={question.type === 'multiple'}
                          onChange={(e) => {
                            // 정답을 쓰다가 끄면 골라 둔 정답이 사라진다 — 먼저 알린다.
                            if (
                              !e.target.checked &&
                              question.type === 'multiple' &&
                              question.correctChoiceIds.length > 0
                            ) {
                              setConfirmTypeChange(true);
                              return;
                            }
                            if (e.target.checked && question.type !== 'multiple')
                              change({
                                ...question,
                                type: 'multiple',
                                allowMultiple: question.type === 'multi-choice',
                                choices: question.options,
                                correctChoiceIds: [],
                                score: 10,
                              });
                            else if (question.type === 'multiple')
                              change({
                                ...question,
                                type:
                                  question.allowMultiple === false
                                    ? 'single-choice'
                                    : 'multi-choice',
                                options: question.choices,
                                score: 0,
                              });
                          }}
                        />
                        정답 사용
                      </label>
                      {confirmTypeChange && question.type === 'multiple' && (
                        <div
                          role="alertdialog"
                          aria-label="정답 사용 끄기 확인"
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-sp-border p-4"
                        >
                          <p className="flex-1">
                            정답 사용을 끄면 골라 둔 정답 {question.correctChoiceIds.length}개가
                            사라져요. 보기 내용은 그대로 남아요.
                          </p>
                          <button
                            className={participationButton}
                            onClick={() => {
                              change({
                                ...question,
                                type:
                                  question.allowMultiple === false
                                    ? 'single-choice'
                                    : 'multi-choice',
                                options: question.choices,
                                score: 0,
                              });
                              setConfirmTypeChange(false);
                            }}
                          >
                            정답을 지우고 바꾸기
                          </button>
                          <button
                            className={primaryButton}
                            onClick={() => setConfirmTypeChange(false)}
                          >
                            그대로 두기
                          </button>
                        </div>
                      )}
                    </>
                  )}

                {isAdvancedType(question.type) && (
                  <AdvancedQuestionEditor
                    question={question as AdvancedQuestion}
                    onChange={change}
                  />
                )}

                {question.type === 'ox' && (
                  <fieldset>
                    <legend className="mb-2 font-bold">정답</legend>
                    <div className="flex gap-3">
                      {(['O', 'X'] as const).map((v) => (
                        <button
                          key={v}
                          aria-pressed={question.correctAnswer === v}
                          className={`${participationButton} flex-1 bg-sp-card text-3xl ${question.correctAnswer === v ? 'border-2 border-sp-accent font-bold text-sp-accent' : ''}`}
                          onClick={() => change({ ...question, correctAnswer: v })}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                {choices && (
                  <fieldset className="space-y-3">
                    <legend className="mb-2 font-bold">보기 {quiz && '· 정답을 선택하세요'}</legend>
                    {choices.map((o, i) => (
                      <div key={o.id} className="flex items-center gap-2">
                        {question.type === 'multiple' && (
                          <input
                            type="checkbox"
                            aria-label={`${i + 1}번 보기 정답`}
                            className="h-6 w-6 shrink-0"
                            checked={question.correctChoiceIds.includes(o.id)}
                            onChange={(e) =>
                              change({
                                ...question,
                                correctChoiceIds: e.target.checked
                                  ? question.allowMultiple === false
                                    ? [o.id]
                                    : [...question.correctChoiceIds, o.id]
                                  : question.correctChoiceIds.filter((id) => id !== o.id),
                              })
                            }
                          />
                        )}
                        <input
                          aria-label={`${i + 1}번 보기`}
                          className={field}
                          value={o.text}
                          onChange={(e) =>
                            setChoices(
                              choices.map((old) =>
                                old.id === o.id ? { ...old, text: e.target.value } : old,
                              ),
                            )
                          }
                        />
                        {/* 끌어놓기 없이도 같은 일을 할 수 있어야 한다. 정답은 id 로 가리키므로 따라간다. */}
                        <button
                          className={iconButton}
                          aria-label={`${i + 1}번 보기를 위로 옮기기`}
                          title="위로"
                          disabled={i === 0}
                          onClick={() => moveChoice(i, i - 1)}
                        >
                          ↑
                        </button>
                        <button
                          className={iconButton}
                          aria-label={`${i + 1}번 보기를 아래로 옮기기`}
                          title="아래로"
                          disabled={i === choices.length - 1}
                          onClick={() => moveChoice(i, i + 1)}
                        >
                          ↓
                        </button>
                        <button
                          className={iconButton}
                          aria-label={`${i + 1}번 보기 지우기`}
                          title="지우기"
                          disabled={choices.length <= 2}
                          onClick={() => setChoices(choices.filter((old) => old.id !== o.id))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {choices.length < 5 && question.presentation !== 'trafficlight' && (
                      <button
                        className={participationButton}
                        onClick={() =>
                          setChoices([...choices, { id: crypto.randomUUID(), text: '' }])
                        }
                      >
                        보기 추가
                      </button>
                    )}
                    {choices.length <= 2 && (
                      <p className="text-xs text-sp-muted">보기는 두 개까지 줄일 수 있어요.</p>
                    )}
                  </fieldset>
                )}

                {choices && (
                  <details>
                    <summary className="cursor-pointer py-2">보기 이미지 추가</summary>
                    {choices.map((o, i) => (
                      <QuestionImageInput
                        key={o.id}
                        label={`${i + 1}번 보기 이미지`}
                        value={o.imageUrl ?? ''}
                        onChange={(imageUrl) =>
                          setChoices(
                            choices.map((old) => (old.id === o.id ? { ...old, imageUrl } : old)),
                          )
                        }
                      />
                    ))}
                  </details>
                )}

                {(question.type === 'short' || question.type === 'blank') && (
                  <label className="block font-bold">
                    인정할 정답 · 여러 개이면 줄바꿈
                    <textarea
                      aria-label="인정할 정답 · 여러 개이면 줄바꿈"
                      className={`${field} mt-2`}
                      value={question.acceptedAnswers.join('\n')}
                      onChange={(e) =>
                        change({ ...question, acceptedAnswers: e.target.value.split('\n') })
                      }
                    />
                  </label>
                )}

                {question.type === 'scale' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      왼쪽 입장
                      <input
                        aria-label="왼쪽 입장"
                        className={field}
                        value={question.scaleMinLabel ?? ''}
                        onChange={(e) => change({ ...question, scaleMinLabel: e.target.value })}
                      />
                    </label>
                    <label>
                      오른쪽 입장
                      <input
                        aria-label="오른쪽 입장"
                        className={field}
                        value={question.scaleMaxLabel ?? ''}
                        onChange={(e) => change({ ...question, scaleMaxLabel: e.target.value })}
                      />
                    </label>
                  </div>
                )}

                {quiz ? (
                  <>
                    <label className="block">
                      해설
                      <textarea
                        aria-label="해설"
                        className={`${field} mt-2`}
                        value={question.explanation ?? ''}
                        onChange={(e) => change({ ...question, explanation: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      정답 점수
                      <input
                        aria-label="정답 점수"
                        className={field}
                        type="number"
                        min={1}
                        max={1000}
                        value={question.score}
                        onChange={(e) =>
                          change({
                            ...question,
                            score: Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={question.collectReason ?? false}
                      onChange={(e) => change({ ...question, collectReason: e.target.checked })}
                    />
                    그렇게 생각한 이유도 함께 받기
                  </label>
                )}
              </>
            )}
          </div>
        </main>

        {/* 미리보기는 넉넉한 폭에서만 3열로 편다. 좁으면 가운데 편집 영역이 먼저 줄어든다. */}
        {preview && question && (
          <aside className="hidden shrink-0 overflow-auto border-l border-sp-border p-4 xl:block">
            <p className="mb-2 text-xs text-sp-muted">
              실제 학생 화면이에요. 여기 응답은 저장되지 않아요.
            </p>
            <iframe
              title="실제 학생 화면 미리보기"
              sandbox="allow-scripts"
              srcDoc={html}
              className="h-[620px] w-[360px] max-w-full rounded-3xl border border-sp-border"
            />
          </aside>
        )}
      </div>

      {preview && question && (
        <p className="border-t border-sp-border px-4 py-2 text-xs text-sp-muted xl:hidden">
          화면이 좁아 미리보기를 옆에 두지 못했어요. 창을 넓히면 오른쪽에 함께 보여요.
        </p>
      )}

      {picker && (
        <QuestionTypePicker
          onClose={() => setPicker(false)}
          onAdd={(format) => {
            add(format);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
