import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import {
  createParticipationQuestion,
  questionCatalog,
  type ParticipationFormat,
} from '@adapters/multiSurvey/questionCatalog';
import { generateParticipationStudentPage } from '@adapters/multiSurvey/participationStudentPage';
import {
  mapQuestionsForLiveHTML,
  buildResponseFromLiveAnswer,
} from '@adapters/multiSurvey/live/liveBridge';
import {
  isAdvancedType,
  type AdvancedQuestion,
} from '@domain/entities/multiSurvey/AdvancedQuestion';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { QuestionResponseSummary } from './QuestionResponseSummary';
import {
  QUESTION_GROUPS,
  groupOfFormat,
  iconOfFormat,
  type QuestionGroupKey,
} from '@adapters/multiSurvey/questionTypeStyle';

function example(type: ParticipationFormat): Question {
  const q = createParticipationQuestion(type, '예시: 다음 항목에 응답해 보세요.');
  const items = [
    { id: 'a', text: '책 읽기' },
    { id: 'b', text: '산책하기' },
    { id: 'c', text: '그림 그리기' },
  ];
  if (isAdvancedType(q.type)) {
    const a = q as AdvancedQuestion;
    let imageUrl = '';
    if (q.type === 'pin' && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const styles = getComputedStyle(document.documentElement);
        ctx.fillStyle = styles.getPropertyValue('--sp-card').trim() || 'white';
        ctx.fillRect(0, 0, 600, 300);
        ctx.fillStyle = styles.getPropertyValue('--sp-accent').trim() || 'royalblue';
        ctx.fillRect(30, 40, 140, 140);
        ctx.beginPath();
        ctx.arc(300, 150, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(480, 40);
        ctx.lineTo(570, 240);
        ctx.lineTo(390, 240);
        ctx.fill();
        imageUrl = canvas.toDataURL('image/png');
      }
    }
    return {
      ...a,
      text:
        q.type === 'pin'
          ? '예시: 동그라미 안을 눌러 보세요.'
          : q.type === 'allocation'
            ? '예시: 하고 싶은 활동에 100점을 나눠 주세요.'
            : q.type === 'order'
              ? '예시: 하루의 순서로 배열해 보세요.'
              : q.type === 'valueline'
                ? '예시: 숙제를 줄여야 한다에 얼마나 동의하나요?'
                : q.type === 'quadrant'
                  ? '예시: 우리 반 할 일을 중요도와 실현 가능성으로 놓아 보세요.'
                  : q.text,
      settings: {
        ...a.settings,
        ...(q.type === 'quadrant'
          ? {
              quadrantLabels: [
                '계획해서 하기',
                '지금 바로 하기',
                '안 해도 되기',
                '빠르게 처리하기',
              ],
              maxPoints: 2,
              collectPointText: true,
            }
          : {}),
        imageUrl,
        items:
          q.type === 'order'
            ? [
                { id: 'a', text: '아침' },
                { id: 'b', text: '점심' },
                { id: 'c', text: '저녁' },
              ]
            : // 가치수직선은 가장 많이 쓰는 모습(한 줄·항목 하나)을, 매트릭스는 항목 없이 보여 준다.
              q.type === 'valueline' || q.type === 'quadrant'
              ? a.settings.items
              : items,
      },
    };
  }
  if (q.type === 'single-choice' || q.type === 'multi-choice')
    return { ...q, options: q.presentation ? q.options : items };
  if (q.type === 'multiple') return { ...q, choices: items, correctChoiceIds: ['a'] };
  return q;
}

export function QuestionTypePicker({
  onAdd,
  onClose,
}: {
  onAdd: (type: ParticipationFormat) => void;
  onClose: () => void;
}) {
  // 목록 맨 위 유형으로 시작한다 — 눈이 닿는 항목과 오른쪽 설명이 어긋나지 않게.
  const [type, setType] = useState<ParticipationFormat>(questionCatalog[0]!.type);
  const [tab, setTab] = useState<'student' | 'result'>('student');
  const [answers, setAnswers] = useState<readonly Response[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const question = useMemo(() => example(type), [type]);
  const info = questionCatalog.find((item) => item.type === type)!;
  const style = groupOfFormat(type);
  /** 같은 방식으로 답하는 유형끼리 묶어 보여 준다 — 15개를 한 줄로 늘어놓으면 고를 수 없다. */
  const grouped = useMemo(
    () =>
      (Object.keys(QUESTION_GROUPS) as QuestionGroupKey[])
        .map((key) => ({
          group: QUESTION_GROUPS[key],
          items: questionCatalog.filter((item) => groupOfFormat(item.type).key === key),
        }))
        .filter((entry) => entry.items.length > 0),
    [],
  );
  const html = useMemo(
    () =>
      generateParticipationStudentPage(
        { roomId: 'preview', title: '문항 유형 체험', purpose: 'activity', competitionMode: false },
        mapQuestionsForLiveHTML([question])[0],
      ),
    [question],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'participation-preview-answer'
      )
        return;
      const response = buildResponseFromLiveAnswer({
        question,
        studentId: 'preview',
        payload: event.data.answer,
      });
      if (response) setAnswers([response]);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [question]);
  return (
    <Modal isOpen onClose={onClose} title="문항 유형 선택" size="xl">
      <div className="flex max-h-[85vh] flex-col p-4 text-sp-text">
        <p className="mb-3 text-sm text-sp-muted">
          유형을 눌러 직접 체험해 보세요. 예시와 응답은 실제 활동에 저장되지 않습니다.
        </p>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto md:overflow-hidden md:grid-cols-[220px_1fr]">
          <nav aria-label="문항 유형" className="min-h-0 space-y-4 md:overflow-y-auto">
            {grouped.map(({ group, items }) => (
              <div key={group.key}>
                <h3 className="mb-2">
                  <span className={`text-sm font-bold ${group.text}`}>{group.label}</span>
                  <span className="ml-2 text-xs text-sp-muted">{group.hint}</span>
                </h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                  {items.map((item) => {
                    const picked = type === item.type;
                    return (
                      <button
                        key={item.type}
                        aria-pressed={picked}
                        className={`flex min-h-11 items-center gap-2 rounded-xl border bg-sp-card p-3 text-left ${
                          picked ? `border-2 ${group.border} font-bold` : 'border-sp-border'
                        }`}
                        onClick={() => {
                          setType(item.type);
                          setAnswers([]);
                          setTab('student');
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className={`material-symbols-outlined text-icon-md ${group.text}`}
                        >
                          {iconOfFormat(item.type)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <section>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${style.fill}`}
              >
                <span className="material-symbols-outlined text-icon-lg text-sp-accent-fg">
                  {iconOfFormat(type)}
                </span>
              </span>
              <div>
                <p className={`text-xs font-bold ${style.text}`}>
                  {style.label} · {style.hint}
                </p>
                <h2 className="text-xl font-bold">{info.name}</h2>
              </div>
            </div>
            <p className="my-3 text-sp-muted">{info.description}</p>
            <div className="mb-3 flex gap-2">
              <button
                className="rounded-lg border border-sp-border p-3"
                aria-pressed={tab === 'student'}
                onClick={() => setTab('student')}
              >
                학생 화면 체험
              </button>
              <button
                className="rounded-lg border border-sp-border p-3"
                aria-pressed={tab === 'result'}
                onClick={() => setTab('result')}
              >
                결과 미리보기
              </button>
            </div>
            <iframe
              ref={frame}
              key={type}
              title="문항 유형 체험"
              hidden={tab !== 'student'}
              sandbox="allow-scripts"
              srcDoc={html}
              className="h-[480px] w-full rounded-xl border border-sp-border"
            />
            {tab === 'result' && (
              <div className="rounded-xl border border-sp-border p-4">
                <p className="mb-4 text-sm text-sp-muted">
                  체험에서 제출한 응답의 표시 방식입니다. 학생 화면에서 응답하면 이곳에 반영됩니다.
                </p>
                <QuestionResponseSummary question={question} responses={answers} />
              </div>
            )}
          </section>
        </div>
        <footer className="mt-4 flex justify-end gap-3 border-t border-sp-border pt-4">
          <button className="rounded-xl border border-sp-border p-3" onClick={onClose}>
            취소
          </button>
          <button
            className="rounded-xl bg-sp-accent p-3 font-bold text-sp-accent-fg"
            onClick={() => onAdd(type)}
          >
            이 유형 추가
          </button>
        </footer>
      </div>
    </Modal>
  );
}
