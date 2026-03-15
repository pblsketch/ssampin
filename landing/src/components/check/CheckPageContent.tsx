'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SurveyPublic } from './checkApi';
import { getSurveyPublic, checkAlreadyResponded, submitSurveyResponse, verifyPin } from './checkApi';

interface CheckPageContentProps {
  surveyId: string;
}

type ViewState = 'loading' | 'notFound' | 'expired' | 'numberSelect' | 'pinInput' | 'alreadyResponded' | 'form' | 'confirm' | 'success';

export function CheckPageContent({ surveyId }: CheckPageContentProps) {
  const [survey, setSurvey] = useState<SurveyPublic | null>(null);
  const [view, setView] = useState<ViewState>('loading');
  const [studentNumber, setStudentNumber] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Map<string, string | boolean>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  /* ── 설문 로드 ── */
  useEffect(() => {
    async function load() {
      const data = await getSurveyPublic(surveyId);
      if (!data) {
        setView('notFound');
        return;
      }

      // 마감 확인
      if (data.isClosed) {
        setSurvey(data);
        setView('expired');
        return;
      }
      if (data.dueDate) {
        const due = new Date(data.dueDate + 'T23:59:59');
        if (due < new Date()) {
          setSurvey(data);
          setView('expired');
          return;
        }
      }

      setSurvey(data);
      setView('numberSelect');
    }
    void load();
  }, [surveyId]);

  /* ── 번호 선택 후 중복 확인 ── */
  const handleNumberSelect = useCallback(async (num: number) => {
    setStudentNumber(num);
    if (survey?.pinProtection) {
      setView('pinInput');
    } else {
      const already = await checkAlreadyResponded(surveyId, num);
      setView(already ? 'alreadyResponded' : 'form');
    }
  }, [surveyId, survey?.pinProtection]);

  /* ── PIN 검증 ── */
  const handlePinVerify = useCallback(async () => {
    if (!survey || studentNumber === null || pin.length !== 4) return;
    const valid = await verifyPin(surveyId, studentNumber, pin);
    if (valid) {
      setPinError(false);
      const already = await checkAlreadyResponded(surveyId, studentNumber);
      setView(already ? 'alreadyResponded' : 'form');
    } else {
      setPinError(true);
    }
  }, [survey, studentNumber, pin, surveyId]);

  /* ── 답변 업데이트 ── */
  const updateAnswer = useCallback((questionId: string, value: string | boolean) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionId, value);
      return next;
    });
  }, []);

  /* ── 유효성 검사 ── */
  const canSubmit = survey?.questions.every((q) => {
    if (!q.required) return true;
    const val = answers.get(q.id);
    if (val === undefined || val === '') return false;
    return true;
  }) ?? false;

  /* ── 제출 ── */
  const handleSubmit = useCallback(async () => {
    if (!survey || studentNumber === null) return;
    setIsSubmitting(true);
    setError(null);

    const answerList = survey.questions.map((q) => ({
      questionId: q.id,
      value: answers.get(q.id) ?? '',
    }));

    const result = await submitSurveyResponse({
      surveyId: survey.id,
      studentNumber,
      answers: answerList,
    });

    setIsSubmitting(false);

    if (result.success) {
      setView('success');
    } else {
      setError(result.message);
    }
  }, [survey, studentNumber, answers]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-lg px-4 py-3 text-center">
          <h1 className="text-lg font-bold text-gray-900">📋 쌤핀 설문</h1>
        </div>
      </header>

      {/* 메인 */}
      <main className="mx-auto max-w-lg px-4 py-8">
        {view === 'loading' && <LoadingView />}
        {view === 'notFound' && <NotFoundView />}
        {view === 'expired' && <ExpiredView title={survey?.title} />}
        {view === 'alreadyResponded' && <AlreadyRespondedView />}
        {view === 'numberSelect' && survey && (
          <NumberSelectView
            survey={survey}
            onSelect={handleNumberSelect}
          />
        )}
        {view === 'pinInput' && studentNumber !== null && (
          <PinInputView
            studentNumber={studentNumber}
            pin={pin}
            pinError={pinError}
            onPinChange={setPin}
            onVerify={handlePinVerify}
            onBack={() => { setView('numberSelect'); setStudentNumber(null); setPin(''); setPinError(false); }}
          />
        )}
        {view === 'form' && survey && studentNumber !== null && (
          <FormView
            survey={survey}
            studentNumber={studentNumber}
            answers={answers}
            onUpdateAnswer={updateAnswer}
            onBack={() => { setView('numberSelect'); setStudentNumber(null); setAnswers(new Map()); }}
            onConfirm={() => setView('confirm')}
            canSubmit={canSubmit}
          />
        )}
        {view === 'confirm' && survey && studentNumber !== null && (
          <ConfirmView
            survey={survey}
            studentNumber={studentNumber}
            answers={answers}
            onBack={() => setView('form')}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}
        {view === 'success' && <SuccessView />}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">Powered by 쌤핀</p>
      </footer>
    </div>
  );
}

/* ──────────────── 하위 뷰 컴포넌트들 ──────────────── */

function LoadingView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">📋</div>
        <p className="text-gray-500">설문 정보를 불러오는 중...</p>
      </div>
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">❓</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">설문을 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm">링크가 올바른지 확인해주세요.</p>
      </div>
    </div>
  );
}

function ExpiredView({ title }: { title?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">⏰</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">마감되었습니다</h2>
        {title && <p className="text-gray-500 text-sm mb-1">{title}</p>}
        <p className="text-gray-400 text-sm">이 설문은 마감되어 더 이상 응답할 수 없습니다.</p>
      </div>
    </div>
  );
}

function AlreadyRespondedView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">이미 응답하셨습니다</h2>
        <p className="text-gray-500 text-sm">해당 번호는 이미 응답이 제출되었습니다.</p>
      </div>
    </div>
  );
}

function SuccessView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">응답 완료!</h2>
        <p className="text-gray-500 text-sm">설문 응답이 성공적으로 제출되었습니다.</p>
        <p className="text-gray-400 text-xs mt-2">이 창을 닫아도 됩니다.</p>
      </div>
    </div>
  );
}

/* ── 번호 선택 ── */

function NumberSelectView({
  survey,
  onSelect,
}: {
  survey: SurveyPublic;
  onSelect: (num: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const handleContinue = async () => {
    if (selected === null) return;
    setChecking(true);
    await onSelect(selected);
    setChecking(false);
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{survey.title}</h2>
        {survey.description && (
          <p className="text-sm text-gray-500 mb-4">{survey.description}</p>
        )}
        {survey.dueDate && (
          <p className="text-xs text-gray-400">마감: {survey.dueDate}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">본인의 번호를 선택하세요</h3>
        <div className="grid grid-cols-5 gap-2 mb-6">
          {Array.from({ length: survey.targetCount }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              onClick={() => setSelected(num)}
              className={`min-h-12 rounded-xl text-sm font-medium transition-all ${
                selected === num
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {num}번
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={selected === null || checking}
          className="w-full min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          {checking ? '확인 중...' : '다음'}
        </button>
      </div>
    </div>
  );
}

/* ── PIN 입력 ── */

function PinInputView({
  studentNumber,
  pin,
  pinError,
  onPinChange,
  onVerify,
  onBack,
}: {
  studentNumber: number;
  pin: string;
  pinError: boolean;
  onPinChange: (v: string) => void;
  onVerify: () => void;
  onBack: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newPin = pin.split('');
    while (newPin.length < 4) newPin.push('');
    newPin[index] = digit;
    onPinChange(newPin.join(''));

    if (digit && index < 3) {
      inputRefs[index + 1]?.current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs[index - 1]?.current?.focus();
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    await onVerify();
    setVerifying(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-gray-500">{studentNumber}번 학생</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">PIN 코드 입력</h3>
        <p className="text-sm text-gray-500 mb-6">
          선생님에게 받은 4자리 PIN 코드를 입력하세요
        </p>

        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={pin[i] ?? ''}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 ${
                pinError ? 'border-red-400 text-red-500' : 'border-gray-300 text-gray-900'
              } focus:border-blue-500 focus:outline-none transition-colors`}
            />
          ))}
        </div>

        {pinError && (
          <p className="text-sm text-red-500 mb-4">PIN이 올바르지 않습니다</p>
        )}

        <button
          onClick={() => void handleVerify()}
          disabled={pin.replace(/\s/g, '').length !== 4 || verifying}
          className="w-full min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          {verifying ? '확인 중...' : '확인'}
        </button>
      </div>
    </div>
  );
}

/* ── 응답 폼 ── */

function FormView({
  survey,
  studentNumber,
  answers,
  onUpdateAnswer,
  onBack,
  onConfirm,
  canSubmit,
}: {
  survey: SurveyPublic;
  studentNumber: number;
  answers: Map<string, string | boolean>;
  onUpdateAnswer: (qId: string, value: string | boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  canSubmit: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-gray-500">{studentNumber}번 학생</span>
      </div>

      <div className="flex flex-col gap-4">
        {survey.questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start gap-2 mb-4">
              <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-md">
                Q{idx + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{q.label}</p>
                {q.required && <span className="text-xs text-red-400">* 필수</span>}
              </div>
            </div>

            {q.type === 'yesno' && (
              <YesNoInput
                value={answers.get(q.id) as string | undefined}
                onChange={(v) => onUpdateAnswer(q.id, v)}
              />
            )}
            {q.type === 'choice' && q.options && (
              <ChoiceInput
                options={q.options}
                value={answers.get(q.id) as string | undefined}
                onChange={(v) => onUpdateAnswer(q.id, v)}
              />
            )}
            {q.type === 'text' && (
              <TextInput
                value={(answers.get(q.id) as string) ?? ''}
                onChange={(v) => onUpdateAnswer(q.id, v)}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onConfirm}
        disabled={!canSubmit}
        className="w-full min-h-12 mt-6 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        제출하기
      </button>
    </div>
  );
}

/* ── 확인 화면 ── */

function ConfirmView({
  survey,
  studentNumber,
  answers,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: {
  survey: SurveyPublic;
  studentNumber: number;
  answers: Map<string, string | boolean>;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">응답 확인</h2>
      <p className="text-sm text-gray-500 mb-6">{studentNumber}번 학생의 응답을 확인해주세요.</p>

      <div className="flex flex-col gap-3 mb-6">
        {survey.questions.map((q, idx) => {
          const val = answers.get(q.id);
          let displayVal = '-';
          if (q.type === 'yesno') {
            displayVal = val === 'yes' ? '○' : val === 'no' ? '×' : '-';
          } else if (typeof val === 'string' && val) {
            displayVal = val;
          }

          return (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Q{idx + 1}. {q.label}</p>
              <p className="text-sm font-medium text-gray-900">{displayVal}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 min-h-12 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors"
        >
          수정하기
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors"
        >
          {isSubmitting ? '제출 중...' : '제출하기'}
        </button>
      </div>
    </div>
  );
}

/* ──────────────── 입력 컴포넌트들 ──────────────── */

function YesNoInput({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => onChange('yes')}
        className={`min-h-12 rounded-xl text-sm font-bold transition-all ${
          value === 'yes'
            ? 'bg-green-500 text-white shadow-md'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        ○
      </button>
      <button
        onClick={() => onChange('no')}
        className={`min-h-12 rounded-xl text-sm font-bold transition-all ${
          value === 'no'
            ? 'bg-red-500 text-white shadow-md'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        ×
      </button>
    </div>
  );
}

function ChoiceInput({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`min-h-12 rounded-xl px-4 text-left text-sm font-medium transition-all ${
            value === opt
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="응답을 입력하세요"
      rows={3}
      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none resize-none transition-colors"
    />
  );
}
