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
import { useMemo, useState } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { Question } from '@domain/entities/multiSurvey/Question';
import { validateSession } from '@domain/rules/multiSurveyRules';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { mapQuestionsForLiveHTML } from '@adapters/multiSurvey/live/liveBridge';
import { generateParticipationStudentPage } from '@adapters/multiSurvey/participationStudentPage';
import { groupOfQuestion, iconOfQuestion } from '@adapters/multiSurvey/questionTypeStyle';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

export const participationButton =
  'min-h-11 rounded-xl border border-sp-border px-4 py-2 hover:border-sp-accent focus-visible:ring-2 focus-visible:ring-sp-accent disabled:opacity-40';
const field =
  'w-full rounded-xl border border-sp-border bg-sp-bg p-3 text-sp-text focus:border-sp-accent focus:outline-none';
export const newParticipationQuestion = createParticipationQuestion;

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
  const [notice, setNotice] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picker, setPicker] = useState(false);
  /** 끌어서 순서 바꾸기 — 잡은 문항과 지금 올라와 있는 자리 */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const question = draft.questions[index];
  const quiz = !!question && questionHasAnswer(question);
  const dirty = JSON.stringify(draft) !== JSON.stringify(session);
  const validation = validateSession(draft);
  const emptyChoice = draft.questions.some((q) =>
    (q.type === 'multiple'
      ? q.choices
      : q.type === 'single-choice' || q.type === 'multi-choice'
        ? q.options
        : []
    ).some((o) => !o.text.trim()),
  );
  const ready = validation.ok && !emptyChoice;

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
  const save = () => {
    try {
      const store = useMultiSurveyV2Store.getState();
      store.updateSession(draft.id, {
        title: draft.title,
        questions: draft.questions,
        competitionMode: draft.competitionMode,
      });
      store.updateResponseOpts(draft.id, draft.responseOpts);
      store.updatePresentationOpts(draft.id, draft.presentationOpts);
      setNotice('저장했어요.');
      return true;
    } catch {
      setNotice('저장하지 못했어요. 이 화면의 내용을 유지하고 다시 시도해 주세요.');
      return false;
    }
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
  return (
    <div className="flex h-full flex-col bg-sp-bg text-sp-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-sp-border p-4">
        <button
          className={participationButton}
          onClick={() => (dirty ? setConfirmCancel(true) : onBack())}
        >
          목록으로
        </button>
        <div className="flex-1">
          <p className="flex items-center gap-2 text-xs">
            <span className="font-bold text-sp-accent">{PARTICIPATION_TOOL_NAME}</span>
            <span className="text-sp-muted">활동 편집</span>
          </p>
          <input
            aria-label="활동 제목"
            className="block w-full bg-transparent text-xl font-bold"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <button
          className={participationButton}
          onClick={() => setPreview(!preview)}
          aria-pressed={preview}
        >
          학생 화면 미리보기
        </button>
        <button className={participationButton} onClick={save}>
          저장
        </button>
        <button
          disabled={!ready}
          className={`${participationButton} bg-sp-accent text-white`}
          onClick={() => {
            if (save()) useMultiSurveyV2Store.getState().startLive(draft.id);
          }}
        >
          학생 초대하기
        </button>
      </header>
      <div role="status" className="px-4 py-2 text-sm text-sp-muted">
        {notice ||
          (ready
            ? '문항을 확인한 뒤 학생을 초대하세요.'
            : emptyChoice
              ? '비어 있는 보기 내용을 입력해 주세요.'
              : '질문과 정답을 입력하면 학생을 초대할 수 있어요.')}
      </div>
      {confirmCancel && (
        <div
          role="alertdialog"
          aria-label="편집 취소 확인"
          className="flex items-center gap-3 border border-sp-border p-4"
        >
          <span>저장하지 않은 변경을 취소할까요?</span>
          <button className={participationButton} onClick={onBack}>
            변경 취소하고 나가기
          </button>
          <button className={participationButton} onClick={() => setConfirmCancel(false)}>
            계속 편집
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row">
        <aside className="shrink-0 border-r border-sp-border p-4 lg:w-60">
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
                  className={`${participationButton} relative flex w-full items-center gap-2 overflow-hidden pl-4 text-left ${i === index ? 'border-2 border-sp-accent bg-sp-surface font-bold' : 'bg-sp-card'} ${dragFrom === i ? 'opacity-50' : ''}`}
                  onClick={() => {
                    setIndex(i);
                    setConfirmDelete(false);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1.5 ${groupOfQuestion(q).fill}`}
                  />
                  <span aria-hidden="true" className="cursor-grab text-sp-muted">
                    ⠿
                  </span>
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-icon-sm ${groupOfQuestion(q).text}`}
                  >
                    {iconOfQuestion(q)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {i + 1}. {q.text || '새 문항'}
                  </span>
                  {questionHasAnswer(q) && (
                    <span
                      className="shrink-0 rounded-full bg-sp-accent px-2 text-[10px] font-bold text-sp-accent-fg"
                      title="정답을 쓰는 문항"
                    >
                      정답
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button className={`${participationButton} mt-4 w-full`} onClick={() => setPicker(true)}>
            + 문항 추가
          </button>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {!question ? (
              <div className="rounded-2xl border border-dashed border-sp-border p-10 text-center">
                <h2 className="text-2xl font-bold">첫 질문부터 시작해요</h2>
                <p className="mt-3 text-sp-muted">왼쪽에서 문항의 답변 방식을 골라 주세요.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-sp-accent">{index + 1}번 문항</span>
                  <div className="flex gap-2">
                    <button
                      className={participationButton}
                      disabled={index === 0}
                      onClick={() => moveQuestion(index, index - 1)}
                    >
                      위로
                    </button>
                    <button
                      className={participationButton}
                      disabled={index >= draft.questions.length - 1}
                      onClick={() => moveQuestion(index, index + 1)}
                    >
                      아래로
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
                    <button className={participationButton} onClick={() => setConfirmDelete(true)}>
                      문항 삭제
                    </button>
                  </div>
                </div>
                {confirmDelete && (
                  <div role="alertdialog" aria-label="문항 삭제 확인">
                    <p>이 문항을 편집본에서 삭제할까요?</p>
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
                    <button className={participationButton} onClick={() => setConfirmDelete(false)}>
                      취소
                    </button>
                  </div>
                )}
                <label className="block font-bold">
                  {quiz ? '질문' : '질문 또는 논제'}
                  <textarea
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
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={question.type === 'multiple'}
                        onChange={(e) => {
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
                                question.allowMultiple === false ? 'single-choice' : 'multi-choice',
                              options: question.choices,
                              score: 0,
                            });
                        }}
                      />
                      정답 사용
                    </label>
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
                      <div key={o.id} className="flex items-center gap-3">
                        {question.type === 'multiple' && (
                          <input
                            type="checkbox"
                            aria-label={`${i + 1}번 보기 정답`}
                            className="h-6 w-6"
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
                          onChange={(e) => {
                            const next = choices.map((old) =>
                              old.id === o.id ? { ...old, text: e.target.value } : old,
                            );
                            if (question.type === 'multiple')
                              change({ ...question, choices: next });
                            else if (
                              question.type === 'single-choice' ||
                              question.type === 'multi-choice'
                            )
                              change({ ...question, options: next });
                          }}
                        />
                      </div>
                    ))}
                    {choices.length < 5 && question.presentation !== 'trafficlight' && (
                      <button
                        className={participationButton}
                        onClick={() => {
                          const next = [...choices, { id: crypto.randomUUID(), text: '' }];
                          if (question.type === 'multiple') change({ ...question, choices: next });
                          else if (
                            question.type === 'single-choice' ||
                            question.type === 'multi-choice'
                          )
                            change({ ...question, options: next });
                        }}
                      >
                        보기 추가
                      </button>
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
                        onChange={(imageUrl) => {
                          const next = choices.map((old) =>
                            old.id === o.id ? { ...old, imageUrl } : old,
                          );
                          if (question.type === 'multiple') change({ ...question, choices: next });
                          else if (
                            question.type === 'single-choice' ||
                            question.type === 'multi-choice'
                          )
                            change({ ...question, options: next });
                        }}
                      />
                    ))}
                  </details>
                )}
                {(question.type === 'short' || question.type === 'blank') && (
                  <label className="block font-bold">
                    인정할 정답 · 여러 개이면 줄바꿈
                    <textarea
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
                        className={field}
                        value={question.scaleMinLabel ?? ''}
                        onChange={(e) => change({ ...question, scaleMinLabel: e.target.value })}
                      />
                    </label>
                    <label>
                      오른쪽 입장
                      <input
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
                        className={`${field} mt-2`}
                        value={question.explanation ?? ''}
                        onChange={(e) => change({ ...question, explanation: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      정답 점수
                      <input
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
                      checked={question.collectReason ?? false}
                      onChange={(e) => change({ ...question, collectReason: e.target.checked })}
                    />
                    그렇게 생각한 이유도 함께 받기
                  </label>
                )}
              </>
            )}
            <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
              <h2 className="mb-3 font-bold">진행 방식</h2>
              {draft.questions.some(questionHasAnswer) ? (
                <>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
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
                        checked={draft.responseOpts.fastSolveBonus}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            responseOpts: {
                              ...draft.responseOpts,
                              fastSolveBonus: e.target.checked,
                            },
                          })
                        }
                      />
                      빠른 정답 보너스 · 문항별 제한 시간 안에 빠를수록 최대 50% 추가
                    </label>
                  )}
                </>
              ) : (
                <p className="text-sp-muted">
                  의견을 모은 뒤 결과를 공개하세요. 토론 후 같은 질문에 다시 응답받아 생각의 변화를
                  비교할 수 있어요.
                </p>
              )}
            </section>
          </div>
        </main>
        {preview && question && (
          <aside className="shrink-0 p-4">
            <iframe
              title="실제 학생 화면 미리보기"
              sandbox="allow-scripts"
              srcDoc={html}
              className="h-[640px] w-[360px] max-w-full rounded-3xl border border-sp-border"
            />
          </aside>
        )}
      </div>
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
